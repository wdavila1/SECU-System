require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const path = require('path');
const { pool } = require('./config/database');

// Importar rutas
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const digitadorRoutes = require('./routes/digitadorRoutes');
const encuestadorRoutes = require('./routes/encuestadorRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de sesiones con PostgreSQL
app.use(session({
  store: new pgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: false
  }),
  secret: process.env.SESSION_SECRET || 'secu-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production'
  }
}));

// Variables globales para las vistas
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.session.success;
  res.locals.error = req.session.error;
  delete req.session.success;
  delete req.session.error;
  next();
});

// Rutas
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/digitador', digitadorRoutes);
app.use('/encuestador', encuestadorRoutes);

// Ruta principal
app.get('/', (req, res) => {
  if (req.session.user) {
    // Redirigir según el rol
    const roles = req.session.user.roles || [];
    if (roles.includes('Administrador')) {
      return res.redirect('/admin/dashboard');
    } else if (roles.includes('Digitador')) {
      return res.redirect('/digitador/dashboard');
    } else if (roles.includes('Encuestador')) {
      return res.redirect('/encuestador/dashboard');
    }
  }
  res.redirect('/login');
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).render('errors/404', { title: 'Página no encontrada' });
});

// Manejo de errores generales
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('errors/500', { title: 'Error del servidor' });
});

app.listen(PORT, () => {
  console.log(`Servidor SECU corriendo en http://localhost:${PORT}`);
});
