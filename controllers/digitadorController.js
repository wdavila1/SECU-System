const { query } = require('../config/database');
const { uploadFile, convertirAWebP } = require('../config/supabaseStorage');
const { registrarModificacion } = require('../middleware/authMiddleware');
const PREGUNTAS_POLIGRAFIA = require('../utils/preguntasPoligrafia');

// ==================== API HELPERS ====================
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


const showDashboard = async (req, res) => {
  try {
    // Estadísticas del digitador
    const serviciosMes = await query(
      `SELECT COUNT(*) as total FROM servicios 
       WHERE id_creador = $1 AND DATE_TRUNC('month', fecha_servicio) = DATE_TRUNC('month', CURRENT_DATE)`,
      [req.session.user.id_empleado]
    );

    const serviciosPendientes = await query(
      `SELECT COUNT(*) as total FROM servicios 
       WHERE id_creador = $1 AND estado_servicio = 'Pendiente'`,
      [req.session.user.id_empleado]
    );

    const cotizacionesMes = await query(
      `SELECT COUNT(*) as total FROM cotizaciones 
       WHERE DATE_TRUNC('month', fecha_cotizacion) = DATE_TRUNC('month', CURRENT_DATE)`
    );

    // Últimos servicios creados
    const ultimosServicios = await query(
      `SELECT s.*, ts.tipo_servicio, e.empresa,
              p.p_nombre || ' ' || p.p_apellido as candidato_nombre
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
       INNER JOIN personas p ON cand.id_candidato = p.id_persona
       ORDER BY s.fecha_servicio DESC
       LIMIT 10`
    );

    res.render('digitador/dashboard', {
      title: 'Panel de Control - SECU',
      serviciosMes: serviciosMes.rows[0].total,
      serviciosPendientes: serviciosPendientes.rows[0].total,
      cotizacionesMes: cotizacionesMes.rows[0].total,
      ultimosServicios: ultimosServicios.rows
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    req.session.error = 'Error al cargar el dashboard';
    res.render('digitador/dashboard', {
      title: 'Panel de Control - SECU',
      serviciosMes: 0,
      serviciosPendientes: 0,
      cotizacionesMes: 0,
      ultimosServicios: []
    });
  }
};

// ==================== CANDIDATOS ====================
const showCandidatos = async (req, res) => {
  try {
    const { buscar } = req.query;
    let queryText = `
      SELECT c.id_candidato, p.*,
             ci.ciudad, d.departamento
      FROM candidatos c
      INNER JOIN personas p ON c.id_candidato = p.id_persona
      INNER JOIN ciudades ci ON p.id_ciudad = ci.id_ciudad
      INNER JOIN departamentos d ON ci.id_departamento = d.id_departamento
    `;
    const params = [];
    
    if (buscar) {
      params.push(`%${buscar}%`);
      queryText += ` WHERE p.p_nombre ILIKE $1 OR p.p_apellido ILIKE $1 OR p.dni ILIKE $1`;
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

    queryText += ' ORDER BY p.p_apellido, p.p_nombre';
    params.push(limit);
    params.push(offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const candidatos = await query(queryText, params);

    res.render('digitador/candidatos/index', {
      title: 'Gestión de Candidatos - SECU',
      candidatos: candidatos.rows,
      filtros: { buscar: buscar || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar los candidatos';
    res.render('digitador/candidatos/index', {
      title: 'Gestión de Candidatos - SECU',
      candidatos: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
  }
};

const showNuevoCandidato = async (req, res) => {
  try {
    const departamentos = await query('SELECT * FROM departamentos ORDER BY departamento');
    const ciudades = await query(
      `SELECT c.*, d.departamento 
       FROM ciudades c 
       INNER JOIN departamentos d ON c.id_departamento = d.id_departamento 
       ORDER BY d.departamento, c.ciudad`
    );

    res.render('digitador/candidatos/nuevo', {
      title: 'Nuevo Candidato - SECU',
      departamentos: departamentos.rows,
      ciudades: ciudades.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/digitador/candidatos');
  }
};

const createCandidato = async (req, res) => {
  const { 
    p_nombre, s_nombre, p_apellido, s_apellido, dni, correo, telefono, 
    direccion, genero, fecha_nacimiento, id_ciudad 
  } = req.body;

  try {
    // Verificar si el DNI ya existe
    const dniExiste = await query('SELECT id_persona FROM personas WHERE dni = $1', [dni]);
    if (dniExiste.rows.length > 0) {
      req.session.error = 'El DNI ya está registrado';
      return res.redirect('/digitador/candidatos/nuevo');
    }

    // Insertar persona
    const personaResult = await query(
      `INSERT INTO personas (p_nombre, s_nombre, p_apellido, s_apellido, dni, correo, telefono, direccion, genero, fecha_nacimiento, id_ciudad)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id_persona`,
      [p_nombre, s_nombre || '', p_apellido, s_apellido || '', dni, correo, telefono, direccion, genero, fecha_nacimiento, id_ciudad]
    );

    const idPersona = personaResult.rows[0].id_persona;

    // Insertar candidato
    await query('INSERT INTO candidatos (id_candidato) VALUES ($1)', [idPersona]);

    req.session.success = 'Candidato registrado correctamente';
    res.redirect('/digitador/candidatos');
  } catch (error) {
    console.error('Error creando candidato:', error);
    req.session.error = 'Error al registrar el candidato';
    res.redirect('/digitador/candidatos/nuevo');
  }
};

const showEditarCandidato = async (req, res) => {
  const { id } = req.params;
  try {
    const candidato = await query(
      `SELECT c.id_candidato, p.*
       FROM candidatos c
       INNER JOIN personas p ON c.id_candidato = p.id_persona
       WHERE c.id_candidato = $1`,
      [id]
    );

    if (candidato.rows.length === 0) {
      req.session.error = 'Candidato no encontrado';
      return res.redirect('/digitador/candidatos');
    }

    const departamentos = await query('SELECT * FROM departamentos ORDER BY departamento');
    const ciudades = await query(
      `SELECT c.*, d.departamento 
       FROM ciudades c 
       INNER JOIN departamentos d ON c.id_departamento = d.id_departamento 
       ORDER BY d.departamento, c.ciudad`
    );

    res.render('digitador/candidatos/editar', {
      title: 'Editar Candidato - SECU',
      candidato: candidato.rows[0],
      departamentos: departamentos.rows,
      ciudades: ciudades.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el candidato';
    res.redirect('/digitador/candidatos');
  }
};

const updateCandidato = async (req, res) => {
  const { id } = req.params;
  const { 
    p_nombre, s_nombre, p_apellido, s_apellido, correo, telefono, 
    direccion, genero, fecha_nacimiento, id_ciudad 
  } = req.body;

  try {
    await query(
      `UPDATE personas SET p_nombre = $1, s_nombre = $2, p_apellido = $3, s_apellido = $4, 
       correo = $5, telefono = $6, direccion = $7, genero = $8, fecha_nacimiento = $9, id_ciudad = $10
       WHERE id_persona = $11`,
      [p_nombre, s_nombre || '', p_apellido, s_apellido || '', correo, telefono, direccion, genero, fecha_nacimiento, id_ciudad, id]
    );

    req.session.success = 'Candidato actualizado correctamente';
    res.redirect('/digitador/candidatos');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el candidato';
    res.redirect(`/digitador/candidatos/editar/${id}`);
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
      conditions.push(`(p.p_nombre ILIKE $${params.length} OR p.p_apellido ILIKE $${params.length})`);
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
    
    queryText += ' ORDER BY s.fecha_servicio DESC';
    
    const servicios = await query(queryText, params);
    const tiposServicio = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('digitador/servicios/index', {
      title: 'Gestión de Servicios - SECU',
      servicios: servicios.rows,
      tiposServicio: tiposServicio.rows,
      empresas: empresas.rows,
      filtros: { buscar: buscar || '', estado: estado || '', tipo: tipo || '', empresa: empresa || '' }
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar los servicios';
    res.render('digitador/servicios/index', {
      title: 'Gestión de Servicios - SECU',
      servicios: [],
      tiposServicio: [],
      empresas: [],
      filtros: {}
    });
  }
};

const showNuevoServicio = async (req, res) => {
  try {
    const candidatos = await query(
      `SELECT c.id_candidato, p.p_nombre, p.s_nombre, p.p_apellido, p.s_apellido, p.dni
       FROM candidatos c
       INNER JOIN personas p ON c.id_candidato = p.id_persona
       ORDER BY p.p_apellido, p.p_nombre`
    );
    const tiposServicio = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');
    const ciudades = await query(
      `SELECT c.*, d.departamento 
       FROM ciudades c 
       INNER JOIN departamentos d ON c.id_departamento = d.id_departamento 
       ORDER BY d.departamento, c.ciudad`
    );
    const departamentos = await query('SELECT * FROM departamentos ORDER BY departamento');
    const encuestadores = await query(
      `SELECT e.id_empleado, p.p_nombre, p.p_apellido
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       INNER JOIN empleado_rol er ON e.id_empleado = er.id_empleado
       INNER JOIN roles r ON er.id_rol = r.id_rol
       WHERE r.rol = 'Encuestador' AND e.estado_empleado = TRUE
       ORDER BY p.p_apellido, p.p_nombre`
    );
    const cotizaciones = await query(
      `SELECT c.id_cotizacion, c.codigo_cotizacion, e.empresa
       FROM cotizaciones c
       INNER JOIN empresas e ON c.id_empresa = e.id_empresa
       WHERE c.estado_cotizacion = 'Aceptada'
       ORDER BY c.fecha_cotizacion DESC`
    );

    res.render('digitador/servicios/nuevo', {
      title: 'Nuevo Servicio - SECU',
      candidatos: candidatos.rows,
      tiposServicio: tiposServicio.rows,
      empresas: empresas.rows,
      ciudades: ciudades.rows,
      departamentos: departamentos.rows,
      encuestadores: encuestadores.rows,
      cotizaciones: cotizaciones.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/digitador/servicios');
  }
};

const createServicio = async (req, res) => {
  const { 
    id_candidato, id_tipo_servicio, id_empresa, id_ciudad, 
    id_encuestador, id_cotizacion, fecha_servicio 
  } = req.body;

  try {
    await query(
      `INSERT INTO servicios (id_candidato, id_tipo_servicio, id_empresa, id_ciudad, id_encuestador, id_creador, id_cotizacion, fecha_servicio)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id_candidato, 
        id_tipo_servicio, 
        id_empresa, 
        id_ciudad, 
        id_encuestador || null, 
        req.session.user.id_empleado, 
        id_cotizacion || null, 
        fecha_servicio
      ]
    );

    req.session.success = 'Servicio creado correctamente';
    res.redirect('/digitador/servicios');
  } catch (error) {
    console.error('Error creando servicio:', error);
    req.session.error = 'Error al crear el servicio';
    res.redirect('/digitador/servicios/nuevo');
  }
};

const showEditarServicio = async (req, res) => {
  const { id } = req.params;
  try {
    const servicio = await query(
      `SELECT s.*, ts.tipo_servicio, e.empresa,
              c.id_departamento,
              p.p_nombre || ' ' || COALESCE(p.s_nombre, '') || ' ' || p.p_apellido || ' ' || COALESCE(p.s_apellido, '') as candidato_nombre,
              p.dni as candidato_dni
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       INNER JOIN ciudades c ON s.id_ciudad = c.id_ciudad
       INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
       INNER JOIN personas p ON cand.id_candidato = p.id_persona
       WHERE s.id_servicio = $1`,
      [id]
    );

    if (servicio.rows.length === 0) {
      req.session.error = 'Servicio no encontrado';
      return res.redirect('/digitador/servicios');
    }

    const candidatos = await query(
      `SELECT c.id_candidato, p.p_nombre, p.s_nombre, p.p_apellido, p.s_apellido, p.dni
       FROM candidatos c
       INNER JOIN personas p ON c.id_candidato = p.id_persona
       ORDER BY p.p_apellido, p.p_nombre`
    );
    const tiposServicio = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');
    const ciudades = await query(
      `SELECT c.*, d.departamento 
       FROM ciudades c 
       INNER JOIN departamentos d ON c.id_departamento = d.id_departamento 
       ORDER BY d.departamento, c.ciudad`
    );
    const departamentos = await query('SELECT * FROM departamentos ORDER BY departamento');
    const encuestadores = await query(
      `SELECT e.id_empleado, p.p_nombre, p.p_apellido
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       INNER JOIN empleado_rol er ON e.id_empleado = er.id_empleado
       INNER JOIN roles r ON er.id_rol = r.id_rol
       WHERE r.rol = 'Encuestador' AND e.estado_empleado = TRUE
       ORDER BY p.p_apellido, p.p_nombre`
    );
    const facturas = await query(
      `SELECT f.id_factura, f.numero_factura, e.empresa
       FROM facturas f
       INNER JOIN empresas e ON f.id_empresa = e.id_empresa
       WHERE f.id_empresa = $1
       ORDER BY f.fecha_factura DESC`,
      [servicio.rows[0].id_empresa]
    );

    res.render('digitador/servicios/editar', {
      title: 'Editar Servicio - SECU',
      servicio: servicio.rows[0],
      candidatos: candidatos.rows,
      tiposServicio: tiposServicio.rows,
      empresas: empresas.rows,
      ciudades: ciudades.rows,
      departamentos: departamentos.rows,
      encuestadores: encuestadores.rows,
      facturas: facturas.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el servicio';
    res.redirect('/digitador/servicios');
  }
};

const updateServicio = async (req, res) => {
  const { id } = req.params;
  const { 
    id_candidato, id_tipo_servicio, id_empresa, id_ciudad, 
    id_encuestador, id_factura, fecha_servicio, estado_servicio 
  } = req.body;

  try {
    await query(
      `UPDATE servicios SET id_candidato = $1, id_tipo_servicio = $2, id_empresa = $3, 
       id_ciudad = $4, id_encuestador = $5, id_factura = $6, fecha_servicio = $7, estado_servicio = $8
       WHERE id_servicio = $9`,
      [
        id_candidato, id_tipo_servicio, id_empresa, id_ciudad, 
        id_encuestador || null, id_factura || null, fecha_servicio, estado_servicio, id
      ]
    );

    await registrarModificacion('servicios', id, 'datos_generales', null, 'Actualización', req.session.user.id_empleado);

    req.session.success = 'Servicio actualizado correctamente';
    res.redirect('/digitador/servicios');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el servicio';
    res.redirect(`/digitador/servicios/editar/${id}`);
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

    res.render('digitador/cotizaciones/index', {
      title: 'Gestión de Cotizaciones - SECU',
      cotizaciones: cotizaciones.rows,
      empresas: empresas.rows,
      filtros: { buscar: buscar || '', estado: estado || '', empresa: empresa || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar las cotizaciones';
    res.render('digitador/cotizaciones/index', {
      title: 'Gestión de Cotizaciones - SECU',
      cotizaciones: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
  }
};

const showNuevaCotizacion = async (req, res) => {
  try {
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');
    const tiposServicio = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');

    res.render('digitador/cotizaciones/nuevo', {
      title: 'Nueva Cotización - SECU',
      empresas: empresas.rows,
      tiposServicio: tiposServicio.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/digitador/cotizaciones');
  }
};

const createCotizacion = async (req, res) => {
  const { id_empresa, fecha_cotizacion, vigencia_dias, contacto, observaciones } = req.body;

  try {
    // El formulario envía arrays planos: id_tipo_servicio[], cantidad[], precio_unitario[]
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

    // Generar código
    const fecha = new Date();
    const codigo = `COT-${fecha.getFullYear()}${String(fecha.getMonth() + 1).padStart(2, '0')}${String(fecha.getDate()).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

    // Insertar cabecera
    const cotizacionResult = await query(
      `INSERT INTO cotizaciones (codigo_cotizacion, id_empresa, fecha_cotizacion, subtotal, impuesto_iva, total_cotizado, estado_cotizacion)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pendiente') RETURNING id_cotizacion`,
      [codigo, id_empresa, fecha_cotizacion || new Date().toISOString().split('T')[0], subtotal, impuesto, total]
    );

    const idCotizacion = cotizacionResult.rows[0].id_cotizacion;

    // Insertar líneas de detalle
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

    req.session.success = `Cotización ${codigo} creada correctamente`;
    res.redirect('/digitador/cotizaciones');
  } catch (error) {
    console.error('Error creando cotización:', error);
    req.session.error = 'Error al crear la cotización: ' + error.message;
    res.redirect('/digitador/cotizaciones/nuevo');
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
      req.session.error = 'Cotización no encontrada';
      return res.redirect('/digitador/cotizaciones');
    }

    const detalles = await query(
      `SELECT cd.*, ts.tipo_servicio
       FROM cotizacion_detalle cd
       INNER JOIN tipo_servicio ts ON cd.id_tipo_servicio = ts.id_tipo_servicio
       WHERE cd.id_cotizacion = $1`,
      [id]
    );

    res.render('digitador/cotizaciones/detalle', {
      title: 'Detalle de Cotización - SECU',
      cotizacion: cotizacion.rows[0],
      detalles: detalles.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar la cotización';
    res.redirect('/digitador/cotizaciones');
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

    req.session.success = 'Estado de cotización actualizado';
    res.redirect(`/digitador/cotizaciones/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el estado';
    res.redirect(`/digitador/cotizaciones/${id}`);
  }
};

const deleteCotizacion = async (req, res) => {
  const { id } = req.params;
  try {
    const cot = await query('SELECT estado_cotizacion FROM cotizaciones WHERE id_cotizacion = $1', [id]);
    if (!cot.rows[0] || cot.rows[0].estado_cotizacion !== 'Pendiente') {
      req.session.error = 'Solo se pueden eliminar cotizaciones en estado Pendiente';
      return res.redirect('/digitador/cotizaciones');
    }
    const facturasRel = await query('SELECT COUNT(*) as total FROM facturas WHERE id_cotizacion = $1', [id]);
    if (parseInt(facturasRel.rows[0].total) > 0) {
      req.session.error = 'No se puede eliminar: esta cotizacion tiene facturas relacionadas';
      return res.redirect('/digitador/cotizaciones');
    }
    await query('DELETE FROM cotizacion_detalle WHERE id_cotizacion = $1', [id]);
    await query('DELETE FROM cotizaciones WHERE id_cotizacion = $1', [id]);
    req.session.success = 'Cotizacion eliminada correctamente';
    res.redirect('/digitador/cotizaciones');
  } catch(error) {
    console.error('Error:', error);
    req.session.error = 'Error al eliminar la cotizacion';
    res.redirect('/digitador/cotizaciones');
  }
};

// ==================== FACTURAS ====================
const showFacturas = async (req, res) => {
  try {
    const { buscar, estado, fecha_desde, fecha_hasta } = req.query;
    let queryText = `
      SELECT f.*, e.empresa
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
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('digitador/facturas/index', {
      title: 'Gestión de Facturas - SECU',
      facturas: facturas.rows,
      empresas: empresas.rows,
      filtros: { buscar: buscar || '', estado: estado || '', fecha_desde: fecha_desde || '', fecha_hasta: fecha_hasta || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar las facturas';
    res.render('digitador/facturas/index', {
      title: 'Gestión de Facturas - SECU',
      facturas: [],
      empresas: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
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

    res.render('digitador/facturas/nuevo', {
      title: 'Nueva Factura - SECU',
      empresas: empresas.rows,
      cotizaciones: cotizaciones.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/digitador/facturas');
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
    res.redirect('/digitador/facturas');
  } catch (error) {
    console.error('Error creando factura:', error);
    req.session.error = 'Error al registrar la factura';
    res.redirect('/digitador/facturas');
  }
};

const updateEstadoFactura = async (req, res) => {
  const { id } = req.params;
  const { status_factura } = req.body;

  try {
    await query(
      'UPDATE facturas SET status_factura = $1 WHERE id_factura = $2',
      [status_factura, id]
    );

    await registrarModificacion('facturas', id, 'status_factura', null, status_factura, req.session.user.id_empleado);

    req.session.success = 'Factura actualizada correctamente';
    res.redirect('/digitador/facturas');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar la factura';
    res.redirect('/digitador/facturas');
  }
};

// ==================== REPORTES ====================
const showReportes = async (req, res) => {
  res.render('digitador/reportes/index', {
    title: 'Reportes Operativos - SECU'
  });
};

const generarReporteServicios = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, tipo, estado } = req.query;
    const idCreador = req.session.user.id_empleado;
    
    // Construir condiciones de filtro (filtrado por creador)
    let whereClause = 'WHERE s.id_creador = $1';
    const params = [idCreador];
    
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
    
    // Query principal
    const queryText = `
      SELECT s.*, ts.tipo_servicio, e.empresa,
             p.p_nombre || ' ' || p.p_apellido as candidato_nombre,
             c.ciudad
      FROM servicios s
      INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
      INNER JOIN empresas e ON s.id_empresa = e.id_empresa
      INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
      INNER JOIN personas p ON cand.id_candidato = p.id_persona
      INNER JOIN ciudades c ON s.id_ciudad = c.id_ciudad
      ${whereClause}
      ORDER BY s.fecha_servicio DESC
    `;
    
    // Agrupacion por tipo de servicio (para grafica)
    const queryPorTipo = `
      SELECT ts.tipo_servicio, COUNT(*) as total
      FROM servicios s
      INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
      ${whereClause}
      GROUP BY ts.tipo_servicio
      ORDER BY total DESC
    `;
    
    // Agrupacion por estado (para grafica donut)
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

    res.render('digitador/reportes/servicios', {
      title: 'Reporte de Servicios - SECU',
      servicios: servicios.rows,
      porTipo: porTipo.rows,
      porEstado: porEstado.rows,
      tiposServicio: tiposServicio.rows,
      filtros: { fecha_inicio: fecha_inicio || '', fecha_fin: fecha_fin || '', tipo: tipo || '', estado: estado || '' }
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al generar el reporte';
    res.redirect('/digitador/reportes');
  }
};

// Reporte de Cotizaciones (Digitador - ve todas las cotizaciones)
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
        COALESCE(SUM(CASE WHEN c.estado_cotizacion = 'Aceptada' THEN c.total_cotizado ELSE 0 END), 0) as total_aceptadas,
        COUNT(CASE WHEN c.estado_cotizacion = 'Pendiente' THEN 1 END) as pendientes
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
    
    // Totales por empresa (barras)
    const queryPorEmpresa = `
      SELECT e.empresa, COALESCE(SUM(c.total_cotizado), 0) as total
      FROM cotizaciones c
      INNER JOIN empresas e ON c.id_empresa = e.id_empresa
      ${whereClause}
      GROUP BY e.empresa
      ORDER BY total DESC
      LIMIT 10
    `;
    
    const cotizaciones = await query(queryText, params);
    const totales = await query(queryTotales, params);
    const porEstado = await query(queryPorEstado, params);
    const porEmpresa = await query(queryPorEmpresa, params);
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('digitador/reportes/cotizaciones', {
      title: 'Reporte de Cotizaciones - SECU',
      cotizaciones: cotizaciones.rows,
      totales: totales.rows[0],
      porEstado: porEstado.rows,
      porEmpresa: porEmpresa.rows,
      empresas: empresas.rows,
      filtros: { fecha_inicio: fecha_inicio || '', fecha_fin: fecha_fin || '', estado: estado || '', empresa: empresa || '' }
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al generar el reporte';
    res.redirect('/digitador/reportes');
  }
};

// Reporte de Facturas (Digitador)
const generarReporteFacturas = async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, estado, empresa } = req.query;
    
    // Construir condiciones de filtro
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (fecha_inicio) {
      params.push(fecha_inicio);
      whereClause += ` AND f.fecha_factura >= $${params.length}`;
    }
    if (fecha_fin) {
      params.push(fecha_fin);
      whereClause += ` AND f.fecha_factura <= $${params.length}`;
    }
    if (estado) {
      params.push(estado);
      whereClause += ` AND f.status_factura = $${params.length}`;
    }
    if (empresa) {
      params.push(empresa);
      whereClause += ` AND f.id_empresa = $${params.length}`;
    }
    
    // Query principal
    const queryText = `
      SELECT f.*, e.empresa
      FROM facturas f
      INNER JOIN empresas e ON f.id_empresa = e.id_empresa
      ${whereClause}
      ORDER BY f.fecha_factura DESC NULLS LAST
    `;
    
    // Totales resumen
    const queryTotales = `
      SELECT 
        COUNT(*) as total_facturas,
        COALESCE(SUM(CASE WHEN f.status_factura = 'Pagada' THEN f.monto_total ELSE 0 END), 0) as monto_pagado,
        COALESCE(SUM(CASE WHEN f.status_factura = 'Pendiente' THEN f.monto_total ELSE 0 END), 0) as monto_pendiente
      FROM facturas f
      INNER JOIN empresas e ON f.id_empresa = e.id_empresa
      ${whereClause}
    `;
    
    // Agrupacion por estado (donut)
    const queryPorEstado = `
      SELECT f.status_factura as estado, COUNT(*) as total
      FROM facturas f
      INNER JOIN empresas e ON f.id_empresa = e.id_empresa
      ${whereClause}
      GROUP BY f.status_factura
      ORDER BY total DESC
    `;
    
    // Monto por empresa (barras)
    const queryPorEmpresa = `
      SELECT e.empresa, COALESCE(SUM(f.monto_total), 0) as total
      FROM facturas f
      INNER JOIN empresas e ON f.id_empresa = e.id_empresa
      ${whereClause}
      GROUP BY e.empresa
      ORDER BY total DESC
      LIMIT 10
    `;
    
    const facturas = await query(queryText, params);
    const totales = await query(queryTotales, params);
    const porEstado = await query(queryPorEstado, params);
    const porEmpresa = await query(queryPorEmpresa, params);
    const empresas = await query('SELECT * FROM empresas ORDER BY empresa');

    res.render('digitador/reportes/facturas', {
      title: 'Reporte de Facturas - SECU',
      facturas: facturas.rows,
      totales: totales.rows[0],
      porEstado: porEstado.rows,
      porEmpresa: porEmpresa.rows,
      empresas: empresas.rows,
      filtros: { fecha_inicio: fecha_inicio || '', fecha_fin: fecha_fin || '', estado: estado || '', empresa: empresa || '' }
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al generar el reporte';
    res.redirect('/digitador/reportes');
  }
};

// ==================== EXPEDIENTES ====================
const showExpedientes = async (req, res) => {
  try {
    const { buscar, estado, empresa } = req.query;
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

    res.render('digitador/expedientes/index', {
      title: 'Gestión de Expedientes - SECU',
      expedientes: expedientes.rows,
      empresas: empresas.rows,
      filtros: { buscar: buscar || '', estado: estado || '', empresa: empresa || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar los expedientes';
    res.render('digitador/expedientes/index', {
      title: 'Gestión de Expedientes - SECU',
      expedientes: [],
      empresas: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
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

    res.render('digitador/expedientes/nuevo', {
      title: 'Nuevo Expediente - SECU',
      candidatos: candidatos.rows,
      empresas: empresas.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/digitador/expedientes');
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
    res.redirect('/digitador/expedientes');
  } catch (error) {
    console.error('Error creando expediente:', error);
    req.session.error = 'Error al crear el expediente';
    res.redirect('/digitador/expedientes/nuevo');
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
      return res.redirect('/digitador/expedientes');
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
  // Traer todos los encuestadores con sus tipos de servicio compatibles
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

    res.render('digitador/expedientes/detalle', {
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
    res.redirect('/digitador/expedientes');
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
      return res.redirect('/digitador/expedientes');
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
    res.redirect(`/digitador/expedientes/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al agregar el servicio';
    res.redirect(`/digitador/expedientes/${id}`);
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
      return res.redirect('/digitador/expedientes');
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

    res.render('digitador/expedientes/informe', {
      title: 'Informe de Expediente - SECU',
      expediente: expediente.rows[0],
      servicios: serviciosConFormularios,
      fechaGeneracion: new Date()
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al generar el informe';
    res.redirect('/digitador/expedientes');
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
      return res.redirect('/digitador/expedientes');
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

    res.render('digitador/servicios/formularios', {
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
    res.redirect('/digitador/expedientes');
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

    res.render('digitador/perfil', {
      title: 'Mi Perfil - SECU',
      empleado: empleado.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el perfil';
    res.redirect('/digitador/dashboard');
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
    res.redirect('/digitador/perfil');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el perfil';
    res.redirect('/digitador/perfil');
  }
};

// ==================== NUEVAS FUNCIONES EXPEDIENTES ====================
const updateEstadoExpediente = async (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;

  try {
    await query('UPDATE expedientes SET estado = $1 WHERE id_expediente = $2', [estado, id]);
    await registrarModificacion('expedientes', id, 'estado', null, estado, req.session.user.id_empleado);
    req.session.success = 'Estado del expediente actualizado';
    res.redirect(`/digitador/expedientes/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el estado';
    res.redirect(`/digitador/expedientes/${id}`);
  }
};

const deleteExpediente = async (req, res) => {
  const { id } = req.params;

  try {
    const servicios = await query('SELECT COUNT(*) as total FROM servicios WHERE id_expediente = $1', [id]);
    if (parseInt(servicios.rows[0].total) > 0) {
      req.session.error = 'No se puede eliminar un expediente con servicios';
      return res.redirect(`/digitador/expedientes/${id}`);
    }
    await query('DELETE FROM expedientes WHERE id_expediente = $1', [id]);
    req.session.success = 'Expediente eliminado';
    res.redirect('/digitador/expedientes');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al eliminar el expediente';
    res.redirect(`/digitador/expedientes/${id}`);
  }
};

const deleteServicioExpediente = async (req, res) => {
  const { idExp, idServ } = req.params;
  const redirectTo = req.query.redirect || `/digitador/expedientes/${idExp}`;
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

// ==================== API ENDPOINTS ====================
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
      return res.redirect(`/digitador/expedientes/${idExp}`);
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
    res.redirect(`/digitador/expedientes/${idExp}`);
  } catch (error) {
    console.error('Error editando servicio:', error);
    req.session.error = 'Error al editar el servicio';
    res.redirect(`/digitador/expedientes/${idExp}`);
  }
};

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

    res.render('digitador/encuestadores/carga', {
      title: 'Carga de Encuestadores - SECU',
      encuestadores: result.rows,
      puestos: puestos.rows,
      filtros: { buscar: buscar || '', puesto: puesto || '', fecha_desde: fecha_desde || '', fecha_hasta: fecha_hasta || '' },
      page: pageNum, totalPages, total
    });
  } catch (error) {
    console.error('Error en showCargaEncuestadores:', error);
    req.session.error = 'Error al cargar la carga de encuestadores';
    res.redirect('/digitador/dashboard');
  }
};

module.exports = {
  showDashboard,
  showCandidatos,
  showNuevoCandidato,
  createCandidato,
  showEditarCandidato,
  updateCandidato,
  showServicios,
  showNuevoServicio,
  createServicio,
  showEditarServicio,
  updateServicio,
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
  // Expedientes
  showExpedientes,
  showNuevoExpediente,
  createExpediente,
  showDetalleExpediente,
  addServicioExpediente,
  editServicioExpediente,
  showInformeExpediente,
  showFormulariosServicio,
  updateEstadoExpediente,
  deleteExpediente,
  deleteServicioExpediente,
  // API
  getCotizacionesPorEmpresa,
  getCiudadesPorDepartamento,
  getEncuestadoresPorTipo,
  // Carga de encuestadores
  showCargaEncuestadores,
  // Otros
  showReportes,
  generarReporteServicios,
  generarReporteCotizaciones,
  generarReporteFacturas,
  showPerfil,
  updatePerfil
};
