const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { uploadFile, convertirAWebP } = require('../config/supabaseStorage');
const { registrarModificacion } = require('../middleware/authMiddleware');
const PREGUNTAS_POLIGRAFIA = require('../utils/preguntasPoligrafia');

// Helper: generar contraseña temporal
const generarPassword = () => 'Secu' + Math.floor(1000 + Math.random() * 9000) + '!';

// ==================== API ENDPOINTS (sin autenticación de rol) ====================
const getCiudadesPorDepartamento = async (req, res) => {
  const { id_departamento } = req.query;
  try {
    const ciudades = await query(
      'SELECT id_ciudad, ciudad FROM ciudades WHERE id_departamento = $1 ORDER BY ciudad',
      [id_departamento]
    );
    res.json(ciudades.rows);
  } catch (error) {
    console.error('Error obteniendo ciudades:', error);
    res.status(500).json({ error: 'Error al obtener ciudades' });
  }
};

const generarUsuarioSugerido = async (req, res) => {
  const { p_nombre, s_nombre, p_apellido } = req.query;
  
  try {
    if (!p_nombre || !p_apellido) {
      return res.json({ usuario: '' });
    }
    
    const normalizar = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    
    const inicial1 = normalizar(p_nombre).charAt(0);
    const inicial2 = s_nombre ? normalizar(s_nombre).charAt(0) : '';
    const apellido = normalizar(p_apellido);
    
    // Intento 1: inicial(p_nombre) + p_apellido
    let usuario = inicial1 + apellido;
    let existe = await query('SELECT id_empleado FROM empleados WHERE usuario = $1', [usuario]);
    
    if (existe.rows.length === 0) {
      return res.json({ usuario });
    }
    
    // Intento 2: inicial(p_nombre) + inicial(s_nombre) + p_apellido
    if (inicial2) {
      usuario = inicial1 + inicial2 + apellido;
      existe = await query('SELECT id_empleado FROM empleados WHERE usuario = $1', [usuario]);
      
      if (existe.rows.length === 0) {
        return res.json({ usuario });
      }
    }
    
    // Intento 3: agregar número incremental
    let contador = 1;
    const baseUsuario = inicial1 + (inicial2 || '') + apellido;
    do {
      usuario = baseUsuario + contador;
      existe = await query('SELECT id_empleado FROM empleados WHERE usuario = $1', [usuario]);
      contador++;
    } while (existe.rows.length > 0 && contador < 100);
    
    res.json({ usuario });
  } catch (error) {
    console.error('Error generando usuario:', error);
    res.status(500).json({ error: 'Error al generar usuario' });
  }
};

// API: Obtener encuestadores por tipo de servicio (basado en puestos compatibles)
const getEncuestadoresPorTipo = async (req, res) => {
  const { id_tipo_servicio } = req.query;
  try {
    const result = await query(
      `SELECT e.id_empleado,
              p.p_nombre || ' ' || p.p_apellido as nombre_completo,
              (SELECT COUNT(*) FROM servicios s 
               WHERE s.id_encuestador = e.id_empleado 
               AND s.estado_servicio IN ('Pendiente','En proceso')) as servicios_activos,
              (SELECT COUNT(*) FROM servicios s
               WHERE s.id_encuestador = e.id_empleado
               AND s.estado_servicio = 'Finalizado'
               AND s.fecha_servicio >= CURRENT_DATE - INTERVAL '30 days') as completados_mes
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       INNER JOIN empleado_rol er ON e.id_empleado = er.id_empleado
       INNER JOIN roles r ON er.id_rol = r.id_rol
       INNER JOIN empleado_puesto ep ON e.id_empleado = ep.id_empleado
       INNER JOIN tipo_servicio_puesto tsp ON ep.id_puesto = tsp.id_puesto
       WHERE r.rol = 'Encuestador'
         AND e.estado_empleado = TRUE
         AND tsp.id_tipo_servicio = $1
       GROUP BY e.id_empleado, p.p_nombre, p.p_apellido
       ORDER BY servicios_activos ASC, nombre_completo ASC`,
      [id_tipo_servicio]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json([]);
  }
};

// API: Obtener cotizaciones aceptadas por empresa
const getCotizacionesPorEmpresa = async (req, res) => {
  const { id_empresa } = req.query;
  try {
    const result = await query(
      `SELECT c.id_cotizacion, c.codigo_cotizacion 
       FROM cotizaciones c
       WHERE c.id_empresa = $1 AND c.estado_cotizacion = 'Aceptada' 
       ORDER BY c.fecha_cotizacion DESC`,
      [id_empresa]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error al cargar cotizaciones' });
  }
};

// ==================== DASHBOARD ====================
const showDashboard = async (req, res) => {
  try {
    // Estadísticas generales
    const serviciosMes = await query(
      `SELECT COUNT(*) as total FROM servicios 
       WHERE DATE_TRUNC('month', fecha_servicio) = DATE_TRUNC('month', CURRENT_DATE)`
    );

    const serviciosPendientes = await query(
      `SELECT COUNT(*) as total FROM servicios WHERE estado_servicio = 'Pendiente'`
    );

    const cotizacionesTotal = await query(
      `SELECT COALESCE(SUM(total_cotizado), 0) as total FROM cotizaciones 
       WHERE DATE_TRUNC('month', fecha_cotizacion) = DATE_TRUNC('month', CURRENT_DATE)`
    );

    const facturasTotal = await query(
      `SELECT COUNT(*) as total FROM facturas WHERE status_factura = 'Pagada'
       AND DATE_TRUNC('month', fecha_factura) = DATE_TRUNC('month', CURRENT_DATE)`
    );

    // Servicios por tipo
    const serviciosPorTipo = await query(
      `SELECT ts.tipo_servicio, COUNT(s.id_servicio) as cantidad
       FROM tipo_servicio ts
       LEFT JOIN servicios s ON ts.id_tipo_servicio = s.id_tipo_servicio
       AND DATE_TRUNC('month', s.fecha_servicio) = DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY ts.id_tipo_servicio, ts.tipo_servicio
       ORDER BY cantidad DESC`
    );

    // Cotizaciones por estado
    const cotizacionesPorEstado = await query(
      `SELECT estado_cotizacion, COUNT(*) as cantidad, COALESCE(SUM(total_cotizado), 0) as total
       FROM cotizaciones
       WHERE DATE_TRUNC('month', fecha_cotizacion) = DATE_TRUNC('month', CURRENT_DATE)
       GROUP BY estado_cotizacion`
    );

    res.render('admin/dashboard', {
      title: 'Panel de Control - SECU',
      serviciosMes: serviciosMes.rows[0].total,
      serviciosPendientes: serviciosPendientes.rows[0].total,
      cotizacionesTotal: cotizacionesTotal.rows[0].total,
      facturasTotal: facturasTotal.rows[0].total,
      serviciosPorTipo: serviciosPorTipo.rows,
      cotizacionesPorEstado: cotizacionesPorEstado.rows
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    req.session.error = 'Error al cargar el dashboard';
    res.render('admin/dashboard', {
      title: 'Panel de Control - SECU',
      serviciosMes: 0,
      serviciosPendientes: 0,
      cotizacionesTotal: 0,
      facturasTotal: 0,
      serviciosPorTipo: [],
      cotizacionesPorEstado: []
    });
  }
};

// ==================== EMPLEADOS ====================
const showEmpleados = async (req, res) => {
  try {
    const { buscar, estado } = req.query;
    let queryText = `
      SELECT e.id_empleado, e.usuario, e.estado_empleado, e.fecha_contratacion,
             p.p_nombre, p.s_nombre, p.p_apellido, p.s_apellido, p.dni, p.correo, p.telefono,
             STRING_AGG(DISTINCT pt.puesto, ', ') as puesto,
             STRING_AGG(DISTINCT r.rol, ', ') as roles
      FROM empleados e
      INNER JOIN personas p ON e.id_empleado = p.id_persona
      LEFT JOIN empleado_puesto ep ON e.id_empleado = ep.id_empleado
      LEFT JOIN puesto_trabajo pt ON ep.id_puesto = pt.id_puesto
      LEFT JOIN empleado_rol er ON e.id_empleado = er.id_empleado
      LEFT JOIN roles r ON er.id_rol = r.id_rol
    `;
    
    const params = [];
    const conditions = [];
    
    if (buscar) {
      params.push(`%${buscar}%`);
      conditions.push(`(p.p_nombre ILIKE $${params.length} OR p.p_apellido ILIKE $${params.length} OR e.usuario ILIKE $${params.length} OR p.dni ILIKE $${params.length})`);
    }
    
    if (estado !== undefined && estado !== '') {
      params.push(estado === 'true');
      conditions.push(`e.estado_empleado = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }
    
    queryText += ' GROUP BY e.id_empleado, p.id_persona';

    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM (${queryText}) sub`,
      [...params]
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    queryText += ' ORDER BY p.p_apellido, p.p_nombre';
    params.push(limit);
    params.push(offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const empleados = await query(queryText, params);
    const puestos = await query('SELECT * FROM puesto_trabajo ORDER BY puesto');
    const roles = await query('SELECT * FROM roles ORDER BY rol');
    const departamentos = await query('SELECT * FROM departamentos ORDER BY departamento');

    res.render('admin/empleados/index', {
      title: 'Gestión de Empleados - SECU',
      empleados: empleados.rows,
      puestos: puestos.rows,
      roles: roles.rows,
      departamentos: departamentos.rows,
      filtros: { buscar: buscar || '', estado: estado || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error listando empleados:', error);
    req.session.error = 'Error al cargar los empleados';
    res.render('admin/empleados/index', {
      title: 'Gestión de Empleados - SECU',
      empleados: [],
      puestos: [],
      roles: [],
      departamentos: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
  }
};

const showNuevoEmpleado = async (req, res) => {
  try {
    const puestos = await query('SELECT * FROM puesto_trabajo ORDER BY puesto');
    const roles = await query('SELECT * FROM roles ORDER BY rol');
    const departamentos = await query('SELECT * FROM departamentos ORDER BY departamento');
    const ciudades = await query('SELECT c.*, d.departamento FROM ciudades c INNER JOIN departamentos d ON c.id_departamento = d.id_departamento ORDER BY d.departamento, c.ciudad');

    res.render('admin/empleados/nuevo', {
      title: 'Nuevo Empleado - SECU',
      puestos: puestos.rows,
      roles: roles.rows,
      departamentos: departamentos.rows,
      ciudades: ciudades.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/admin/empleados');
  }
};

const createEmpleado = async (req, res) => {
  const { 
    p_nombre, s_nombre, p_apellido, s_apellido, dni, correo, telefono, 
    direccion, genero, fecha_nacimiento, id_ciudad,
    usuario, fecha_contratacion, roles, puestos: puestosSeleccionados 
  } = req.body;
  let { contrasenia } = req.body;

  try {
    // Generar contraseña si viene vacía
    const passwordGenerada = !contrasenia || contrasenia.trim() === '';
    if (passwordGenerada) {
      contrasenia = generarPassword();
    }

    // Verificar si el DNI ya existe
    const dniExiste = await query('SELECT id_persona FROM personas WHERE dni = $1', [dni]);
    if (dniExiste.rows.length > 0) {
      req.session.error = 'El DNI ya está registrado';
      return res.redirect('/admin/empleados/nuevo');
    }

    // Verificar si el usuario ya existe
    const usuarioExiste = await query('SELECT id_empleado FROM empleados WHERE usuario = $1', [usuario]);
    if (usuarioExiste.rows.length > 0) {
      req.session.error = 'El nombre de usuario ya está en uso';
      return res.redirect('/admin/empleados/nuevo');
    }

    // Verificar si el correo ya existe
    const correoExiste = await query('SELECT id_persona FROM personas WHERE correo = $1', [correo]);
    if (correoExiste.rows.length > 0) {
      req.session.error = 'El correo electrónico ya está registrado';
      return res.redirect('/admin/empleados/nuevo');
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(contrasenia, 10);

    // Insertar persona
    const personaResult = await query(
      `INSERT INTO personas (p_nombre, s_nombre, p_apellido, s_apellido, dni, correo, telefono, direccion, genero, fecha_nacimiento, id_ciudad)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id_persona`,
      [p_nombre, s_nombre || '', p_apellido, s_apellido || '', dni, correo, telefono, direccion, genero, fecha_nacimiento, id_ciudad]
    );

    const idPersona = personaResult.rows[0].id_persona;

    // Insertar empleado (sin id_puesto)
    await query(
      `INSERT INTO empleados (id_empleado, usuario, contrasenia, requiere_cambio, fecha_contratacion)
       VALUES ($1, $2, $3, TRUE, $4)`,
      [idPersona, usuario, hashedPassword, fecha_contratacion]
    );

    // Insertar puestos en la tabla intermedia
    const puestosArray = Array.isArray(puestosSeleccionados) ? puestosSeleccionados : puestosSeleccionados ? [puestosSeleccionados] : [];
    for (const idPuesto of puestosArray) {
      if (idPuesto) {
        await query(
          'INSERT INTO empleado_puesto (id_empleado, id_puesto) VALUES ($1, $2)',
          [idPersona, idPuesto]
        );
      }
    }

    // Insertar roles
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    for (const idRol of rolesArray) {
      if (idRol) {
        await query(
          'INSERT INTO empleado_rol (id_empleado, id_rol) VALUES ($1, $2)',
          [idPersona, idRol]
        );
      }
    }

    if (passwordGenerada) {
      req.session.success = `Empleado creado correctamente. Contraseña temporal: ${contrasenia}`;
    } else {
      req.session.success = 'Empleado creado correctamente';
    }
    res.redirect('/admin/empleados');
  } catch (error) {
    console.error('Error creando empleado:', error);
    req.session.error = 'Error al crear el empleado';
    res.redirect('/admin/empleados/nuevo');
  }
};

const showEditarEmpleado = async (req, res) => {
  const { id } = req.params;
  try {
    const empleado = await query(
      `SELECT e.*, p.*
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       WHERE e.id_empleado = $1`,
      [id]
    );

    if (empleado.rows.length === 0) {
      req.session.error = 'Empleado no encontrado';
      return res.redirect('/admin/empleados');
    }

    const rolesEmpleado = await query(
      'SELECT id_rol FROM empleado_rol WHERE id_empleado = $1',
      [id]
    );

    const puestosEmpleado = await query(
      'SELECT id_puesto FROM empleado_puesto WHERE id_empleado = $1',
      [id]
    );

    const puestos = await query('SELECT * FROM puesto_trabajo ORDER BY puesto');
    const roles = await query('SELECT * FROM roles ORDER BY rol');
    const departamentos = await query('SELECT * FROM departamentos ORDER BY departamento');
    const ciudades = await query('SELECT c.*, d.departamento FROM ciudades c INNER JOIN departamentos d ON c.id_departamento = d.id_departamento ORDER BY d.departamento, c.ciudad');

    res.render('admin/empleados/editar', {
      title: 'Editar Empleado - SECU',
      empleado: empleado.rows[0],
      rolesEmpleado: rolesEmpleado.rows.map(r => r.id_rol),
      puestosEmpleado: puestosEmpleado.rows.map(p => p.id_puesto),
      puestos: puestos.rows,
      roles: roles.rows,
      departamentos: departamentos.rows,
      ciudades: ciudades.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el empleado';
    res.redirect('/admin/empleados');
  }
};

const updateEmpleado = async (req, res) => {
  const { id } = req.params;
  const { 
    p_nombre, s_nombre, p_apellido, s_apellido, correo, telefono, 
    direccion, genero, fecha_nacimiento, id_ciudad,
    usuario, fecha_contratacion, estado_empleado, roles, puestos: puestosSeleccionados 
  } = req.body;

  try {
    // Actualizar persona
    await query(
      `UPDATE personas SET p_nombre = $1, s_nombre = $2, p_apellido = $3, s_apellido = $4, 
       correo = $5, telefono = $6, direccion = $7, genero = $8, fecha_nacimiento = $9, id_ciudad = $10
       WHERE id_persona = $11`,
      [p_nombre, s_nombre || '', p_apellido, s_apellido || '', correo, telefono, direccion, genero, fecha_nacimiento, id_ciudad, id]
    );

    // Actualizar empleado (sin id_puesto)
    await query(
      `UPDATE empleados SET usuario = $1, fecha_contratacion = $2, estado_empleado = $3
       WHERE id_empleado = $4`,
      [usuario, fecha_contratacion, estado_empleado === 'true', id]
    );

    // Actualizar puestos en la tabla intermedia
    await query('DELETE FROM empleado_puesto WHERE id_empleado = $1', [id]);
    const puestosArray = Array.isArray(puestosSeleccionados) ? puestosSeleccionados : puestosSeleccionados ? [puestosSeleccionados] : [];
    for (const idPuesto of puestosArray) {
      if (idPuesto) {
        await query(
          'INSERT INTO empleado_puesto (id_empleado, id_puesto) VALUES ($1, $2)',
          [id, idPuesto]
        );
      }
    }

    // Actualizar roles
    await query('DELETE FROM empleado_rol WHERE id_empleado = $1', [id]);
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    for (const idRol of rolesArray) {
      if (idRol) {
        await query(
          'INSERT INTO empleado_rol (id_empleado, id_rol) VALUES ($1, $2)',
          [id, idRol]
        );
      }
    }

    // Registrar modificación
    await registrarModificacion('empleados', id, 'datos_generales', null, 'Actualización de datos', req.session.user.id_empleado);

    req.session.success = 'Empleado actualizado correctamente';
    res.redirect('/admin/empleados');
  } catch (error) {
    console.error('Error actualizando empleado:', error);
    req.session.error = 'Error al actualizar el empleado';
    res.redirect(`/admin/empleados/editar/${id}`);
  }
};

const resetPassword = async (req, res) => {
  const { id } = req.params;
  let { nueva_contrasenia } = req.body;

  try {
    // Generar contraseña si viene vacía
    const passwordGenerada = !nueva_contrasenia || nueva_contrasenia.trim() === '';
    if (passwordGenerada) {
      nueva_contrasenia = generarPassword();
    }

    const hashedPassword = await bcrypt.hash(nueva_contrasenia, 10);
    await query(
      `UPDATE empleados SET contrasenia = $1, requiere_cambio = TRUE WHERE id_empleado = $2`,
      [hashedPassword, id]
    );

    await registrarModificacion('empleados', id, 'contrasenia', null, 'Restablecimiento por administrador', req.session.user.id_empleado);

    if (passwordGenerada) {
      req.session.success = `Contraseña restablecida. Nueva contraseña temporal: ${nueva_contrasenia}`;
    } else {
      req.session.success = 'Contraseña restablecida correctamente';
    }
    res.redirect('/admin/empleados');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al restablecer la contraseña';
    res.redirect('/admin/empleados');
  }
};

// ==================== EMPRESAS ====================
const showEmpresas = async (req, res) => {
  try {
    const { buscar } = req.query;
    let queryText = 'SELECT * FROM empresas';
    const params = [];
    
    if (buscar) {
      params.push(`%${buscar}%`);
      queryText += ' WHERE empresa ILIKE $1';
    }
    
    queryText += ' ORDER BY empresa';
    
    const empresas = await query(queryText, params);

    res.render('admin/empresas/index', {
      title: 'Gestión de Empresas - SECU',
      empresas: empresas.rows,
      filtros: { buscar: buscar || '' }
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar las empresas';
    res.render('admin/empresas/index', {
      title: 'Gestión de Empresas - SECU',
      empresas: [],
      filtros: {}
    });
  }
};

const createEmpresa = async (req, res) => {
  const { empresa } = req.body;
  try {
    await query('INSERT INTO empresas (empresa) VALUES ($1)', [empresa]);
    req.session.success = 'Empresa creada correctamente';
    res.redirect('/admin/empresas');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al crear la empresa';
    res.redirect('/admin/empresas');
  }
};

const updateEmpresa = async (req, res) => {
  const { id } = req.params;
  const { empresa } = req.body;
  try {
    await query('UPDATE empresas SET empresa = $1 WHERE id_empresa = $2', [empresa, id]);
    req.session.success = 'Empresa actualizada correctamente';
    res.redirect('/admin/empresas');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar la empresa';
    res.redirect('/admin/empresas');
  }
};

// ==================== SERVICIOS ====================
const showServicios = async (req, res) => {
  try {
    const { buscar, estado, tipo, empresa } = req.query;
    let queryText = `
      SELECT s.*, ts.tipo_servicio, e.empresa,
             p.p_nombre || ' ' || p.p_apellido as candidato_nombre,
             COALESCE(enc_p.p_nombre || ' ' || enc_p.p_apellido, 'Sin asignar') as encuestador_nombre,
             c.ciudad
      FROM servicios s
      INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
      INNER JOIN empresas e ON s.id_empresa = e.id_empresa
      INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
      INNER JOIN personas p ON cand.id_candidato = p.id_persona
      INNER JOIN ciudades c ON s.id_ciudad = c.id_ciudad
      LEFT JOIN empleados enc ON s.id_encuestador = enc.id_empleado
      LEFT JOIN personas enc_p ON enc.id_empleado = enc_p.id_persona
    `;
    
    const params = [];
    const conditions = [];
    
    if (buscar) {
      params.push(`%${buscar}%`);
      conditions.push(`(p.p_nombre ILIKE $${params.length} OR p.p_apellido ILIKE $${params.length} OR e.empresa ILIKE $${params.length})`);
    }
    
    if (estado) {
      params.push(estado);
      conditions.push(`s.estado_servicio = $${params.length}`);
    }
    
    if (tipo) {
      params.push(tipo);
      conditions.push(`s.id_tipo_servicio = $${params.length}`);
    }
    
    if (empresa) {
      params.push(empresa);
      conditions.push(`s.id_empresa = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM (${queryText}${conditions.length > 0 ? '' : ''}) sub`,
      [...params]
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    queryText += ' ORDER BY s.fecha_servicio DESC';
    params.push(limit);
    params.push(offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const servicios = await query(queryText, params);
    const tiposServicio = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('admin/servicios/index', {
      title: 'Gestión de Servicios - SECU',
      servicios: servicios.rows,
      tiposServicio: tiposServicio.rows,
      empresas: empresas.rows,
      filtros: { buscar: buscar || '', estado: estado || '', tipo: tipo || '', empresa: empresa || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar los servicios';
    res.render('admin/servicios/index', {
      title: 'Gestión de Servicios - SECU',
      servicios: [],
      tiposServicio: [],
      empresas: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
  }
};

const showDetalleServicio = async (req, res) => {
  const { id } = req.params;
  try {
    const servicio = await query(
      `SELECT s.*, ts.tipo_servicio, ts.precio_actual, e.empresa,
              p.p_nombre, p.s_nombre, p.p_apellido, p.s_apellido, p.dni, p.correo, p.telefono,
              COALESCE(enc_p.p_nombre || ' ' || enc_p.p_apellido, 'Sin asignar') as encuestador_nombre,
              c.ciudad, d.departamento,
              f.numero_factura, f.status_factura,
              cot.codigo_cotizacion, cot.estado_cotizacion
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
       INNER JOIN personas p ON cand.id_candidato = p.id_persona
       INNER JOIN ciudades c ON s.id_ciudad = c.id_ciudad
       INNER JOIN departamentos d ON c.id_departamento = d.id_departamento
       LEFT JOIN empleados enc ON s.id_encuestador = enc.id_empleado
       LEFT JOIN personas enc_p ON enc.id_empleado = enc_p.id_persona
       LEFT JOIN facturas f ON s.id_factura = f.id_factura
       LEFT JOIN cotizaciones cot ON s.id_cotizacion = cot.id_cotizacion
       WHERE s.id_servicio = $1`,
      [id]
    );

    if (servicio.rows.length === 0) {
      req.session.error = 'Servicio no encontrado';
      return res.redirect('/admin/servicios');
    }

    // Obtener formularios asociados
    const poligrafia = await query(
      'SELECT * FROM formulario_poligrafia WHERE id_servicio = $1',
      [id]
    );
    const socioeconomico = await query(
      'SELECT * FROM formulario_socioeconomico WHERE id_servicio = $1',
      [id]
    );
    const psicometrico = await query(
      'SELECT * FROM formulario_psicometrico WHERE id_servicio = $1',
      [id]
    );

    res.render('admin/servicios/detalle', {
      title: 'Detalle de Servicio - SECU',
      servicio: servicio.rows[0],
      poligrafia: poligrafia.rows[0] || null,
      socioeconomico: socioeconomico.rows[0] || null,
      psicometrico: psicometrico.rows[0] || null
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el servicio';
    res.redirect('/admin/servicios');
  }
};

// ==================== COTIZACIONES ====================
const showCotizaciones = async (req, res) => {
  try {
    const { buscar, estado, empresa } = req.query;
    let queryText = `
      SELECT c.*, e.empresa
       FROM cotizaciones c
       INNER JOIN empresas e ON c.id_empresa = e.id_empresa
    `;
    
    const params = [];
    const conditions = [];
    
    if (buscar) {
      params.push(`%${buscar}%`);
      conditions.push(`(c.codigo_cotizacion ILIKE $${params.length} OR e.empresa ILIKE $${params.length})`);
    }
    
    if (empresa) {
      params.push(empresa);
      conditions.push(`c.id_empresa = $${params.length}`);
    }
    
    if (estado) {
      params.push(estado);
      conditions.push(`c.estado_cotizacion = $${params.length}`);
    }
    
    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM (${queryText}) sub`,
      [...params]
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    queryText += ' ORDER BY c.fecha_cotizacion DESC';
    params.push(limit);
    params.push(offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const cotizaciones = await query(queryText, params);
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('admin/cotizaciones/index', {
      title: 'Gestion de Cotizaciones - SECU',
      cotizaciones: cotizaciones.rows,
      empresas: empresas.rows,
      filtros: { buscar: buscar || '', estado: estado || '', empresa: empresa || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar las cotizaciones';
    res.render('admin/cotizaciones/index', {
      title: 'Gestion de Cotizaciones - SECU',
      cotizaciones: [],
      empresas: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
  }
};

const showDetalleCotizacion = async (req, res) => {
  const { id } = req.params;
  try {
    const cotizacion = await query(
      `SELECT c.*, e.empresa
       FROM cotizaciones c
       INNER JOIN empresas e ON c.id_empresa = e.id_empresa
       WHERE c.id_cotizacion = $1`,
      [id]
    );

    if (cotizacion.rows.length === 0) {
      req.session.error = 'Cotizacion no encontrada';
      return res.redirect('/admin/cotizaciones');
    }

    const detalles = await query(
      `SELECT cd.*, ts.tipo_servicio
       FROM cotizacion_detalle cd
       INNER JOIN tipo_servicio ts ON cd.id_tipo_servicio = ts.id_tipo_servicio
       WHERE cd.id_cotizacion = $1
       ORDER BY cd.id_detalle`,
      [id]
    );

    res.render('admin/cotizaciones/detalle', {
      title: 'Detalle de Cotizacion - SECU',
      cotizacion: cotizacion.rows[0],
      detalles: detalles.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar la cotizacion';
    res.redirect('/admin/cotizaciones');
  }
};

const showNuevaCotizacion = async (req, res) => {
  try {
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');
    const tiposServicio = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');

    res.render('admin/cotizaciones/nuevo', {
      title: 'Nueva Cotizacion - SECU',
      empresas: empresas.rows,
      tiposServicio: tiposServicio.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/admin/cotizaciones');
  }
};

const createCotizacion = async (req, res) => {
  const { id_empresa, fecha_cotizacion, vigencia_dias, contacto, observaciones } = req.body;

  try {
    // El formulario envia arrays planos: id_tipo_servicio[], cantidad[], precio_unitario[]
    const tiposRaw    = req.body['id_tipo_servicio[]'] || req.body.id_tipo_servicio;
    const cantidadesRaw = req.body['cantidad[]']        || req.body.cantidad;
    const preciosRaw  = req.body['precio_unitario[]']   || req.body.precio_unitario;

    const tipos     = Array.isArray(tiposRaw)    ? tiposRaw    : [tiposRaw];
    const cantidades = Array.isArray(cantidadesRaw) ? cantidadesRaw : [cantidadesRaw];
    const precios   = Array.isArray(preciosRaw)  ? preciosRaw  : [preciosRaw];

    // Calcular totales
    let subtotal = 0;
    for (let i = 0; i < tipos.length; i++) {
      if (tipos[i] && cantidades[i] && precios[i]) {
        subtotal += parseFloat(cantidades[i]) * parseFloat(precios[i]);
      }
    }

    const impuesto = subtotal * 0.15;
    const total = subtotal + impuesto;

    // Generar codigo
    const fecha = new Date();
    const codigo = `COT-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

    // Insertar cabecera
    const cotizacionResult = await query(
      `INSERT INTO cotizaciones (codigo_cotizacion, id_empresa, fecha_cotizacion, subtotal, impuesto_iva, total_cotizado, estado_cotizacion)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pendiente') RETURNING id_cotizacion`,
      [codigo, id_empresa, fecha_cotizacion || new Date().toISOString().split('T')[0], subtotal, impuesto, total]
    );

    const idCotizacion = cotizacionResult.rows[0].id_cotizacion;

    // Insertar lineas de detalle
    for (let i = 0; i < tipos.length; i++) {
      if (tipos[i] && cantidades[i] && precios[i]) {
        const subtotalLinea = parseFloat(cantidades[i]) * parseFloat(precios[i]);
        await query(
          `INSERT INTO cotizacion_detalle (id_cotizacion, id_tipo_servicio, cantidad, precio_unitario, subtotal_linea)
           VALUES ($1, $2, $3, $4, $5)`,
          [idCotizacion, tipos[i], cantidades[i], precios[i], subtotalLinea]
        );
      }
    }

    req.session.success = `Cotizacion ${codigo} creada correctamente`;
    res.redirect('/admin/cotizaciones');
  } catch (error) {
    console.error('Error creando cotizacion:', error);
    req.session.error = 'Error al crear la cotizacion: ' + error.message;
    res.redirect('/admin/cotizaciones/nuevo');
  }
};

const updateEstadoCotizacion = async (req, res) => {
  const { id } = req.params;
  const { estado_cotizacion } = req.body;

  try {
    await query(
      'UPDATE cotizaciones SET estado_cotizacion = $1 WHERE id_cotizacion = $2',
      [estado_cotizacion, id]
    );

    await registrarModificacion('cotizaciones', id, 'estado_cotizacion', null, estado_cotizacion, req.session.user.id_empleado);

    req.session.success = 'Estado de cotizacion actualizado';
    res.redirect(`/admin/cotizaciones/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el estado';
    res.redirect(`/admin/cotizaciones/${id}`);
  }
};

const deleteCotizacion = async (req, res) => {
  const { id } = req.params;
  try {
    const cot = await query('SELECT estado_cotizacion FROM cotizaciones WHERE id_cotizacion = $1', [id]);
    if (!cot.rows[0] || cot.rows[0].estado_cotizacion !== 'Pendiente') {
      req.session.error = 'Solo se pueden eliminar cotizaciones en estado Pendiente';
      return res.redirect('/admin/cotizaciones');
    }
    const facturasRel = await query('SELECT COUNT(*) as total FROM facturas WHERE id_cotizacion = $1', [id]);
    if (parseInt(facturasRel.rows[0].total) > 0) {
      req.session.error = 'No se puede eliminar: esta cotizacion tiene facturas relacionadas';
      return res.redirect('/admin/cotizaciones');
    }
    await query('DELETE FROM cotizacion_detalle WHERE id_cotizacion = $1', [id]);
    await query('DELETE FROM cotizaciones WHERE id_cotizacion = $1', [id]);
    req.session.success = 'Cotizacion eliminada correctamente';
    res.redirect('/admin/cotizaciones');
  } catch(error) {
    console.error('Error:', error);
    req.session.error = 'Error al eliminar la cotizacion';
    res.redirect('/admin/cotizaciones');
  }
};

// ==================== FACTURAS ====================
const showFacturas = async (req, res) => {
  try {
    const { buscar, estado, fecha_desde, fecha_hasta } = req.query;
    let queryText = `
      SELECT f.*, e.empresa,
             COALESCE((SELECT SUM(ts.precio_actual) FROM servicios s 
                       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio 
                       WHERE s.id_factura = f.id_factura), 0) as monto_total
       FROM facturas f
       INNER JOIN empresas e ON f.id_empresa = e.id_empresa
    `;
    
    const params = [];
    const conditions = [];
    
    if (buscar) {
      params.push(`%${buscar}%`);
      conditions.push(`(f.numero_factura ILIKE $${params.length} OR e.empresa ILIKE $${params.length})`);
    }
    
    if (estado) {
      params.push(estado);
      conditions.push(`f.status_factura = $${params.length}`);
    }
    
    if (fecha_desde) {
      params.push(fecha_desde);
      conditions.push(`f.fecha_factura >= $${params.length}`);
    }
    
    if (fecha_hasta) {
      params.push(fecha_hasta);
      conditions.push(`f.fecha_factura <= $${params.length}`);
    }
    
    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM (${queryText}) sub`,
      [...params]
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    queryText += ' ORDER BY f.fecha_factura DESC';
    params.push(limit);
    params.push(offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const facturas = await query(queryText, params);

    res.render('admin/facturas/index', {
      title: 'Gestion de Facturas - SECU',
      facturas: facturas.rows,
      filtros: { buscar: buscar || '', estado: estado || '', fecha_desde: fecha_desde || '', fecha_hasta: fecha_hasta || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar las facturas';
    res.render('admin/facturas/index', {
      title: 'Gestion de Facturas - SECU',
      facturas: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
  }
};

const updateEstadoFactura = async (req, res) => {
  const { id } = req.params;
  const { status_factura } = req.body;
  try {
    await query('UPDATE facturas SET status_factura = $1 WHERE id_factura = $2', [status_factura, id]);
    req.session.success = 'Estado de factura actualizado';
    res.redirect('/admin/facturas');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el estado';
    res.redirect('/admin/facturas');
  }
};

const showNuevaFactura = async (req, res) => {
  try {
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');
    
    // Cargar cotizaciones aceptadas
    const cotizaciones = await query(
      `SELECT c.id_cotizacion, c.codigo_cotizacion, e.empresa
       FROM cotizaciones c 
       INNER JOIN empresas e ON c.id_empresa = e.id_empresa
       WHERE c.estado_cotizacion = 'Aceptada' 
       ORDER BY c.fecha_cotizacion DESC`
    );

    res.render('admin/facturas/nuevo', {
      title: 'Nueva Factura - SECU',
      empresas: empresas.rows,
      cotizaciones: cotizaciones.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/admin/facturas');
  }
};

const createFactura = async (req, res) => {
  const { id_empresa, numero_factura, fecha_factura, status_factura, monto_total, id_cotizacion } = req.body;
  const archivo = req.file;

  try {
    let urlImagen = null;

    // Subir archivo a Supabase si existe
    if (archivo) {
      const { buffer, mimetype, extension } = await convertirAWebP(archivo.buffer, archivo.mimetype);
      const nombreBase = archivo.originalname.replace(/\.[^.]+$/, '');
      const nombreFinal = extension ? nombreBase + extension : archivo.originalname;
      const filePath = `facturas/${Date.now()}-${nombreFinal}`;
      urlImagen = await uploadFile('documentos', filePath, buffer, mimetype);
    }

    await query(
      `INSERT INTO facturas (id_empresa, numero_factura, fecha_factura, status_factura, url_imagen_factura, monto_total, id_cotizacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id_empresa, numero_factura, fecha_factura || null, status_factura, urlImagen, monto_total || null, id_cotizacion || null]
    );

    req.session.success = 'Factura registrada correctamente';
    res.redirect('/admin/facturas');
  } catch (error) {
    console.error('Error creando factura:', error);
    req.session.error = 'Error al registrar la factura';
    res.redirect('/admin/facturas');
  }
};

// ==================== TIPOS DE SERVICIO ====================
const showTiposServicio = async (req, res) => {
  try {
    const tipos = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');
    res.render('admin/tipos-servicio/index', {
      title: 'Tipos de Servicio - SECU',
      tipos: tipos.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar los tipos de servicio';
    res.render('admin/tipos-servicio/index', {
      title: 'Tipos de Servicio - SECU',
      tipos: []
    });
  }
};

const createTipoServicio = async (req, res) => {
  const { tipo_servicio, precio_actual } = req.body;
  try {
    await query(
      'INSERT INTO tipo_servicio (tipo_servicio, precio_actual) VALUES ($1, $2)',
      [tipo_servicio, precio_actual]
    );
    req.session.success = 'Tipo de servicio creado correctamente';
    res.redirect('/admin/tipos-servicio');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al crear el tipo de servicio';
    res.redirect('/admin/tipos-servicio');
  }
};

const updateTipoServicio = async (req, res) => {
  const { id } = req.params;
  const { tipo_servicio, precio_actual } = req.body;
  try {
    await query(
      'UPDATE tipo_servicio SET tipo_servicio = $1, precio_actual = $2 WHERE id_tipo_servicio = $3',
      [tipo_servicio, precio_actual, id]
    );
    req.session.success = 'Tipo de servicio actualizado correctamente';
    res.redirect('/admin/tipos-servicio');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el tipo de servicio';
    res.redirect('/admin/tipos-servicio');
  }
};

const deleteTipoServicio = async (req, res) => {
  const { id } = req.params;
  try {
    // Verificar si hay servicios usando este tipo
    const servicios = await query(
      'SELECT COUNT(*) as total FROM servicios WHERE id_tipo_servicio = $1',
      [id]
    );
    
    if (parseInt(servicios.rows[0].total) > 0) {
      req.session.error = `No se puede eliminar: hay ${servicios.rows[0].total} servicio(s) usando este tipo de servicio`;
      return res.redirect('/admin/tipos-servicio');
    }
    
    await query('DELETE FROM tipo_servicio WHERE id_tipo_servicio = $1', [id]);
    req.session.success = 'Tipo de servicio eliminado correctamente';
    res.redirect('/admin/tipos-servicio');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al eliminar el tipo de servicio';
    res.redirect('/admin/tipos-servicio');
  }
};

// ==================== PUESTOS DE TRABAJO ====================
const showPuestos = async (req, res) => {
  try {
    const puestos = await query('SELECT * FROM puesto_trabajo ORDER BY puesto');
    res.render('admin/puestos/index', {
      title: 'Puestos de Trabajo - SECU',
      puestos: puestos.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar los puestos';
    res.render('admin/puestos/index', {
      title: 'Puestos de Trabajo - SECU',
      puestos: []
    });
  }
};

const createPuesto = async (req, res) => {
  const { puesto } = req.body;
  try {
    await query('INSERT INTO puesto_trabajo (puesto) VALUES ($1)', [puesto]);
    req.session.success = 'Puesto creado correctamente';
    res.redirect('/admin/puestos');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al crear el puesto';
    res.redirect('/admin/puestos');
  }
};

const updatePuesto = async (req, res) => {
  const { id } = req.params;
  const { puesto } = req.body;
  try {
    await query('UPDATE puesto_trabajo SET puesto = $1 WHERE id_puesto = $2', [puesto, id]);
    req.session.success = 'Puesto actualizado correctamente';
    res.redirect('/admin/puestos');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el puesto';
    res.redirect('/admin/puestos');
  }
};

const deletePuesto = async (req, res) => {
  const { id } = req.params;
  try {
  // Verificar si hay empleados usando este puesto (ahora en tabla intermedia)
  const referencias = await query(
  'SELECT COUNT(*) as total FROM empleado_puesto WHERE id_puesto = $1',
  [id]
  );
  
  if (parseInt(referencias.rows[0].total) > 0) {
  req.session.error = `No se puede eliminar: hay ${referencias.rows[0].total} empleado(s) asignado(s) a este puesto`;
  return res.redirect('/admin/puestos');
  }
  
  await query('DELETE FROM puesto_trabajo WHERE id_puesto = $1', [id]);
  req.session.success = 'Puesto eliminado correctamente';
    res.redirect('/admin/puestos');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al eliminar el puesto';
    res.redirect('/admin/puestos');
  }
};

// ==================== EXPEDIENTES ====================
const showExpedientes = async (req, res) => {
  try {
    const { buscar, estado, empresa, fecha_desde, fecha_hasta } = req.query;
    let queryText = `
      SELECT exp.*, 
             p.p_nombre || ' ' || p.p_apellido as candidato_nombre, p.dni,
             e.empresa,
             (SELECT COUNT(*) FROM servicios s WHERE s.id_expediente = exp.id_expediente) as num_servicios
      FROM expedientes exp
      INNER JOIN candidatos c ON exp.id_candidato = c.id_candidato
      INNER JOIN personas p ON c.id_candidato = p.id_persona
      INNER JOIN empresas e ON exp.id_empresa = e.id_empresa
    `;
    
    const params = [];
    const conditions = [];
    
    if (buscar) {
      params.push(`%${buscar}%`);
      conditions.push(`(p.p_nombre ILIKE $${params.length} OR p.p_apellido ILIKE $${params.length} OR p.dni ILIKE $${params.length})`);
    }
    
    if (estado) {
      params.push(estado);
      conditions.push(`exp.estado = $${params.length}`);
    }
    
    if (empresa) {
      params.push(empresa);
      conditions.push(`exp.id_empresa = $${params.length}`);
    }
    
    if (fecha_desde) {
      params.push(fecha_desde);
      conditions.push(`exp.fecha_expediente >= $${params.length}`);
    }
    
    if (fecha_hasta) {
      params.push(fecha_hasta);
      conditions.push(`exp.fecha_expediente <= $${params.length}`);
    }
    
    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM (${queryText}) sub`,
      [...params]
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    queryText += ' ORDER BY exp.fecha_expediente DESC';
    params.push(limit);
    params.push(offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const expedientes = await query(queryText, params);
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('admin/expedientes/index', {
      title: 'Gestión de Expedientes - SECU',
      expedientes: expedientes.rows,
      empresas: empresas.rows,
      filtros: { buscar: buscar || '', estado: estado || '', empresa: empresa || '', fecha_desde: fecha_desde || '', fecha_hasta: fecha_hasta || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar los expedientes';
    res.render('admin/expedientes/index', {
      title: 'Gestión de Expedientes - SECU',
      expedientes: [],
      empresas: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
  }
};

const showDetalleExpediente = async (req, res) => {
  const { id } = req.params;
  try {
    const expediente = await query(
      `SELECT exp.*, 
              p.p_nombre, p.s_nombre, p.p_apellido, p.s_apellido, p.dni, p.correo, p.telefono,
              p.direccion as candidato_direccion,
              ci.id_ciudad as candidato_id_ciudad,
              ci.ciudad as candidato_ciudad,
              d.id_departamento as candidato_id_depto,
              d.departamento as candidato_departamento,
              e.empresa
       FROM expedientes exp
       INNER JOIN candidatos c ON exp.id_candidato = c.id_candidato
       INNER JOIN personas p ON c.id_candidato = p.id_persona
       INNER JOIN empresas e ON exp.id_empresa = e.id_empresa
       INNER JOIN ciudades ci ON p.id_ciudad = ci.id_ciudad
       INNER JOIN departamentos d ON ci.id_departamento = d.id_departamento
       WHERE exp.id_expediente = $1`,
      [id]
    );

    if (expediente.rows.length === 0) {
      req.session.error = 'Expediente no encontrado';
      return res.redirect('/admin/expedientes');
    }

    // Obtener servicios del expediente
    const servicios = await query(
      `SELECT s.*, ts.tipo_servicio, ts.precio_actual,
              COALESCE(enc_p.p_nombre || ' ' || enc_p.p_apellido, 'Sin asignar') as encuestador_nombre,
              c.ciudad, c.id_departamento,
              f.numero_factura,
              COALESCE(
                (SELECT fp.id_poligrafia IS NOT NULL FROM formulario_poligrafia fp WHERE fp.id_servicio = s.id_servicio AND fp.estado_formulario = 'Finalizado'),
                (SELECT fs.id_socioeconomico IS NOT NULL FROM formulario_socioeconomico fs WHERE fs.id_servicio = s.id_servicio AND fs.estado_formulario = 'Finalizado'),
                (SELECT fpc.id_psicometrico IS NOT NULL FROM formulario_psicometrico fpc WHERE fpc.id_servicio = s.id_servicio AND fpc.estado_formulario = 'Finalizado'),
                FALSE
              ) as formulario_bloqueado
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN ciudades c ON s.id_ciudad = c.id_ciudad
       LEFT JOIN empleados enc ON s.id_encuestador = enc.id_empleado
       LEFT JOIN personas enc_p ON enc.id_empleado = enc_p.id_persona
       LEFT JOIN facturas f ON s.id_factura = f.id_factura
       WHERE s.id_expediente = $1
       ORDER BY s.fecha_servicio`,
      [id]
    );

    // Calcular totales financieros
    const subtotal = servicios.rows.reduce((sum, s) => sum + parseFloat(s.precio_actual || 0), 0);
    const iva = subtotal * 0.15;
    const total = subtotal + iva;

    // Datos para el modal de agregar servicio
    const tiposServicio = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');
    const encuestadores = await query(
      `SELECT DISTINCT e.id_empleado, p.p_nombre, p.p_apellido,
              ARRAY_AGG(DISTINCT tsp.id_tipo_servicio) as tipos_compatibles
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       INNER JOIN empleado_rol er ON e.id_empleado = er.id_empleado
       INNER JOIN roles r ON er.id_rol = r.id_rol
       LEFT JOIN empleado_puesto ep ON e.id_empleado = ep.id_empleado
       LEFT JOIN tipo_servicio_puesto tsp ON ep.id_puesto = tsp.id_puesto
       WHERE r.rol = 'Encuestador' AND e.estado_empleado = TRUE
       GROUP BY e.id_empleado, p.p_nombre, p.p_apellido
       ORDER BY p.p_apellido, p.p_nombre`
    );
    
    // Cargar departamentos para cascada
    const departamentos = await query('SELECT * FROM departamentos ORDER BY departamento');
    
    // Cargar facturas de la empresa del expediente
    const facturas = await query(
      `SELECT id_factura, numero_factura, fecha_factura, monto_total
       FROM facturas WHERE id_empresa = $1 ORDER BY fecha_factura DESC`,
      [expediente.rows[0].id_empresa]
    );

    // Obtener IDs de Francisco Morazán y Tegucigalpa para autocompletado
    const fmorazan = await query(
      "SELECT id_departamento FROM departamentos WHERE departamento ILIKE '%Francisco Mor%' LIMIT 1"
    );
    const tegucigalpa = await query(
      "SELECT id_ciudad FROM ciudades WHERE ciudad ILIKE '%Tegucigalpa%' LIMIT 1"
    );

    res.render('admin/expedientes/detalle', {
      title: 'Detalle de Expediente - SECU',
      expediente: expediente.rows[0],
      servicios: servicios.rows,
      tiposServicio: tiposServicio.rows,
      encuestadores: encuestadores.rows,
      departamentos: departamentos.rows,
      facturas: facturas.rows,
      subtotal,
      iva,
      total,
      idDeptoFM: fmorazan.rows[0]?.id_departamento || null,
      idCiudadTGU: tegucigalpa.rows[0]?.id_ciudad || null
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el expediente';
    res.redirect('/admin/expedientes');
  }
};

const showInformeExpediente = async (req, res) => {
  const { id } = req.params;
  try {
    // Datos del expediente + candidato + empresa
    const expediente = await query(
      `SELECT exp.*, 
              p.p_nombre, p.s_nombre, p.p_apellido, p.s_apellido, p.dni, p.correo, p.telefono,
              p.direccion, p.genero, p.fecha_nacimiento,
              e.empresa
       FROM expedientes exp
       INNER JOIN candidatos c ON exp.id_candidato = c.id_candidato
       INNER JOIN personas p ON c.id_candidato = p.id_persona
       INNER JOIN empresas e ON exp.id_empresa = e.id_empresa
       WHERE exp.id_expediente = $1`,
      [id]
    );

    if (expediente.rows.length === 0) {
      req.session.error = 'Expediente no encontrado';
      return res.redirect('/admin/expedientes');
    }

    // Servicios con formularios
    const servicios = await query(
      `SELECT s.*, ts.tipo_servicio,
              COALESCE(enc_p.p_nombre || ' ' || enc_p.p_apellido, 'Sin asignar') as encuestador_nombre
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       LEFT JOIN empleados enc ON s.id_encuestador = enc.id_empleado
       LEFT JOIN personas enc_p ON enc.id_empleado = enc_p.id_persona
       WHERE s.id_expediente = $1
       ORDER BY s.fecha_servicio`,
      [id]
    );

    // Para cada servicio, obtener sus formularios
    const serviciosConFormularios = [];
    for (const servicio of servicios.rows) {
      const socioeconomico = await query(
        'SELECT * FROM formulario_socioeconomico WHERE id_servicio = $1',
        [servicio.id_servicio]
      );
      const poligrafia = await query(
        'SELECT * FROM formulario_poligrafia WHERE id_servicio = $1',
        [servicio.id_servicio]
      );
      const psicometrico = await query(
        'SELECT * FROM formulario_psicometrico WHERE id_servicio = $1',
        [servicio.id_servicio]
      );

      // Obtener respuestas de poligrafía si existe
      let respuestasPoligrafia = [];
      if (poligrafia.rows.length > 0) {
        const resp = await query(
          'SELECT * FROM respuestas_poligrafia WHERE id_poligrafia = $1 ORDER BY numero_pregunta',
          [poligrafia.rows[0].id_poligrafia]
        );
        respuestasPoligrafia = resp.rows;
      }

      // Obtener documentos del socioeconómico si existe
      let documentosSocioeconomico = [];
      if (socioeconomico.rows.length > 0) {
        const docs = await query(
          'SELECT * FROM documentos_socioeconomico WHERE id_socioeconomico = $1',
          [socioeconomico.rows[0].id_socioeconomico]
        );
        documentosSocioeconomico = docs.rows;
      }

      serviciosConFormularios.push({
        ...servicio,
        socioeconomico: socioeconomico.rows[0] || null,
        poligrafia: poligrafia.rows[0] || null,
        respuestasPoligrafia,
        psicometrico: psicometrico.rows[0] || null,
        documentosSocioeconomico
      });
    }

    res.render('admin/expedientes/informe', {
      title: 'Informe de Expediente - SECU',
      expediente: expediente.rows[0],
      servicios: serviciosConFormularios,
      fechaGeneracion: new Date()
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al generar el informe';
    res.redirect('/admin/expedientes');
  }
};

const showFormulariosServicio = async (req, res) => {
  const { id } = req.params; // id del servicio
  try {
    const servicio = await query(
      `SELECT s.*, ts.tipo_servicio, e.empresa,
              p.p_nombre, p.p_apellido, p.dni
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       INNER JOIN candidatos c ON s.id_candidato = c.id_candidato
       INNER JOIN personas p ON c.id_candidato = p.id_persona
       WHERE s.id_servicio = $1`,
      [id]
    );

    if (servicio.rows.length === 0) {
      req.session.error = 'Servicio no encontrado';
      return res.redirect('/admin/expedientes');
    }

    const socioeconomico = await query(
      'SELECT * FROM formulario_socioeconomico WHERE id_servicio = $1',
      [id]
    );
    const poligrafia = await query(
      'SELECT * FROM formulario_poligrafia WHERE id_servicio = $1',
      [id]
    );
    const psicometrico = await query(
      'SELECT * FROM formulario_psicometrico WHERE id_servicio = $1',
      [id]
    );

    // Respuestas de poligrafía
    let respuestasPoligrafia = [];
    if (poligrafia.rows.length > 0) {
      const resp = await query(
        'SELECT * FROM respuestas_poligrafia WHERE id_poligrafia = $1 ORDER BY numero_pregunta',
        [poligrafia.rows[0].id_poligrafia]
      );
      respuestasPoligrafia = resp.rows;
    }

    // Documentos del socioeconómico
    let documentosSocioeconomico = [];
    if (socioeconomico.rows.length > 0) {
      const docs = await query(
        'SELECT * FROM documentos_socioeconomico WHERE id_socioeconomico = $1',
        [socioeconomico.rows[0].id_socioeconomico]
      );
      documentosSocioeconomico = docs.rows;
    }

    res.render('admin/servicios/formularios', {
      title: 'Formularios del Servicio - SECU',
      servicio: servicio.rows[0],
      socioeconomico: socioeconomico.rows[0] || null,
      poligrafia: poligrafia.rows[0] || null,
      respuestasPoligrafia,
      psicometrico: psicometrico.rows[0] || null,
      documentosSocioeconomico,
      preguntasPoligrafia: Object.fromEntries(PREGUNTAS_POLIGRAFIA.map(p => [p.numero, p.pregunta]))
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar los formularios';
    res.redirect('/admin/expedientes');
  }
};

const reabrirFormulario = async (req, res) => {
  const { id } = req.params; // id del servicio
  try {
    // Bug 4 fix: obtener tipo de servicio para saber qué formulario resetear
    const servicio = await query(
      `SELECT s.id_tipo_servicio, ts.tipo_servicio 
       FROM servicios s 
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       WHERE s.id_servicio = $1`,
      [id]
    );

    if (servicio.rows.length === 0) {
      req.session.error = 'Servicio no encontrado';
      return res.redirect(`/admin/servicios/${id}/formularios`);
    }

    const tipoNorm = servicio.rows[0].tipo_servicio.toLowerCase();

    // 1. Desbloquear el servicio y volver estado_servicio a 'En proceso'
    await query(
      `UPDATE servicios 
       SET formulario_bloqueado = FALSE, estado_servicio = 'En proceso' 
       WHERE id_servicio = $1`,
      [id]
    );

    // 2. Resetear estado_formulario del formulario correspondiente
    if (tipoNorm.includes('socioecon')) {
      await query(
        `UPDATE formulario_socioeconomico SET estado_formulario = 'En proceso' WHERE id_servicio = $1`,
        [id]
      );
    } else if (tipoNorm.includes('poligraf')) {
      await query(
        `UPDATE formulario_poligrafia SET estado_formulario = 'En proceso', firma_evaluador = FALSE WHERE id_servicio = $1`,
        [id]
      );
    } else if (tipoNorm.includes('psico')) {
      await query(
        `UPDATE formulario_psicometrico SET estado_formulario = 'En proceso' WHERE id_servicio = $1`,
        [id]
      );
    }

    await registrarModificacion('servicios', id, 'formulario_bloqueado', 'TRUE', 'FALSE - Reabierto por admin', req.session.user.id_empleado);
    
    req.session.success = 'Formulario reabierto. El encuestador puede volver a editarlo.';
    res.redirect(`/admin/servicios/${id}/formularios`);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al reabrir el formulario';
    res.redirect(`/admin/servicios/${id}/formularios`);
  }
};

// ==================== AUDITORÍA ====================
const showAuditoria = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;
    const pageLogin = parseInt(req.query.page_login) || 1;
    const pageMod   = parseInt(req.query.page_mod)   || 1;
    const limit = 10;

    // Cerrar sesiones huérfanas (sin cierre y con más de 24h de antigüedad)
    await query(
      `UPDATE actividad_login
       SET fecha_cierra_sesion = fecha_inicio_sesion + INTERVAL '8 hours'
       WHERE fecha_cierra_sesion IS NULL
       AND fecha_inicio_sesion < NOW() - INTERVAL '24 hours'`
    );

    // ── Actividad de login ──────────────────────────────────────────────────
    let loginQuery = `
      SELECT al.*, p.p_nombre || ' ' || p.p_apellido as empleado_nombre, e.usuario
      FROM actividad_login al
      INNER JOIN empleados e ON al.id_empleado = e.id_empleado
      INNER JOIN personas p ON e.id_empleado = p.id_persona
    `;
    const loginParams = [];
    const loginConditions = [];

    if (fecha_inicio) {
      loginParams.push(fecha_inicio);
      loginConditions.push(`DATE(al.fecha_inicio_sesion) >= $${loginParams.length}`);
    }
    if (fecha_fin) {
      loginParams.push(fecha_fin);
      loginConditions.push(`DATE(al.fecha_inicio_sesion) <= $${loginParams.length}`);
    }
    if (loginConditions.length > 0) loginQuery += ' WHERE ' + loginConditions.join(' AND ');

    const loginCountRes = await query(`SELECT COUNT(*) as total FROM (${loginQuery}) sub`, loginParams);
    const totalLogin = parseInt(loginCountRes.rows[0].total);
    const totalPagesLogin = Math.ceil(totalLogin / limit);

    const loginParamsFinal = [...loginParams, limit, (pageLogin - 1) * limit];
    const loginQueryFinal = loginQuery + ` ORDER BY al.fecha_inicio_sesion DESC LIMIT $${loginParamsFinal.length - 1} OFFSET $${loginParamsFinal.length}`;
    const loginActividad = await query(loginQueryFinal, loginParamsFinal);

    // ── Historial de modificaciones ─────────────────────────────────────────
    let historialQuery = `
      SELECT hm.*, p.p_nombre || ' ' || p.p_apellido as empleado_nombre, e.usuario
      FROM historial_modificaciones hm
      INNER JOIN empleados e ON hm.id_empleado = e.id_empleado
      INNER JOIN personas p ON e.id_empleado = p.id_persona
    `;
    const historialParams = [];
    const historialConditions = [];

    if (fecha_inicio) {
      historialParams.push(fecha_inicio);
      historialConditions.push(`DATE(hm.fecha_modificacion) >= $${historialParams.length}`);
    }
    if (fecha_fin) {
      historialParams.push(fecha_fin);
      historialConditions.push(`DATE(hm.fecha_modificacion) <= $${historialParams.length}`);
    }
    if (historialConditions.length > 0) historialQuery += ' WHERE ' + historialConditions.join(' AND ');

    const modCountRes = await query(`SELECT COUNT(*) as total FROM (${historialQuery}) sub`, historialParams);
    const totalMod = parseInt(modCountRes.rows[0].total);
    const totalPagesMod = Math.ceil(totalMod / limit);

    const histParamsFinal = [...historialParams, limit, (pageMod - 1) * limit];
    const histQueryFinal = historialQuery + ` ORDER BY hm.fecha_modificacion DESC LIMIT $${histParamsFinal.length - 1} OFFSET $${histParamsFinal.length}`;
    const historialModificaciones = await query(histQueryFinal, histParamsFinal);

    res.render('admin/auditoria/index', {
      title: 'Auditoría del Sistema - SECU',
      loginActividad: loginActividad.rows,
      historialModificaciones: historialModificaciones.rows,
      filtros: { fecha_inicio: fecha_inicio || '', fecha_fin: fecha_fin || '' },
      pageLogin, pageMod, totalPagesLogin, totalPagesMod, totalLogin, totalMod
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar la auditoría';
    res.render('admin/auditoria/index', {
      title: 'Auditoría del Sistema - SECU',
      loginActividad: [],
      historialModificaciones: [],
      filtros: {},
      pageLogin: 1, pageMod: 1, totalPagesLogin: 1, totalPagesMod: 1, totalLogin: 0, totalMod: 0
    });
  }
};

// ==================== REPORTES ====================
const showReportes = async (req, res) => {
  res.render('admin/reportes/index', {
    title: 'Reportes - SECU'
  });
};

const generarReporteServicios = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, tipo, estado, empresa } = req.query;
    
    // Construir condiciones de filtro
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (fecha_inicio) {
      params.push(fecha_inicio);
      whereClause += ` AND s.fecha_servicio >= $${params.length}`;
    }
    if (fecha_fin) {
      params.push(fecha_fin);
      whereClause += ` AND s.fecha_servicio <= $${params.length}`;
    }
    if (tipo) {
      params.push(tipo);
      whereClause += ` AND s.id_tipo_servicio = $${params.length}`;
    }
    if (estado) {
      params.push(estado);
      whereClause += ` AND s.estado_servicio = $${params.length}`;
    }
    if (empresa) {
      params.push(empresa);
      whereClause += ` AND s.id_empresa = $${params.length}`;
    }
    
    // Query principal
    const queryText = `
      SELECT s.*, ts.tipo_servicio, e.empresa,
             p.p_nombre || ' ' || p.p_apellido as candidato_nombre,
             c.ciudad, d.departamento
      FROM servicios s
      INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
      INNER JOIN empresas e ON s.id_empresa = e.id_empresa
      INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
      INNER JOIN personas p ON cand.id_candidato = p.id_persona
      INNER JOIN ciudades c ON s.id_ciudad = c.id_ciudad
      INNER JOIN departamentos d ON c.id_departamento = d.id_departamento
      ${whereClause}
      ORDER BY s.fecha_servicio DESC
    `;
    
    // Agrupación por tipo de servicio (para gráfica)
    const queryPorTipo = `
      SELECT ts.tipo_servicio, COUNT(*) as total
      FROM servicios s
      INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
      ${whereClause}
      GROUP BY ts.tipo_servicio
      ORDER BY total DESC
    `;
    
    // Agrupación por estado (para gráfica donut)
    const queryPorEstado = `
      SELECT s.estado_servicio, COUNT(*) as total
      FROM servicios s
      ${whereClause}
      GROUP BY s.estado_servicio
      ORDER BY total DESC
    `;
    
    const servicios = await query(queryText, params);
    const porTipo = await query(queryPorTipo, params);
    const porEstado = await query(queryPorEstado, params);
    const tiposServicio = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('admin/reportes/servicios', {
      title: 'Reporte de Servicios - SECU',
      servicios: servicios.rows,
      porTipo: porTipo.rows,
      porEstado: porEstado.rows,
      tiposServicio: tiposServicio.rows,
      empresas: empresas.rows,
      filtros: { fecha_inicio: fecha_inicio || '', fecha_fin: fecha_fin || '', tipo: tipo || '', estado: estado || '', empresa: empresa || '' }
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al generar el reporte';
    res.redirect('/admin/reportes');
  }
};

// Reporte de Expedientes
const generarReporteExpedientes = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, estado, empresa } = req.query;
    
    // Construir condiciones de filtro
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (fecha_inicio) {
      params.push(fecha_inicio);
      whereClause += ` AND exp.fecha_expediente >= $${params.length}`;
    }
    if (fecha_fin) {
      params.push(fecha_fin);
      whereClause += ` AND exp.fecha_expediente <= $${params.length}`;
    }
    if (estado) {
      params.push(estado);
      whereClause += ` AND exp.estado = $${params.length}`;
    }
    if (empresa) {
      params.push(empresa);
      whereClause += ` AND exp.id_empresa = $${params.length}`;
    }
    
    // Query principal
    const queryText = `
      SELECT exp.*, 
             p.p_nombre || ' ' || p.p_apellido as candidato_nombre, p.dni,
             e.empresa,
             (SELECT COUNT(*) FROM servicios s WHERE s.id_expediente = exp.id_expediente) as num_servicios
      FROM expedientes exp
      INNER JOIN candidatos c ON exp.id_candidato = c.id_candidato
      INNER JOIN personas p ON c.id_candidato = p.id_persona
      INNER JOIN empresas e ON exp.id_empresa = e.id_empresa
      ${whereClause}
      ORDER BY exp.fecha_expediente DESC
    `;
    
    // Agrupacion por estado (donut)
    const queryPorEstado = `
      SELECT exp.estado, COUNT(*) as total
      FROM expedientes exp
      ${whereClause}
      GROUP BY exp.estado
      ORDER BY total DESC
    `;
    
    // Expedientes por empresa top 10 (barras horizontales)
    const queryPorEmpresa = `
      SELECT e.empresa, COUNT(*) as total
      FROM expedientes exp
      INNER JOIN empresas e ON exp.id_empresa = e.id_empresa
      ${whereClause}
      GROUP BY e.empresa
      ORDER BY total DESC
      LIMIT 10
    `;
    
    // Expedientes creados por mes ultimos 6 meses (linea)
    const queryPorMes = `
      SELECT TO_CHAR(exp.fecha_expediente, 'YYYY-MM') as mes, 
             TO_CHAR(exp.fecha_expediente, 'Mon YYYY') as mes_label,
             COUNT(*) as total
      FROM expedientes exp
      WHERE exp.fecha_expediente >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY TO_CHAR(exp.fecha_expediente, 'YYYY-MM'), TO_CHAR(exp.fecha_expediente, 'Mon YYYY')
      ORDER BY mes ASC
    `;
    
    const expedientes = await query(queryText, params);
    const porEstado = await query(queryPorEstado, params);
    const porEmpresa = await query(queryPorEmpresa, params);
    const porMes = await query(queryPorMes);
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('admin/reportes/expedientes', {
      title: 'Reporte de Expedientes - SECU',
      expedientes: expedientes.rows,
      porEstado: porEstado.rows,
      porEmpresa: porEmpresa.rows,
      porMes: porMes.rows,
      empresas: empresas.rows,
      filtros: { fecha_inicio: fecha_inicio || '', fecha_fin: fecha_fin || '', estado: estado || '', empresa: empresa || '' }
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al generar el reporte';
    res.redirect('/admin/reportes');
  }
};

// Reporte de Cotizaciones
const generarReporteCotizaciones = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, estado, empresa } = req.query;
    
    // Construir condiciones de filtro
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (fecha_inicio) {
      params.push(fecha_inicio);
      whereClause += ` AND c.fecha_cotizacion >= $${params.length}`;
    }
    if (fecha_fin) {
      params.push(fecha_fin);
      whereClause += ` AND c.fecha_cotizacion <= $${params.length}`;
    }
    if (estado) {
      params.push(estado);
      whereClause += ` AND c.estado_cotizacion = $${params.length}`;
    }
    if (empresa) {
      params.push(empresa);
      whereClause += ` AND c.id_empresa = $${params.length}`;
    }
    
    // Query principal
    const queryText = `
      SELECT c.*, e.empresa
      FROM cotizaciones c
      INNER JOIN empresas e ON c.id_empresa = e.id_empresa
      ${whereClause}
      ORDER BY c.fecha_cotizacion DESC
    `;
    
    // Totales resumen
    const queryTotales = `
      SELECT 
        COUNT(*) as total_cotizaciones,
        COALESCE(SUM(c.total_cotizado), 0) as total_cotizado,
        COALESCE(SUM(CASE WHEN c.estado_cotizacion = 'Aceptada' THEN c.total_cotizado ELSE 0 END), 0) as total_aceptadas,
        COUNT(CASE WHEN c.estado_cotizacion = 'Aceptada' THEN 1 END) as num_aceptadas
      FROM cotizaciones c
      INNER JOIN empresas e ON c.id_empresa = e.id_empresa
      ${whereClause}
    `;
    
    // Agrupacion por estado (donut)
    const queryPorEstado = `
      SELECT c.estado_cotizacion as estado, COUNT(*) as total
      FROM cotizaciones c
      INNER JOIN empresas e ON c.id_empresa = e.id_empresa
      ${whereClause}
      GROUP BY c.estado_cotizacion
      ORDER BY total DESC
    `;
    
    // Monto por empresa top 10 (barras)
    const queryPorEmpresa = `
      SELECT e.empresa, COALESCE(SUM(c.total_cotizado), 0) as total
      FROM cotizaciones c
      INNER JOIN empresas e ON c.id_empresa = e.id_empresa
      ${whereClause}
      GROUP BY e.empresa
      ORDER BY total DESC
      LIMIT 10
    `;
    
    // Cotizaciones por mes ultimos 6 meses (linea) — respeta los filtros activos
    const queryPorMes = `
      SELECT TO_CHAR(c.fecha_cotizacion, 'YYYY-MM') as mes, 
             TO_CHAR(c.fecha_cotizacion, 'Mon YYYY') as mes_label,
             COUNT(*) as cantidad,
             COALESCE(SUM(c.total_cotizado), 0) as importe
      FROM cotizaciones c
      INNER JOIN empresas e ON c.id_empresa = e.id_empresa
      ${whereClause}
      AND c.fecha_cotizacion >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY TO_CHAR(c.fecha_cotizacion, 'YYYY-MM'), TO_CHAR(c.fecha_cotizacion, 'Mon YYYY')
      ORDER BY mes ASC
    `;
    
    const cotizaciones = await query(queryText, params);
    const totales = await query(queryTotales, params);
    const porEstado = await query(queryPorEstado, params);
    const porEmpresa = await query(queryPorEmpresa, params);
    const porMes = await query(queryPorMes, params);
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');
    
    const resumenTotales = totales.rows[0];
    const tasaConversion = resumenTotales.total_cotizaciones > 0 
      ? ((resumenTotales.num_aceptadas / resumenTotales.total_cotizaciones) * 100).toFixed(1)
      : 0;

    res.render('admin/reportes/cotizaciones', {
      title: 'Reporte de Cotizaciones - SECU',
      cotizaciones: cotizaciones.rows,
      totales: resumenTotales,
      tasaConversion,
      porEstado: porEstado.rows,
      porEmpresa: porEmpresa.rows,
      porMes: porMes.rows,
      empresas: empresas.rows,
      filtros: { fecha_inicio: fecha_inicio || '', fecha_fin: fecha_fin || '', estado: estado || '', empresa: empresa || '' }
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al generar el reporte';
    res.redirect('/admin/reportes');
  }
};

// Reporte de Productividad de Encuestadores
const generarReporteEncuestadores = async (req, res) => {
  try {
    // Obtener todos los encuestadores con sus metricas
    const queryEncuestadores = `
      SELECT 
        e.id_empleado,
        p.p_nombre || ' ' || p.p_apellido as nombre,
        STRING_AGG(DISTINCT pt.puesto, ', ') as puestos,
        COUNT(s.id_servicio) as total_asignados,
        COUNT(CASE WHEN s.estado_servicio = 'Finalizado' THEN 1 END) as total_completados,
        COUNT(CASE WHEN s.estado_servicio IN ('Pendiente', 'En proceso') 
                   AND s.fecha_limite < CURRENT_DATE THEN 1 END) as vencidos,
        ROUND(AVG(
          CASE WHEN s.estado_servicio = 'Finalizado' 
               THEN EXTRACT(DAY FROM (
                 COALESCE(
                   (SELECT MAX(fecha_ultima_actualizacion) FROM formulario_poligrafia fp WHERE fp.id_servicio = s.id_servicio),
                   (SELECT MAX(fecha_ultima_actualizacion) FROM formulario_socioeconomico fs WHERE fs.id_servicio = s.id_servicio),
                   (SELECT MAX(fecha_ultima_actualizacion) FROM formulario_psicometrico fpm WHERE fpm.id_servicio = s.id_servicio),
                   s.fecha_servicio
                 ) - s.fecha_servicio
               ))
          END
        ), 1) as promedio_dias
      FROM empleados e
      INNER JOIN personas p ON e.id_empleado = p.id_persona
      INNER JOIN empleado_rol er ON e.id_empleado = er.id_empleado
      INNER JOIN roles r ON er.id_rol = r.id_rol
      LEFT JOIN empleado_puesto ep ON e.id_empleado = ep.id_empleado
      LEFT JOIN puesto_trabajo pt ON ep.id_puesto = pt.id_puesto
      LEFT JOIN servicios s ON e.id_empleado = s.id_encuestador
      WHERE r.rol = 'Encuestador' AND e.estado_empleado = TRUE
      GROUP BY e.id_empleado, p.p_nombre, p.p_apellido
      ORDER BY total_completados DESC
    `;
    
    const encuestadores = await query(queryEncuestadores);
    
    // Calcular tasa de cumplimiento para cada encuestador
    const encuestadoresConTasa = encuestadores.rows.map(enc => ({
      ...enc,
      tasa_cumplimiento: enc.total_asignados > 0 
        ? ((enc.total_completados / enc.total_asignados) * 100).toFixed(1)
        : 0
    }));
    
    // Top encuestadores por servicios completados
    const topCompletados = encuestadoresConTasa
      .filter(e => e.total_completados > 0)
      .sort((a, b) => b.total_completados - a.total_completados)
      .slice(0, 10);
    
    // Tasa de cumplimiento por encuestador (solo con asignados > 0)
    const tasaCumplimiento = encuestadoresConTasa
      .filter(e => e.total_asignados > 0)
      .sort((a, b) => parseFloat(b.tasa_cumplimiento) - parseFloat(a.tasa_cumplimiento))
      .slice(0, 10);

    res.render('admin/reportes/encuestadores', {
      title: 'Reporte de Encuestadores - SECU',
      encuestadores: encuestadoresConTasa,
      topCompletados,
      tasaCumplimiento
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al generar el reporte';
    res.redirect('/admin/reportes');
  }
};

const updateEstadoExpediente = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  try {
    await query('UPDATE expedientes SET estado = $1 WHERE id_expediente = $2', [estado, id]);
    req.session.success = 'Estado del expediente actualizado';
    res.redirect(`/admin/expedientes/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el estado';
    res.redirect(`/admin/expedientes/${id}`);
  }
};

const showNuevoExpediente = async (req, res) => {
  try {
    const candidatos = await query(
      `SELECT c.id_candidato, p.p_nombre, p.s_nombre, p.p_apellido, p.s_apellido, p.dni
       FROM candidatos c
       INNER JOIN personas p ON c.id_candidato = p.id_persona
       ORDER BY p.p_apellido, p.p_nombre`
    );
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('admin/expedientes/nuevo', {
      title: 'Nuevo Expediente - SECU',
      candidatos: candidatos.rows,
      empresas: empresas.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/admin/expedientes');
  }
};

const createExpediente = async (req, res) => {
  const { id_candidato, id_empresa, observaciones } = req.body;

  try {
    await query(
      `INSERT INTO expedientes (id_candidato, id_empresa, observaciones)
       VALUES ($1, $2, $3)`,
      [id_candidato, id_empresa, observaciones || null]
    );

    req.session.success = 'Expediente creado correctamente';
    res.redirect('/admin/expedientes');
  } catch (error) {
    console.error('Error creando expediente:', error);
    req.session.error = 'Error al crear el expediente';
    res.redirect('/admin/expedientes/nuevo');
  }
};

const deleteExpediente = async (req, res) => {
  const { id } = req.params;

  try {
    const servicios = await query('SELECT COUNT(*) as total FROM servicios WHERE id_expediente = $1', [id]);
    if (parseInt(servicios.rows[0].total) > 0) {
      req.session.error = 'No se puede eliminar un expediente con servicios';
      return res.redirect(`/admin/expedientes/${id}`);
    }
    await query('DELETE FROM expedientes WHERE id_expediente = $1', [id]);
    req.session.success = 'Expediente eliminado';
    res.redirect('/admin/expedientes');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al eliminar el expediente';
    res.redirect(`/admin/expedientes/${id}`);
  }
};

const deleteServicioExpediente = async (req, res) => {
  const { idExp, idServ } = req.params;
  const redirectTo = req.query.redirect || `/admin/expedientes/${idExp}`;
  try {
    const srv = await query(
      'SELECT estado_servicio, formulario_bloqueado FROM servicios WHERE id_servicio = $1 AND id_expediente = $2',
      [idServ, idExp]
    );
    if (srv.rows.length === 0) {
      req.session.error = 'Servicio no encontrado';
      return res.redirect(redirectTo);
    }
    if (srv.rows[0].estado_servicio !== 'Pendiente' || srv.rows[0].formulario_bloqueado) {
      req.session.error = 'Solo se pueden eliminar servicios en estado Pendiente sin formularios iniciados';
      return res.redirect(redirectTo);
    }
    await query('DELETE FROM servicios WHERE id_servicio = $1', [idServ]);
    req.session.success = 'Servicio eliminado correctamente';
    res.redirect(redirectTo);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al eliminar el servicio';
    res.redirect(redirectTo);
  }
};

// ==================== CARGA DE ENCUESTADORES ====================
const showCargaEncuestadores = async (req, res) => {
  try {
    const { buscar, puesto, fecha_desde, fecha_hasta, page } = req.query;
    const pageNum = parseInt(page) || 1;
    const limit = 10;
    const offset = (pageNum - 1) * limit;

    let whereExtra = '';
    const params = [];

    if (buscar) {
      params.push(`%${buscar}%`);
      whereExtra += ` AND (p.p_nombre || ' ' || p.p_apellido) ILIKE $${params.length}`;
    }
    if (puesto) {
      params.push(puesto);
      whereExtra += ` AND EXISTS (SELECT 1 FROM empleado_puesto ep2 INNER JOIN puesto_trabajo pt2 ON ep2.id_puesto = pt2.id_puesto WHERE ep2.id_empleado = e.id_empleado AND pt2.puesto = $${params.length})`;
    }

    // Condición de rango de fechas para subqueries de conteo
    let fechaCond = '';
    if (fecha_desde && fecha_hasta) {
      fechaCond = `AND s.fecha_servicio BETWEEN '${fecha_desde}' AND '${fecha_hasta}'`;
    } else if (fecha_desde) {
      fechaCond = `AND s.fecha_servicio >= '${fecha_desde}'`;
    } else if (fecha_hasta) {
      fechaCond = `AND s.fecha_servicio <= '${fecha_hasta}'`;
    }

    const countResult = await query(
      `SELECT COUNT(DISTINCT e.id_empleado) as total
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       INNER JOIN empleado_rol er ON e.id_empleado = er.id_empleado
       INNER JOIN roles r ON er.id_rol = r.id_rol
       WHERE r.rol = 'Encuestador' AND e.estado_empleado = TRUE
       ${whereExtra}`,
      [...params]
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    params.push(limit);
    params.push(offset);

    const result = await query(
      `SELECT e.id_empleado,
              p.p_nombre || ' ' || p.p_apellido as nombre,
              (SELECT STRING_AGG(pt2.puesto, ', ')
               FROM empleado_puesto ep2
               INNER JOIN puesto_trabajo pt2 ON ep2.id_puesto = pt2.id_puesto
               WHERE ep2.id_empleado = e.id_empleado) as puestos,
              (SELECT COUNT(*) FROM servicios s
               WHERE s.id_encuestador = e.id_empleado
               AND s.estado_servicio = 'Pendiente' ${fechaCond}) as pendientes,
              (SELECT COUNT(*) FROM servicios s
               WHERE s.id_encuestador = e.id_empleado
               AND s.estado_servicio = 'En proceso' ${fechaCond}) as en_proceso,
              (SELECT COUNT(*) FROM servicios s
               WHERE s.id_encuestador = e.id_empleado
               AND s.estado_servicio IN ('Pendiente','En proceso') ${fechaCond}) as total_activos,
              (SELECT COUNT(*) FROM servicios s
               WHERE s.id_encuestador = e.id_empleado
               AND s.estado_servicio = 'Finalizado' ${fechaCond}) as completados,
              (SELECT MIN(s.fecha_limite) FROM servicios s
               WHERE s.id_encuestador = e.id_empleado
               AND s.estado_servicio IN ('Pendiente','En proceso') ${fechaCond}) as proximo_vencimiento
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       INNER JOIN empleado_rol er ON e.id_empleado = er.id_empleado
       INNER JOIN roles r ON er.id_rol = r.id_rol
       WHERE r.rol = 'Encuestador' AND e.estado_empleado = TRUE
       ${whereExtra}
       GROUP BY e.id_empleado, p.p_nombre, p.p_apellido
       ORDER BY total_activos DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      [...params]
    );

    const puestos = await query('SELECT * FROM puesto_trabajo ORDER BY puesto');

    res.render('admin/encuestadores/carga', {
      title: 'Carga de Encuestadores - SECU',
      encuestadores: result.rows,
      puestos: puestos.rows,
      filtros: { buscar: buscar || '', puesto: puesto || '', fecha_desde: fecha_desde || '', fecha_hasta: fecha_hasta || '' },
      page: pageNum, totalPages, total
    });
  } catch (error) {
    console.error('Error en showCargaEncuestadores (admin):', error);
    req.session.error = 'Error al cargar la carga de encuestadores';
    res.redirect('/admin/dashboard');
  }
};

const showDetalleEncuestador = async (req, res) => {
  const { id } = req.params;
  const { estado, page } = req.query;
  const pageNum = parseInt(page) || 1;
  const limit = 10;
  const offset = (pageNum - 1) * limit;

  try {
    const encuestadorResult = await query(
      `SELECT p.p_nombre || ' ' || p.p_apellido as nombre, p.correo, p.telefono,
              (SELECT STRING_AGG(pt2.puesto, ', ')
               FROM empleado_puesto ep2
               INNER JOIN puesto_trabajo pt2 ON ep2.id_puesto = pt2.id_puesto
               WHERE ep2.id_empleado = e.id_empleado) as puestos,
              (SELECT COUNT(*) FROM servicios s
               WHERE s.id_encuestador = e.id_empleado
               AND s.estado_servicio IN ('Pendiente','En proceso')) as activos,
              (SELECT COUNT(*) FROM servicios s
               WHERE s.id_encuestador = e.id_empleado
               AND s.estado_servicio = 'Finalizado') as completados,
              (SELECT COUNT(*) FROM servicios s
               WHERE s.id_encuestador = e.id_empleado
               AND s.estado_servicio IN ('Pendiente','En proceso')
               AND s.fecha_limite < CURRENT_DATE) as vencidos
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       WHERE e.id_empleado = $1`,
      [id]
    );

    if (encuestadorResult.rows.length === 0) {
      req.session.error = 'Encuestador no encontrado';
      return res.redirect('/admin/encuestadores/carga');
    }

    // Construir filtro de estado
    let estadoFilter = '';
    const params = [id];

    if (estado === 'Vencido') {
      estadoFilter = `AND s.estado_servicio IN ('Pendiente','En proceso') AND s.fecha_limite < CURRENT_DATE`;
    } else if (estado && estado !== '') {
      params.push(estado);
      estadoFilter = `AND s.estado_servicio = $${params.length}`;
    }

    const countResult = await query(
      `SELECT COUNT(*) as total
       FROM servicios s
       WHERE s.id_encuestador = $1 ${estadoFilter}`,
      [...params]
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    params.push(limit);
    params.push(offset);

    const servicios = await query(
      `SELECT s.id_servicio, s.fecha_servicio, s.fecha_limite, s.estado_servicio,
              s.id_expediente,
              p.p_nombre || ' ' || p.p_apellido as candidato_nombre,
              ts.tipo_servicio,
              e.empresa
       FROM servicios s
       INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
       INNER JOIN personas p ON cand.id_candidato = p.id_persona
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       WHERE s.id_encuestador = $1 ${estadoFilter}
       ORDER BY
         CASE WHEN s.estado_servicio IN ('Pendiente','En proceso') AND s.fecha_limite < CURRENT_DATE THEN 0 END NULLS LAST,
         CASE WHEN s.estado_servicio = 'Pendiente' THEN 1 END NULLS LAST,
         CASE WHEN s.estado_servicio = 'En proceso' THEN 2 END NULLS LAST,
         CASE WHEN s.estado_servicio = 'Finalizado' THEN 3 END NULLS LAST,
         s.fecha_limite ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      [...params]
    );

    res.render('admin/encuestadores/detalle', {
      title: 'Detalle de Encuestador - SECU',
      encuestador: encuestadorResult.rows[0],
      servicios: servicios.rows,
      filtros: { estado: estado || '' },
      page: pageNum, totalPages, total,
      encuestadorId: id
    });
  } catch (error) {
    console.error('Error en showDetalleEncuestador:', error);
    req.session.error = 'Error al cargar el detalle del encuestador';
    res.redirect('/admin/encuestadores/carga');
  }
};

// ==================== PERFIL ====================
const showPerfil = async (req, res) => {
  try {
    const empleado = await query(
      `SELECT e.*, p.*, COALESCE(pt.puesto, 'Sin puesto') as puesto
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       LEFT JOIN empleado_puesto ep ON e.id_empleado = ep.id_empleado
       LEFT JOIN puesto_trabajo pt ON ep.id_puesto = pt.id_puesto
       WHERE e.id_empleado = $1`,
      [req.session.user.id_empleado]
    );

    res.render('admin/perfil', {
      title: 'Mi Perfil - SECU',
      empleado: empleado.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el perfil';
    res.redirect('/admin/dashboard');
  }
};

const addServicioExpediente = async (req, res) => {
  const { id } = req.params; // id_expediente
  const { id_tipo_servicio, id_encuestador, id_ciudad, fecha_servicio, id_factura, direccion_servicio } = req.body;

  try {
    // Obtener datos del expediente (candidato y empresa)
    const expediente = await query(
      'SELECT id_candidato, id_empresa FROM expedientes WHERE id_expediente = $1',
      [id]
    );

    if (expediente.rows.length === 0) {
      req.session.error = 'Expediente no encontrado';
      return res.redirect('/admin/expedientes');
    }

    const { id_candidato, id_empresa } = expediente.rows[0];

    // Calcular fecha límite: fecha_servicio + 7 días
    const fechaLimite = new Date(fecha_servicio);
    fechaLimite.setDate(fechaLimite.getDate() + 7);
    const fechaLimiteStr = fechaLimite.toISOString().split('T')[0];

    await query(
      `INSERT INTO servicios (id_candidato, id_tipo_servicio, id_empresa, id_ciudad, id_encuestador, id_creador, id_expediente, id_factura, fecha_servicio, direccion_servicio, fecha_limite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id_candidato,
        id_tipo_servicio,
        id_empresa,
        id_ciudad,
        id_encuestador || null,
        req.session.user.id_empleado,
        id,
        id_factura || null,
        fecha_servicio,
        direccion_servicio || null,
        fechaLimiteStr
      ]
    );

    req.session.success = 'Servicio agregado al expediente';
    res.redirect(`/admin/expedientes/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al agregar el servicio';
    res.redirect(`/admin/expedientes/${id}`);
  }
};

const editServicioExpediente = async (req, res) => {
  const { idExp, idServ } = req.params;
  const { id_tipo_servicio, id_encuestador, id_ciudad, fecha_servicio, id_factura, direccion_servicio } = req.body;
  
  try {
    // Verificar que el servicio pueda ser editado
    const srv = await query(
      'SELECT estado_servicio, formulario_bloqueado FROM servicios WHERE id_servicio = $1',
      [idServ]
    );
    
    if (!srv.rows[0] || srv.rows[0].formulario_bloqueado || 
        ['Finalizado', 'Cancelado'].includes(srv.rows[0].estado_servicio)) {
      req.session.error = 'Este servicio no puede ser editado';
      return res.redirect(`/admin/expedientes/${idExp}`);
    }
    
    // Calcular fecha límite: fecha_servicio + 7 días
    const fechaLimite = new Date(fecha_servicio);
    fechaLimite.setDate(fechaLimite.getDate() + 7);
    const fechaLimiteStr = fechaLimite.toISOString().split('T')[0];
    
    await query(
      `UPDATE servicios SET id_tipo_servicio=$1, id_encuestador=$2, id_ciudad=$3,
       fecha_servicio=$4, id_factura=$5, direccion_servicio=$6, fecha_limite=$7 WHERE id_servicio=$8`,
      [id_tipo_servicio, id_encuestador || null, id_ciudad, fecha_servicio, id_factura || null, direccion_servicio || null, fechaLimiteStr, idServ]
    );
    
    req.session.success = 'Servicio actualizado correctamente';
    res.redirect(`/admin/expedientes/${idExp}`);
  } catch (error) {
    console.error('Error editando servicio:', error);
    req.session.error = 'Error al editar el servicio';
    res.redirect(`/admin/expedientes/${idExp}`);
  }
};

const updatePerfil = async (req, res) => {
  const { correo, telefono, direccion } = req.body;
  const idEmpleado = req.session.user.id_empleado;

  try {
    await query(
      'UPDATE personas SET correo = $1, telefono = $2, direccion = $3 WHERE id_persona = $4',
      [correo, telefono, direccion, idEmpleado]
    );

    req.session.success = 'Perfil actualizado correctamente';
    res.redirect('/admin/perfil');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el perfil';
    res.redirect('/admin/perfil');
  }
};

module.exports = {
  // APIs publicas (antes del middleware isAdmin)
  getCiudadesPorDepartamento,
  generarUsuarioSugerido,
  getEncuestadoresPorTipo,
  getCotizacionesPorEmpresa,
  // Resto de funciones
  showDashboard,
  showEmpleados,
  showNuevoEmpleado,
  createEmpleado,
  showEditarEmpleado,
  updateEmpleado,
  resetPassword,
  showEmpresas,
  createEmpresa,
  updateEmpresa,
  showServicios,
  showDetalleServicio,
  showCotizaciones,
  showNuevaCotizacion,
  createCotizacion,
  showDetalleCotizacion,
  updateEstadoCotizacion,
  deleteCotizacion,
  showFacturas,
  showNuevaFactura,
  createFactura,
  updateEstadoFactura,
  showTiposServicio,
  createTipoServicio,
  updateTipoServicio,
  deleteTipoServicio,
  showPuestos,
  createPuesto,
  updatePuesto,
  deletePuesto,
  // Expedientes
  showExpedientes,
  showNuevoExpediente,
  createExpediente,
  showDetalleExpediente,
  addServicioExpediente,
  editServicioExpediente,
  showInformeExpediente,
  updateEstadoExpediente,
  deleteExpediente,
  deleteServicioExpediente,
  showFormulariosServicio,
  reabrirFormulario,
  // Auditoría y reportes
  showAuditoria,
  showReportes,
  generarReporteServicios,
  generarReporteExpedientes,
  generarReporteCotizaciones,
  generarReporteEncuestadores,
  showPerfil,
  updatePerfil,
  // Carga de encuestadores
  showCargaEncuestadores,
  showDetalleEncuestador
};
