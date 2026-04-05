const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated, checkPasswordChange } = require('../middleware/authMiddleware');

// Rutas públicas
router.get('/login', authController.showLogin);
router.post('/login', authController.processLogin);
router.get('/logout', authController.logout);

// Rutas protegidas
router.get('/cambiar-contrasenia', isAuthenticated, authController.showCambiarContrasenia);
router.post('/cambiar-contrasenia', isAuthenticated, authController.processCambiarContrasenia);

module.exports = router;
