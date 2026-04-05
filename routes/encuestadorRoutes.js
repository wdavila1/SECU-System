const express = require('express');
const router = express.Router();
const multer = require('multer');
const encuestadorController = require('../controllers/encuestadorController');
const { isAuthenticated, checkPasswordChange, isEncuestador } = require('../middleware/authMiddleware');

// Configurar multer para manejar archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

// Aplicar middleware a todas las rutas
router.use(isAuthenticated);
router.use(checkPasswordChange);
router.use(isEncuestador);

// Dashboard
router.get('/dashboard', encuestadorController.showDashboard);

// Servicios Asignados
router.get('/servicios', encuestadorController.showServiciosAsignados);
router.get('/servicios/:id', encuestadorController.showDetalleServicio);

// Formulario Socioeconómico
router.get('/formularios/socioeconomico/:id', encuestadorController.showFormularioSocioeconomico);
router.post('/formularios/socioeconomico/:id', encuestadorController.saveSocioeconomico);
router.post('/formularios/socioeconomico/:id/documento', upload.single('documento'), encuestadorController.uploadDocumentoSocioeconomico);

// Formulario Poligrafía
router.get('/formularios/poligrafia/:id', encuestadorController.showFormularioPoligrafia);
router.post('/formularios/poligrafia/:id', encuestadorController.savePoligrafia);

// Formulario Psicométrico
router.get('/formularios/psicometrico/:id', encuestadorController.showFormularioPsicometrico);
router.post('/formularios/psicometrico/:id', upload.single('reporte_pdf'), encuestadorController.savePsicometrico);

// Perfil
router.get('/perfil', encuestadorController.showPerfil);
router.post('/perfil', encuestadorController.updatePerfil);

module.exports = router;
