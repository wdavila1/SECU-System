const { query } = require('../config/database');

// Helper: sanear nombre de archivo
const sanitizeFilename = (name) => {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n')
    .replace(/[^a-zA-Z0-9.\-_]/g, '_')
    .replace(/_+/g, '_');
};
const { uploadFile, convertirAWebP } = require('../config/supabaseStorage');
const { registrarModificacion } = require('../middleware/authMiddleware');




// Preguntas de poligrafía definidas en el frontend
const PREGUNTAS_POLIGRAFIA = [
  // 1. Preguntas de Control (Línea Base)
  { numero: 1, categoria: 'Control', pregunta: '¿Su nombre es [Nombre del Candidato]?' },
  { numero: 2, categoria: 'Control', pregunta: '¿Está diciendo la verdad en esta evaluación?' },
  { numero: 3, categoria: 'Control', pregunta: '¿Tiene intención de mentir en alguna respuesta?' },
  
  // 2. Integridad y Antecedentes Laborales
  { numero: 4, categoria: 'Integridad Laboral', pregunta: '¿Ha sido despedido de empleos anteriores por robo?' },
  { numero: 5, categoria: 'Integridad Laboral', pregunta: '¿Ha robado en algún trabajo anterior?' },
  { numero: 6, categoria: 'Integridad Laboral', pregunta: '¿Ha ocultado información importante a un empleador?' },
  { numero: 7, categoria: 'Integridad Laboral', pregunta: '¿Ha falsificado documentos o información laboral?' },
  { numero: 8, categoria: 'Integridad Laboral', pregunta: '¿Ha participado en actos de sabotaje dentro de una empresa?' },
  
  // 3. Actividades Ilícitas y Legalidad
  { numero: 9, categoria: 'Actividades Ilícitas', pregunta: '¿Ha participado en actividades ilícitas?' },
  { numero: 10, categoria: 'Actividades Ilícitas', pregunta: '¿Ha cometido un delito que no haya sido descubierto?' },
  { numero: 11, categoria: 'Actividades Ilícitas', pregunta: '¿Ha obtenido dinero de forma ilegal?' },
  { numero: 12, categoria: 'Actividades Ilícitas', pregunta: '¿Ha participado en estafas?' },
  { numero: 13, categoria: 'Actividades Ilícitas', pregunta: '¿Ha lavado dinero o ayudado a alguien a hacerlo?' },
  
  // 4. Sustancias y Estilo de Vida
  { numero: 14, categoria: 'Sustancias', pregunta: '¿Consume sustancias ilícitas?' },
  { numero: 15, categoria: 'Sustancias', pregunta: '¿Ha consumido drogas en el último año?' },
  { numero: 16, categoria: 'Sustancias', pregunta: '¿Ha vendido sustancias ilícitas?' },
  { numero: 17, categoria: 'Sustancias', pregunta: '¿Ha trabajado bajo efectos de alcohol o drogas?' },
  
  // 5. Confidencialidad y Seguridad Corporativa
  { numero: 18, categoria: 'Seguridad', pregunta: '¿Su intención al entrar a esta empresa es obtener y divulgar información confidencial?' },
  { numero: 19, categoria: 'Seguridad', pregunta: '¿Tiene familiares que han estado involucrados en el crimen organizado?' },
  { numero: 20, categoria: 'Seguridad', pregunta: '¿Ha aceptado sobornos?' },
  { numero: 21, categoria: 'Seguridad', pregunta: '¿Ha proporcionado información interna a terceros?' },
  
  // 6. Veracidad de la Información (Cierre)
  { numero: 22, categoria: 'Veracidad', pregunta: '¿Ha mentido en esta solicitud?' },
  { numero: 23, categoria: 'Veracidad', pregunta: '¿Tiene conflictos financieros graves?' },
  { numero: 24, categoria: 'Veracidad', pregunta: '¿Ha mentido en alguna pregunta anterior?' }
];

// ==================== DASHBOARD ====================
const showDashboard = async (req, res) => {
  try {
    const idEncuestador = req.session.user.id_empleado;

    // Servicios asignados
    const serviciosAsignados = await query(
      `SELECT COUNT(*) as total FROM servicios WHERE id_encuestador = $1`,
      [idEncuestador]
    );

    const serviciosPendientes = await query(
      `SELECT COUNT(*) as total FROM servicios 
       WHERE id_encuestador = $1 AND estado_servicio IN ('Pendiente', 'En proceso')`,
      [idEncuestador]
    );

    const serviciosFinalizados = await query(
      `SELECT COUNT(*) as total FROM servicios 
       WHERE id_encuestador = $1 AND estado_servicio = 'Finalizado'`,
      [idEncuestador]
    );

    // Servicios pendientes del encuestador
    const serviciosPendientesLista = await query(
      `SELECT s.*, ts.tipo_servicio, e.empresa,
              p.p_nombre || ' ' || p.p_apellido as candidato_nombre,
              c.ciudad
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
       INNER JOIN personas p ON cand.id_candidato = p.id_persona
       INNER JOIN ciudades c ON s.id_ciudad = c.id_ciudad
       WHERE s.id_encuestador = $1 AND s.estado_servicio IN ('Pendiente', 'En proceso')
       ORDER BY s.fecha_servicio ASC
       LIMIT 10`,
      [idEncuestador]
    );

    res.render('encuestador/dashboard', {
      usuario: req.session.user,
      title: 'Panel de Control - SECU',
      serviciosAsignados: serviciosAsignados.rows[0].total,
      serviciosPendientes: serviciosPendientes.rows[0].total,
      serviciosFinalizados: serviciosFinalizados.rows[0].total,
      serviciosPendientesLista: serviciosPendientesLista.rows
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    req.session.error = 'Error al cargar el dashboard';
    res.render('encuestador/dashboard', {
      usuario: req.session.user,
      title: 'Panel de Control - SECU',
      serviciosAsignados: 0,
      serviciosPendientes: 0,
      serviciosFinalizados: 0,
      serviciosPendientesLista: []
    });
  }
};

// ==================== SERVICIOS ASIGNADOS ====================
const showServiciosAsignados = async (req, res) => {
  try {
    const idEncuestador = req.session.user.id_empleado;
    const { estado, tipo } = req.query;

    let queryText = `
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
      WHERE s.id_encuestador = $1
    `;
    
    const params = [idEncuestador];
    
    if (estado) {
      params.push(estado);
      queryText += ` AND s.estado_servicio = $${params.length}`;
    }
    
    if (tipo) {
      params.push(tipo);
      queryText += ` AND s.id_tipo_servicio = $${params.length}`;
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const offset = (page - 1) * limit;

    const countResult = await query(
      `SELECT COUNT(*) as total FROM (${queryText}) sub`,
      [...params]
    );
    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Ordenar por urgencia: vencidos activos primero, luego pendientes, luego por fecha límite
    queryText += ` ORDER BY 
      CASE WHEN s.estado_servicio IN ('Pendiente','En proceso') AND s.fecha_limite < CURRENT_DATE THEN 0 ELSE 1 END,
      CASE WHEN s.estado_servicio = 'Pendiente' THEN 0 ELSE 1 END,
      s.fecha_limite ASC NULLS LAST,
      s.fecha_servicio ASC`;
    params.push(limit);
    params.push(offset);
    queryText += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const servicios = await query(queryText, params);
    const tiposServicio = await query('SELECT * FROM tipo_servicio ORDER BY tipo_servicio');

    res.render('encuestador/servicios/index', {
      usuario: req.session.user,
      title: 'Mis Servicios Asignados - SECU',
      servicios: servicios.rows,
      tiposServicio: tiposServicio.rows,
      filtros: { estado: estado || '', tipo: tipo || '' },
      page, totalPages, total
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar los servicios';
    res.render('encuestador/servicios/index', {
      usuario: req.session.user,
      title: 'Mis Servicios Asignados - SECU',
      servicios: [],
      tiposServicio: [],
      filtros: {},
      page: 1, totalPages: 1, total: 0
    });
  }
};

const showDetalleServicio = async (req, res) => {
  const { id } = req.params;
  const idEncuestador = req.session.user.id_empleado;

  try {
    const servicio = await query(
      `SELECT s.*, ts.tipo_servicio, ts.precio_actual, e.empresa,
              p.p_nombre, p.s_nombre, p.p_apellido, p.s_apellido, p.dni, p.correo, p.telefono, p.direccion,
              p.genero, p.fecha_nacimiento,
              c.ciudad, d.departamento
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
       INNER JOIN personas p ON cand.id_candidato = p.id_persona
       INNER JOIN ciudades c ON s.id_ciudad = c.id_ciudad
       INNER JOIN departamentos d ON c.id_departamento = d.id_departamento
       WHERE s.id_servicio = $1 AND s.id_encuestador = $2`,
      [id, idEncuestador]
    );

    if (servicio.rows.length === 0) {
      req.session.error = 'Servicio no encontrado o no tiene acceso';
      return res.redirect('/encuestador/servicios');
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

    res.render('encuestador/servicios/detalle', {
      usuario: req.session.user,
      title: 'Detalle de Servicio - SECU',
      servicio: servicio.rows[0],
      poligrafia: poligrafia.rows[0] || null,
      socioeconomico: socioeconomico.rows[0] || null,
      psicometrico: psicometrico.rows[0] || null
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el servicio';
    res.redirect('/encuestador/servicios');
  }
};

// ==================== FORMULARIO SOCIOECONÓMICO ====================
const showFormularioSocioeconomico = async (req, res) => {
  const { id } = req.params; // id del servicio
  const idEncuestador = req.session.user.id_empleado;

  try {
    // Verificar que el servicio pertenece al encuestador
    const servicio = await query(
      `SELECT s.*, ts.tipo_servicio, e.empresa,
              p.p_nombre, p.p_apellido, p.dni
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
       INNER JOIN personas p ON cand.id_candidato = p.id_persona
       WHERE s.id_servicio = $1 AND s.id_encuestador = $2`,
      [id, idEncuestador]
    );

    if (servicio.rows.length === 0) {
      req.session.error = 'Servicio no encontrado o no tiene acceso';
      return res.redirect('/encuestador/servicios');
    }

    // Buscar formulario existente
    let formulario = await query(
      'SELECT * FROM formulario_socioeconomico WHERE id_servicio = $1',
      [id]
    );

    // Si no existe, crear uno nuevo
    if (formulario.rows.length === 0) {
      const nuevoFormulario = await query(
        `INSERT INTO formulario_socioeconomico 
         (id_servicio, fecha_visita, personas_en_casa, personas_aportan_ingreso, 
          ingreso_mensual_personal, ingreso_mensual_hogar, trabaja_actualmente)
         VALUES ($1, CURRENT_DATE, 1, 0, 0, 0, FALSE)
         RETURNING *`,
        [id]
      );
      formulario = { rows: [nuevoFormulario.rows[0]] };
    }

    // Obtener documentos del formulario
    const documentos = await query(
      'SELECT * FROM documentos_socioeconomico WHERE id_socioeconomico = $1',
      [formulario.rows[0].id_socioeconomico]
    );

    // Parte 4: Si el servicio sigue Pendiente, pasarlo a En proceso al abrir el formulario
    if (servicio.rows[0].estado_servicio === 'Pendiente') {
      await query(
        `UPDATE servicios SET estado_servicio = 'En proceso' WHERE id_servicio = $1`,
        [id]
      );
    }

    res.render('encuestador/formularios/socioeconomico', {
      usuario: req.session.user,
      title: 'Formulario Socioeconómico - SECU',
      servicio: servicio.rows[0],
      formulario: formulario.rows[0],
      documentos: documentos.rows
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/encuestador/servicios');
  }
};

const saveSocioeconomico = async (req, res) => {
  const { id } = req.params;
  const {
    fecha_visita, personas_en_casa, personas_aportan_ingreso,
    ingreso_mensual_personal, ingreso_mensual_hogar, gastos_mensuales_aproximados,
    deudas_actuales, tipo_vivienda, trabaja_actualmente, empresa_actual,
    tiempo_trabajando_meses, estado_civil, nombre_conyugue, telefono_conyugue,
    lugar_trabajo_conyugue, comentarios, finalizar
  } = req.body;
  const tiempo_llenado_segundos = parseInt(req.body.tiempo_llenado_segundos) || null;

  try {
    // Verificar si el formulario está bloqueado
    const srv = await query('SELECT formulario_bloqueado FROM servicios WHERE id_servicio = $1', [id]);
    if (srv.rows[0]?.formulario_bloqueado) {
      req.session.error = 'Formulario bloqueado. Contacte al administrador para reabrirlo.';
      return res.redirect(`/encuestador/servicios/${id}`);
    }

    const estadoFormulario = finalizar === 'true' ? 'Finalizado' : 'En proceso';

    // COALESCE: si el valor nuevo es null, conserva el existente en BD (evita NOT NULL errors)
    await query(
      `UPDATE formulario_socioeconomico SET
       fecha_visita               = COALESCE($1,  fecha_visita),
       personas_en_casa           = COALESCE($2,  personas_en_casa),
       personas_aportan_ingreso   = COALESCE($3,  personas_aportan_ingreso),
       ingreso_mensual_personal   = COALESCE($4,  ingreso_mensual_personal),
       ingreso_mensual_hogar      = COALESCE($5,  ingreso_mensual_hogar),
       gastos_mensuales_aproximados = COALESCE($6, gastos_mensuales_aproximados),
       deudas_actuales            = COALESCE($7,  deudas_actuales),
       tipo_vivienda              = COALESCE($8,  tipo_vivienda),
       trabaja_actualmente        = $9,
       empresa_actual             = COALESCE($10, empresa_actual),
       tiempo_trabajando_meses    = COALESCE($11, tiempo_trabajando_meses),
       estado_civil               = COALESCE($12, estado_civil),
       nombre_conyugue            = COALESCE($13, nombre_conyugue),
       telefono_conyugue          = COALESCE($14, telefono_conyugue),
       lugar_trabajo_conyugue     = COALESCE($15, lugar_trabajo_conyugue),
       comentarios                = COALESCE($16, comentarios),
       estado_formulario          = $17,
       tiempo_llenado_segundos    = GREATEST(COALESCE(tiempo_llenado_segundos, 0), $18),
       fecha_ultima_actualizacion = CURRENT_TIMESTAMP
       WHERE id_servicio = $19`,
      [
        fecha_visita    || null,
        personas_en_casa           ? parseInt(personas_en_casa)         : null,
        personas_aportan_ingreso   ? parseInt(personas_aportan_ingreso) : null,
        ingreso_mensual_personal   ? parseFloat(ingreso_mensual_personal)   : null,
        ingreso_mensual_hogar      ? parseFloat(ingreso_mensual_hogar)      : null,
        gastos_mensuales_aproximados ? parseFloat(gastos_mensuales_aproximados) : null,
        deudas_actuales            ? parseFloat(deudas_actuales)         : null,
        tipo_vivienda              || null,
        trabaja_actualmente === 'true',
        empresa_actual             || null,
        tiempo_trabajando_meses    ? parseInt(tiempo_trabajando_meses)   : null,
        estado_civil               || null,
        nombre_conyugue            || null,
        telefono_conyugue          || null,
        lugar_trabajo_conyugue     || null,
        comentarios                || null,
        estadoFormulario,
        tiempo_llenado_segundos,
        id
      ]
    );

    // Si se finaliza, actualizar estado del servicio y bloquear formulario
    if (finalizar === 'true') {
      await query(
        `UPDATE servicios SET estado_servicio = 'Finalizado', formulario_bloqueado = TRUE WHERE id_servicio = $1`,
        [id]
      );
      await registrarModificacion('formulario_socioeconomico', id, 'estado_formulario', 'En proceso', 'Finalizado', req.session.user.id_empleado);
    }

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.json({ success: true, message: 'Formulario guardado' });
    }

    req.session.success = finalizar === 'true' ? 'Formulario finalizado correctamente' : 'Formulario guardado correctamente';
    res.redirect(`/encuestador/servicios/${id}`);
  } catch (error) {
    console.error('Error:', error);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ success: false, message: 'Error al guardar' });
    }
    req.session.error = 'Error al guardar el formulario';
    res.redirect(`/encuestador/formularios/socioeconomico/${id}`);
  }
};

const uploadDocumentoSocioeconomico = async (req, res) => {
  const { id } = req.params; // id del servicio
  const { tipo_documento } = req.body;
  const archivo = req.file;

  try {
    if (!archivo) {
      req.session.error = 'Debe seleccionar un archivo';
      return res.redirect(`/encuestador/formularios/socioeconomico/${id}`);
    }

    // Obtener id del formulario socioeconomico
    const formulario = await query(
      'SELECT id_socioeconomico FROM formulario_socioeconomico WHERE id_servicio = $1',
      [id]
    );

    if (formulario.rows.length === 0) {
      req.session.error = 'Formulario no encontrado';
      return res.redirect(`/encuestador/formularios/socioeconomico/${id}`);
    }

    // Subir archivo a Supabase (convertir a WebP si es imagen)
    const { buffer, mimetype, extension } = await convertirAWebP(archivo.buffer, archivo.mimetype);
    const safeName = sanitizeFilename(archivo.originalname);
    const nombreBase = safeName.replace(/\.[^.]+$/, '');
    const nombreFinal = extension ? nombreBase + extension : safeName;
    const filePath = `socioeconomico/${id}/${Date.now()}-${nombreFinal}`;
    const urlDocumento = await uploadFile('documentos', filePath, buffer, mimetype);

    // Guardar referencia en la base de datos
    await query(
      `INSERT INTO documentos_socioeconomico (id_socioeconomico, tipo_documento, nombre_archivo, url_documento)
       VALUES ($1, $2, $3, $4)`,
      [formulario.rows[0].id_socioeconomico, tipo_documento, nombreFinal, urlDocumento]
    );

    req.session.success = 'Documento subido correctamente';
    res.redirect(`/encuestador/formularios/socioeconomico/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al subir el documento';
    res.redirect(`/encuestador/formularios/socioeconomico/${id}`);
  }
};

// ==================== FORMULARIO POLIGRAFÍA ====================
const showFormularioPoligrafia = async (req, res) => {
  const { id } = req.params; // id del servicio
  const idEncuestador = req.session.user.id_empleado;

  try {
    // Verificar que el servicio pertenece al encuestador
    const servicio = await query(
      `SELECT s.*, ts.tipo_servicio, e.empresa,
              p.p_nombre, p.p_apellido, p.dni
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
       INNER JOIN personas p ON cand.id_candidato = p.id_persona
       WHERE s.id_servicio = $1 AND s.id_encuestador = $2`,
      [id, idEncuestador]
    );

    if (servicio.rows.length === 0) {
      req.session.error = 'Servicio no encontrado o no tiene acceso';
      return res.redirect('/encuestador/servicios');
    }

    // Buscar formulario existente
    let formulario = await query(
      'SELECT * FROM formulario_poligrafia WHERE id_servicio = $1',
      [id]
    );

    // Si no existe, crear uno nuevo
    if (formulario.rows.length === 0) {
      const nuevoFormulario = await query(
        `INSERT INTO formulario_poligrafia 
         (id_servicio, nivel_veracidad_general, resultado)
         VALUES ($1, 5, 'Inconcluso')
         RETURNING *`,
        [id]
      );
      formulario = { rows: [nuevoFormulario.rows[0]] };
    }

    // Obtener respuestas existentes
    const respuestas = await query(
      'SELECT numero_pregunta, respuesta FROM respuestas_poligrafia WHERE id_poligrafia = $1',
      [formulario.rows[0].id_poligrafia]
    );

    // Convertir respuestas a objeto para fácil acceso
    const respuestasObj = {};
    respuestas.rows.forEach(r => {
      respuestasObj[r.numero_pregunta] = r.respuesta;
    });

    // Reemplazar nombre del candidato en la primera pregunta
    const preguntasConNombre = PREGUNTAS_POLIGRAFIA.map(p => ({
      ...p,
      pregunta: p.pregunta.replace('[Nombre del Candidato]', `${servicio.rows[0].p_nombre} ${servicio.rows[0].p_apellido}`)
    }));

    // Parte 4: Si el servicio sigue Pendiente, pasarlo a En proceso al abrir el formulario
    if (servicio.rows[0].estado_servicio === 'Pendiente') {
      await query(
        `UPDATE servicios SET estado_servicio = 'En proceso' WHERE id_servicio = $1`,
        [id]
      );
    }

    res.render('encuestador/formularios/poligrafia', {
      usuario: req.session.user,
      title: 'Formulario de Poligrafía - SECU',
      servicio: servicio.rows[0],
      formulario: formulario.rows[0],
      preguntas: preguntasConNombre,
      respuestas: respuestasObj
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/encuestador/servicios');
  }
};

const savePoligrafia = async (req, res) => {
  const { id } = req.params;
  const { nivel_veracidad_general, resultado, comentarios, respuestas, finalizar } = req.body;
  const tiempo_llenado_segundos = parseInt(req.body.tiempo_llenado_segundos) || null;

  try {
    // Verificar si el formulario está bloqueado
    const srv = await query('SELECT formulario_bloqueado FROM servicios WHERE id_servicio = $1', [id]);
    if (srv.rows[0]?.formulario_bloqueado) {
      req.session.error = 'Formulario bloqueado. Contacte al administrador para reabrirlo.';
      return res.redirect(`/encuestador/servicios/${id}`);
    }

    // Obtener id del formulario
    const formulario = await query(
      'SELECT id_poligrafia FROM formulario_poligrafia WHERE id_servicio = $1',
      [id]
    );

    if (formulario.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Formulario no encontrado' });
    }

    const idPoligrafia = formulario.rows[0].id_poligrafia;
    const estadoFormulario = finalizar === 'true' ? 'Finalizado' : 'En proceso';
    const firmaEvaluador = finalizar === 'true';

    // Actualizar formulario principal
    // Si resultado viene vacío (guardado desde categorías previas al bloque final),
    // conservar el valor existente en la BD para no violar el NOT NULL
    const resultadoFinal = resultado || null;
    await query(
      `UPDATE formulario_poligrafia SET
       nivel_veracidad_general = COALESCE($1, nivel_veracidad_general),
       resultado = COALESCE($2, resultado),
       comentarios = COALESCE($3, comentarios),
       firma_evaluador = $4,
       estado_formulario = $5,
       tiempo_llenado_segundos = GREATEST(COALESCE(tiempo_llenado_segundos, 0), $6),
       fecha_ultima_actualizacion = CURRENT_TIMESTAMP
       WHERE id_poligrafia = $7`,
      [nivel_veracidad_general || null, resultadoFinal, comentarios || null, firmaEvaluador, estadoFormulario, tiempo_llenado_segundos, idPoligrafia]
    );

    // Guardar respuestas
    if (respuestas && typeof respuestas === 'object') {
      for (const [numeroPregunta, respuesta] of Object.entries(respuestas)) {
        const respuestaBoolean = respuesta === 'true' || respuesta === true;
        
        // Upsert de respuesta
        await query(
          `INSERT INTO respuestas_poligrafia (id_poligrafia, numero_pregunta, respuesta)
           VALUES ($1, $2, $3)
           ON CONFLICT (id_poligrafia, numero_pregunta) 
           DO UPDATE SET respuesta = $3`,
          [idPoligrafia, parseInt(numeroPregunta), respuestaBoolean]
        );
      }
    }

    // Si se finaliza, actualizar estado del servicio y bloquear formulario
    if (finalizar === 'true') {
      await query(
        `UPDATE servicios SET estado_servicio = 'Finalizado', formulario_bloqueado = TRUE WHERE id_servicio = $1`,
        [id]
      );
      await registrarModificacion('formulario_poligrafia', idPoligrafia, 'estado_formulario', 'En proceso', 'Finalizado', req.session.user.id_empleado);
    }

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.json({ success: true, message: 'Formulario guardado' });
    }

    req.session.success = finalizar === 'true' ? 'Formulario finalizado correctamente' : 'Formulario guardado correctamente';
    res.redirect(`/encuestador/servicios/${id}`);
  } catch (error) {
    console.error('Error:', error);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(500).json({ success: false, message: 'Error al guardar' });
    }
    req.session.error = 'Error al guardar el formulario';
    res.redirect(`/encuestador/formularios/poligrafia/${id}`);
  }
};

// ==================== FORMULARIO PSICOMÉTRICO ====================
const showFormularioPsicometrico = async (req, res) => {
  const { id } = req.params; // id del servicio
  const idEncuestador = req.session.user.id_empleado;

  try {
    // Verificar que el servicio pertenece al encuestador
    const servicio = await query(
      `SELECT s.*, ts.tipo_servicio, e.empresa,
              p.p_nombre, p.p_apellido, p.dni
       FROM servicios s
       INNER JOIN tipo_servicio ts ON s.id_tipo_servicio = ts.id_tipo_servicio
       INNER JOIN empresas e ON s.id_empresa = e.id_empresa
       INNER JOIN candidatos cand ON s.id_candidato = cand.id_candidato
       INNER JOIN personas p ON cand.id_candidato = p.id_persona
       WHERE s.id_servicio = $1 AND s.id_encuestador = $2`,
      [id, idEncuestador]
    );

    if (servicio.rows.length === 0) {
      req.session.error = 'Servicio no encontrado o no tiene acceso';
      return res.redirect('/encuestador/servicios');
    }

    // Buscar formulario existente
    let formulario = await query(
      'SELECT * FROM formulario_psicometrico WHERE id_servicio = $1',
      [id]
    );

    // Si no existe, crear uno nuevo
    if (formulario.rows.length === 0) {
      const nuevoFormulario = await query(
        `INSERT INTO formulario_psicometrico (id_servicio)
         VALUES ($1)
         RETURNING *`,
        [id]
      );
      formulario = { rows: [nuevoFormulario.rows[0]] };
    }

    // Parte 4: Si el servicio sigue Pendiente, pasarlo a En proceso al abrir el formulario
    if (servicio.rows[0].estado_servicio === 'Pendiente') {
      await query(
        `UPDATE servicios SET estado_servicio = 'En proceso' WHERE id_servicio = $1`,
        [id]
      );
    }

    res.render('encuestador/formularios/psicometrico', {
      usuario: req.session.user,
      title: 'Formulario Psicométrico - SECU',
      servicio: servicio.rows[0],
      formulario: formulario.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el formulario';
    res.redirect('/encuestador/servicios');
  }
};

const savePsicometrico = async (req, res) => {
  const { id } = req.params;
  const { comentarios, finalizar } = req.body;
  const tiempo_llenado_segundos = parseInt(req.body.tiempo_llenado_segundos) || null;
  const archivo = req.file;

  try {
    // Verificar si el formulario está bloqueado
    const srv = await query('SELECT formulario_bloqueado FROM servicios WHERE id_servicio = $1', [id]);
    if (srv.rows[0]?.formulario_bloqueado) {
      req.session.error = 'Formulario bloqueado. Contacte al administrador para reabrirlo.';
      return res.redirect(`/encuestador/servicios/${id}`);
    }

    let urlReporte = null;

    // Si hay archivo, subirlo (es PDF — no se convierte a WebP)
    if (archivo) {
      const safeName = sanitizeFilename(archivo.originalname);
      const filePath = `psicometrico/${id}/${Date.now()}-${safeName}`;
      urlReporte = await uploadFile('documentos', filePath, archivo.buffer, archivo.mimetype);
    }

    const estadoFormulario = finalizar === 'true' ? 'Finalizado' : 'En proceso';

    // Construir query dinámicamente
    let updateQuery = `UPDATE formulario_psicometrico SET comentarios = $1, estado_formulario = $2, tiempo_llenado_segundos = GREATEST(COALESCE(tiempo_llenado_segundos, 0), $3), fecha_ultima_actualizacion = CURRENT_TIMESTAMP`;
    const params = [comentarios || null, estadoFormulario, tiempo_llenado_segundos];

    if (urlReporte) {
      params.push(urlReporte);
      updateQuery += `, url_reporte_pdf = $${params.length}`;
    }

    params.push(id);
    updateQuery += ` WHERE id_servicio = $${params.length}`;

    await query(updateQuery, params);

    // Si se finaliza, actualizar estado del servicio y bloquear formulario
    if (finalizar === 'true') {
      await query(
        `UPDATE servicios SET estado_servicio = 'Finalizado', formulario_bloqueado = TRUE WHERE id_servicio = $1`,
        [id]
      );
    }

    req.session.success = finalizar === 'true' ? 'Formulario finalizado correctamente' : 'Formulario guardado correctamente';
    res.redirect(`/encuestador/servicios/${id}`);
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al guardar el formulario';
    res.redirect(`/encuestador/formularios/psicometrico/${id}`);
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

    res.render('encuestador/perfil', {
      usuario: req.session.user,
      title: 'Mi Perfil - SECU',
      empleado: empleado.rows[0]
    });
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al cargar el perfil';
    res.redirect('/encuestador/dashboard');
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
    res.redirect('/encuestador/perfil');
  } catch (error) {
    console.error('Error:', error);
    req.session.error = 'Error al actualizar el perfil';
    res.redirect('/encuestador/perfil');
  }
};

module.exports = {
  showDashboard,
  showServiciosAsignados,
  showDetalleServicio,
  showFormularioSocioeconomico,
  saveSocioeconomico,
  uploadDocumentoSocioeconomico,
  showFormularioPoligrafia,
  savePoligrafia,
  showFormularioPsicometrico,
  savePsicometrico,
  showPerfil,
  updatePerfil,
  PREGUNTAS_POLIGRAFIA
};
