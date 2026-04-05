const express = require('express');
const router = express.Router();
const multer = require('multer');
const digitadorController = require('../controllers/digitadorController');
const { isAuthenticated, checkPasswordChange, isDigitador } = require('../middleware/authMiddleware');

// Configurar multer para manejar archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

// API endpoints (antes del middleware de autenticacion para evitar problemas de sesion en AJAX)
router.get('/api/cotizaciones-por-empresa', isAuthenticated, digitadorController.getCotizacionesPorEmpresa);
router.get('/api/ciudades', isAuthenticated, digitadorController.getCiudadesPorDepartamento);
router.get('/api/encuestadores-por-tipo', isAuthenticated, digitadorController.getEncuestadoresPorTipo);

// Aplicar middleware a todas las rutas
router.use(isAuthenticated);
router.use(checkPasswordChange);
router.use(isDigitador);

// Dashboard
router.get('/dashboard', digitadorController.showDashboard);

// Candidatos
router.get('/candidatos', digitadorController.showCandidatos);
router.get('/candidatos/nuevo', digitadorController.showNuevoCandidato);
router.post('/candidatos/nuevo', digitadorController.createCandidato);
router.get('/candidatos/editar/:id', digitadorController.showEditarCandidato);
router.post('/candidatos/editar/:id', digitadorController.updateCandidato);

// Servicios
router.get('/servicios', digitadorController.showServicios);
router.get('/servicios/nuevo', digitadorController.showNuevoServicio);
router.post('/servicios/nuevo', digitadorController.createServicio);
router.get('/servicios/editar/:id', digitadorController.showEditarServicio);
router.post('/servicios/editar/:id', digitadorController.updateServicio);

// Cotizaciones
router.get('/cotizaciones', digitadorController.showCotizaciones);
router.get('/cotizaciones/nuevo', digitadorController.showNuevaCotizacion);
router.post('/cotizaciones/nuevo', digitadorController.createCotizacion);
router.get('/cotizaciones/:id', digitadorController.showDetalleCotizacion);
router.post('/cotizaciones/:id/estado', digitadorController.updateEstadoCotizacion);
router.post('/cotizaciones/:id/eliminar', digitadorController.deleteCotizacion);

// Facturas
router.get('/facturas', digitadorController.showFacturas);
router.get('/facturas/nuevo', digitadorController.showNuevaFactura);
router.post('/facturas/nuevo', upload.single('imagen_factura'), digitadorController.createFactura);
router.post('/facturas/:id/estado', digitadorController.updateEstadoFactura);

// Expedientes
router.get('/expedientes', digitadorController.showExpedientes);
router.get('/expedientes/nuevo', digitadorController.showNuevoExpediente);
router.post('/expedientes', digitadorController.createExpediente);
router.get('/expedientes/:id', digitadorController.showDetalleExpediente);
router.post('/expedientes/:id/servicio', digitadorController.addServicioExpediente);
router.post('/expedientes/:id/estado', digitadorController.updateEstadoExpediente);
router.post('/expedientes/:id/eliminar', digitadorController.deleteExpediente);
router.post('/expedientes/:idExp/servicio/:idServ/eliminar', digitadorController.deleteServicioExpediente);
router.post('/expedientes/:idExp/servicio/:idServ/editar', digitadorController.editServicioExpediente);
router.get('/expedientes/:id/informe', digitadorController.showInformeExpediente);

// Vista de formularios (solo lectura)
router.get('/servicios/:id/formularios', digitadorController.showFormulariosServicio);

// Carga de encuestadores
router.get('/encuestadores/carga', digitadorController.showCargaEncuestadores);

// Perfil
router.get('/perfil', digitadorController.showPerfil);
router.post('/perfil', digitadorController.updatePerfil);

// Reportes
router.get('/reportes', digitadorController.showReportes);
router.get('/reportes/servicios', digitadorController.generarReporteServicios);
router.get('/reportes/cotizaciones', digitadorController.generarReporteCotizaciones);
router.get('/reportes/facturas', digitadorController.generarReporteFacturas);

module.exports = router;
