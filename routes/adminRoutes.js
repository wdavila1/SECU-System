const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminController = require('../controllers/adminController');
const { isAuthenticated, checkPasswordChange, isAdmin } = require('../middleware/authMiddleware');

// Configurar multer para manejar archivos en memoria
const upload = multer({ storage: multer.memoryStorage() });

// Aplicar middleware de autenticación a todas las rutas
router.use(isAuthenticated);
router.use(checkPasswordChange);

// API endpoints (ANTES del middleware isAdmin para que digitadores tambien puedan usarlas)
router.get('/api/ciudades', adminController.getCiudadesPorDepartamento);
router.get('/api/generar-usuario', adminController.generarUsuarioSugerido);
router.get('/api/encuestadores-por-tipo', adminController.getEncuestadoresPorTipo);
router.get('/api/cotizaciones-por-empresa', adminController.getCotizacionesPorEmpresa);

// Aplicar middleware de admin al resto
router.use(isAdmin);

// Dashboard
router.get('/dashboard', adminController.showDashboard);

// Empleados
router.get('/empleados', adminController.showEmpleados);
router.get('/empleados/nuevo', adminController.showNuevoEmpleado);
router.post('/empleados/nuevo', adminController.createEmpleado);
router.get('/empleados/editar/:id', adminController.showEditarEmpleado);
router.post('/empleados/editar/:id', adminController.updateEmpleado);
router.post('/empleados/reset-password/:id', adminController.resetPassword);

// Empresas
router.get('/empresas', adminController.showEmpresas);
router.post('/empresas', adminController.createEmpresa);
router.post('/empresas/editar/:id', adminController.updateEmpresa);

// Servicios
router.get('/servicios', adminController.showServicios);
router.get('/servicios/:id', adminController.showDetalleServicio);
router.get('/servicios/:id/formularios', adminController.showFormulariosServicio);
router.post('/servicios/:id/reabrir', adminController.reabrirFormulario);

// Expedientes
router.get('/expedientes', adminController.showExpedientes);
router.get('/expedientes/nuevo', adminController.showNuevoExpediente);
router.post('/expedientes', adminController.createExpediente);
router.get('/expedientes/:id', adminController.showDetalleExpediente);
router.post('/expedientes/:id/servicio', adminController.addServicioExpediente);
router.post('/expedientes/:id/eliminar', adminController.deleteExpediente);
router.post('/expedientes/:idExp/servicio/:idServ/eliminar', adminController.deleteServicioExpediente);
router.post('/expedientes/:idExp/servicio/:idServ/editar', adminController.editServicioExpediente);
router.get('/expedientes/:id/informe', adminController.showInformeExpediente);
router.post('/expedientes/:id/estado', adminController.updateEstadoExpediente);

// Cotizaciones
router.get('/cotizaciones', adminController.showCotizaciones);
router.get('/cotizaciones/nuevo', adminController.showNuevaCotizacion);
router.post('/cotizaciones/nuevo', adminController.createCotizacion);
router.get('/cotizaciones/:id', adminController.showDetalleCotizacion);
router.post('/cotizaciones/:id/estado', adminController.updateEstadoCotizacion);
router.post('/cotizaciones/:id/eliminar', adminController.deleteCotizacion);

// Facturas
router.get('/facturas', adminController.showFacturas);
router.get('/facturas/nuevo', adminController.showNuevaFactura);
router.post('/facturas/nuevo', upload.single('imagen_factura'), adminController.createFactura);
router.post('/facturas/:id/estado', adminController.updateEstadoFactura);

// Tipos de Servicio
router.get('/tipos-servicio', adminController.showTiposServicio);
router.post('/tipos-servicio', adminController.createTipoServicio);
router.post('/tipos-servicio/editar/:id', adminController.updateTipoServicio);
router.post('/tipos-servicio/eliminar/:id', adminController.deleteTipoServicio);

// Puestos de Trabajo
router.get('/puestos', adminController.showPuestos);
router.post('/puestos', adminController.createPuesto);
router.post('/puestos/editar/:id', adminController.updatePuesto);
router.post('/puestos/eliminar/:id', adminController.deletePuesto);

// Auditoría
router.get('/auditoria', adminController.showAuditoria);

// Reportes
router.get('/reportes', adminController.showReportes);
router.get('/reportes/servicios', adminController.generarReporteServicios);
router.get('/reportes/expedientes', adminController.generarReporteExpedientes);
router.get('/reportes/cotizaciones', adminController.generarReporteCotizaciones);
router.get('/reportes/encuestadores', adminController.generarReporteEncuestadores);

// Perfil
router.get('/perfil', adminController.showPerfil);
router.post('/perfil', adminController.updatePerfil);

// Carga de encuestadores
router.get('/encuestadores/carga', adminController.showCargaEncuestadores);
router.get('/encuestadores/:id/detalle', adminController.showDetalleEncuestador);

module.exports = router;
