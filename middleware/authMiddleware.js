const { query } = require('../config/database');

// Verificar si el usuario está autenticado
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  req.session.error = 'Debe iniciar sesión para acceder a esta página';
  res.redirect('/login');
};

// Verificar si el usuario requiere cambio de contraseña
const checkPasswordChange = (req, res, next) => {
  if (req.session.user && req.session.user.requiere_cambio) {
    if (req.path !== '/cambiar-contrasenia' && req.path !== '/logout') {
      return res.redirect('/cambiar-contrasenia');
    }
  }
  next();
};

// Verificar si el usuario tiene rol de Administrador
const isAdmin = (req, res, next) => {
  if (req.session.user && req.session.user.roles) {
    if (req.session.user.roles.includes('Administrador')) {
      return next();
    }
  }
  req.session.error = 'No tiene permisos para acceder a esta sección';
  res.redirect('/');
};

// Verificar si el usuario tiene rol de Digitador
const isDigitador = (req, res, next) => {
  if (req.session.user && req.session.user.roles) {
    if (req.session.user.roles.includes('Digitador') || req.session.user.roles.includes('Administrador')) {
      return next();
    }
  }
  req.session.error = 'No tiene permisos para acceder a esta sección';
  res.redirect('/');
};

// Verificar si el usuario tiene rol de Encuestador
const isEncuestador = (req, res, next) => {
  if (req.session.user && req.session.user.roles) {
    if (req.session.user.roles.includes('Encuestador')) {
      return next();
    }
  }
  req.session.error = 'No tiene permisos para acceder a esta sección';
  res.redirect('/');
};

// Verificar múltiples roles
const hasAnyRole = (...roles) => {
  return (req, res, next) => {
    if (req.session.user && req.session.user.roles) {
      const userRoles = req.session.user.roles;
      const hasRole = roles.some(role => userRoles.includes(role));
      if (hasRole) {
        return next();
      }
    }
    req.session.error = 'No tiene permisos para acceder a esta sección';
    res.redirect('/');
  };
};

// Registrar actividad de login
const registrarLogin = async (idEmpleado, ipAddress = 'Desconocida') => {
  try {
    const result = await query(
      'INSERT INTO actividad_login (id_empleado, fecha_inicio_sesion, ip_address) VALUES ($1, CURRENT_TIMESTAMP, $2) RETURNING id_actividad',
      [idEmpleado, ipAddress]
    );
    return result.rows[0].id_actividad;
  } catch (error) {
    // Si la columna ip_address no existe aún, fallback sin IP
    try {
      const result = await query(
        'INSERT INTO actividad_login (id_empleado, fecha_inicio_sesion) VALUES ($1, CURRENT_TIMESTAMP) RETURNING id_actividad',
        [idEmpleado]
      );
      return result.rows[0].id_actividad;
    } catch(e) {
      console.error('Error registrando login:', e);
      return null;
    }
  }
};

// Registrar cierre de sesión
const registrarLogout = async (idActividad) => {
  try {
    await query(
      'UPDATE actividad_login SET fecha_cierra_sesion = CURRENT_TIMESTAMP WHERE id_actividad = $1',
      [idActividad]
    );
  } catch (error) {
    console.error('Error registrando logout:', error);
  }
};

// Registrar modificación en historial
const registrarModificacion = async (tabla, idRegistro, campo, valorAnterior, valorNuevo, idEmpleado) => {
  try {
    await query(
      `INSERT INTO historial_modificaciones 
       (tabla_modificada, id_registro, campo_modificado, valor_anterior, valor_nuevo, id_empleado) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tabla, idRegistro, campo, valorAnterior, valorNuevo, idEmpleado]
    );
  } catch (error) {
    console.error('Error registrando modificación:', error);
  }
};

module.exports = {
  isAuthenticated,
  checkPasswordChange,
  isAdmin,
  isDigitador,
  isEncuestador,
  hasAnyRole,
  registrarLogin,
  registrarLogout,
  registrarModificacion
};
