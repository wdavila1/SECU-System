const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { registrarLogin, registrarLogout } = require('../middleware/authMiddleware');

// Mostrar página de login
const showLogin = (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('auth/login', { 
    title: 'Iniciar Sesión - SECU',
    layout: false 
  });
};

// Procesar login
const processLogin = async (req, res) => {
  const { usuario, contrasenia } = req.body;

  try {
    // Buscar empleado por usuario
    const empleadoResult = await query(
      `SELECT e.id_empleado, e.usuario, e.contrasenia, e.requiere_cambio, e.estado_empleado,
              p.p_nombre, p.s_nombre, p.p_apellido, p.s_apellido, p.correo,
              COALESCE(pt.puesto, 'Sin puesto') as puesto
       FROM empleados e
       INNER JOIN personas p ON e.id_empleado = p.id_persona
       LEFT JOIN empleado_puesto ep ON e.id_empleado = ep.id_empleado
       LEFT JOIN puesto_trabajo pt ON ep.id_puesto = pt.id_puesto
       WHERE e.usuario = $1`,
      [usuario]
    );

    if (empleadoResult.rows.length === 0) {
      req.session.error = 'Usuario o contraseña incorrectos';
      return res.redirect('/login');
    }

    const empleado = empleadoResult.rows[0];

    // Verificar si el empleado está activo
    if (!empleado.estado_empleado) {
      req.session.error = 'Su cuenta ha sido desactivada. Contacte al administrador.';
      return res.redirect('/login');
    }

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(contrasenia, empleado.contrasenia);
    if (!passwordMatch) {
      req.session.error = 'Usuario o contraseña incorrectos';
      return res.redirect('/login');
    }

    // Obtener roles del empleado
    const rolesResult = await query(
      `SELECT r.rol FROM empleado_rol er
       INNER JOIN roles r ON er.id_rol = r.id_rol
       WHERE er.id_empleado = $1`,
      [empleado.id_empleado]
    );

    const roles = rolesResult.rows.map(r => r.rol);

    if (roles.length === 0) {
      req.session.error = 'No tiene roles asignados. Contacte al administrador.';
      return res.redirect('/login');
    }

    // Registrar actividad de login (capturar IP real via ipquery.io)
    let ipAddress = 'Desconocida';
    try {
      const ipRaw = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
                    || req.socket.remoteAddress
                    || '';
      // Si es local/loopback o red privada, consultar IP pública
      if (!ipRaw || ipRaw === '::1' || ipRaw === '127.0.0.1' || ipRaw.startsWith('192.168') || ipRaw.startsWith('10.')) {
        const ipRes = await fetch('https://api.ipquery.io/?format=json');
        if (ipRes.ok) {
          const ipData = await ipRes.json();
          ipAddress = ipData.ip || ipRaw || 'Local';
        } else {
          ipAddress = ipRaw || 'Local';
        }
      } else {
        ipAddress = ipRaw;
      }
    } catch (e) {
      ipAddress = 'Desconocida';
    }
    const idActividad = await registrarLogin(empleado.id_empleado, ipAddress);

    // Guardar sesión
    req.session.user = {
      id_empleado: empleado.id_empleado,
      usuario: empleado.usuario,
      nombre_completo: `${empleado.p_nombre} ${empleado.p_apellido}`,
      correo: empleado.correo,
      puesto: empleado.puesto,
      roles: roles,
      requiere_cambio: empleado.requiere_cambio,
      id_actividad: idActividad
    };

    // Verificar si requiere cambio de contraseña
    if (empleado.requiere_cambio) {
      return res.redirect('/cambiar-contrasenia');
    }

    // Redirigir según el rol principal
    if (roles.includes('Administrador')) {
      return res.redirect('/admin/dashboard');
    } else if (roles.includes('Digitador')) {
      return res.redirect('/digitador/dashboard');
    } else if (roles.includes('Encuestador')) {
      return res.redirect('/encuestador/dashboard');
    }

    res.redirect('/');
  } catch (error) {
    console.error('Error en login:', error);
    req.session.error = 'Error al procesar el inicio de sesión';
    res.redirect('/login');
  }
};

// Cerrar sesión
const logout = async (req, res) => {
  try {
    if (req.session.user && req.session.user.id_actividad) {
      await registrarLogout(req.session.user.id_actividad);
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error('Error al cerrar sesión:', err);
      }
      res.redirect('/login');
    });
  } catch (error) {
    console.error('Error en logout:', error);
    res.redirect('/login');
  }
};

// Mostrar página de cambio de contraseña
const showCambiarContrasenia = (req, res) => {
  res.render('auth/cambiar-contrasenia', {
    title: 'Cambiar Contraseña - SECU',
    forzado: req.session.user.requiere_cambio
  });
};

// Procesar cambio de contraseña
const processCambiarContrasenia = async (req, res) => {
  const { contrasenia_actual, nueva_contrasenia, confirmar_contrasenia } = req.body;
  const idEmpleado = req.session.user.id_empleado;

  try {
    // Verificar que las contraseñas nuevas coincidan
    if (nueva_contrasenia !== confirmar_contrasenia) {
      req.session.error = 'Las contraseñas nuevas no coinciden';
      return res.redirect('/cambiar-contrasenia');
    }

    // Verificar contraseña actual
    const empleadoResult = await query(
      'SELECT contrasenia FROM empleados WHERE id_empleado = $1',
      [idEmpleado]
    );

    if (empleadoResult.rows.length === 0) {
      req.session.error = 'Error al verificar usuario';
      return res.redirect('/cambiar-contrasenia');
    }

    const passwordMatch = await bcrypt.compare(contrasenia_actual, empleadoResult.rows[0].contrasenia);
    if (!passwordMatch) {
      req.session.error = 'La contraseña actual es incorrecta';
      return res.redirect('/cambiar-contrasenia');
    }

    // Validar nueva contraseña (mínimo 6 caracteres)
    if (nueva_contrasenia.length < 6) {
      req.session.error = 'La nueva contraseña debe tener al menos 6 caracteres';
      return res.redirect('/cambiar-contrasenia');
    }

    // Hash de la nueva contraseña
    const hashedPassword = await bcrypt.hash(nueva_contrasenia, 10);

    // Actualizar contraseña
    await query(
      `UPDATE empleados 
       SET contrasenia = $1, requiere_cambio = FALSE, fecha_ultimo_cambio = CURRENT_TIMESTAMP 
       WHERE id_empleado = $2`,
      [hashedPassword, idEmpleado]
    );

    // Actualizar sesión
    req.session.user.requiere_cambio = false;

    req.session.success = 'Contraseña actualizada correctamente';
    
    // Redirigir al dashboard correspondiente
    const roles = req.session.user.roles;
    if (roles.includes('Administrador')) {
      return res.redirect('/admin/dashboard');
    } else if (roles.includes('Digitador')) {
      return res.redirect('/digitador/dashboard');
    } else if (roles.includes('Encuestador')) {
      return res.redirect('/encuestador/dashboard');
    }
    
    res.redirect('/');
  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    req.session.error = 'Error al cambiar la contraseña';
    res.redirect('/cambiar-contrasenia');
  }
};

module.exports = {
  showLogin,
  processLogin,
  logout,
  showCambiarContrasenia,
  processCambiarContrasenia
};
