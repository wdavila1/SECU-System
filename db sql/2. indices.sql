-- =====================================================
-- INDICES DE OPTIMIZACION - SISTEMA SECU
-- Ejecutar despues de crear todas las tablas
-- =====================================================


-- ==============================
-- CIUDADES
-- ==============================

CREATE INDEX idx_ciudades_departamento
ON Ciudades(id_departamento);


-- ==============================
-- PERSONAS
-- ==============================

CREATE INDEX idx_personas_ciudad
ON Personas(id_ciudad);


-- ==============================
-- EMPLEADOS
-- ==============================

CREATE INDEX idx_empleados_puesto
ON Empleados(id_puesto);


-- ==============================
-- FACTURAS
-- ==============================

CREATE INDEX idx_facturas_empresa
ON Facturas(id_empresa);

CREATE INDEX idx_factura_numero
ON Facturas(numero_factura);


-- ==============================
-- COTIZACIONES
-- ==============================

CREATE INDEX idx_cotizaciones_empresa
ON Cotizaciones(id_empresa);


-- ==============================
-- DETALLE COTIZACIONES
-- ==============================

CREATE INDEX idx_detalle_cotizacion
ON Cotizacion_Detalle(id_cotizacion);


-- ==============================
-- SERVICIOS (TABLA CENTRAL)
-- ==============================

CREATE INDEX idx_servicios_candidato
ON Servicios(id_candidato);

CREATE INDEX idx_servicios_empresa
ON Servicios(id_empresa);

CREATE INDEX idx_servicios_tipo
ON Servicios(id_tipo_servicio);

CREATE INDEX idx_servicios_ciudad
ON Servicios(id_ciudad);

CREATE INDEX idx_servicios_encuestador
ON Servicios(id_encuestador);

CREATE INDEX idx_servicios_factura
ON Servicios(id_factura);

CREATE INDEX idx_servicios_cotizacion
ON Servicios(id_cotizacion);

CREATE INDEX idx_servicios_estado
ON Servicios(estado_servicio);


-- ==============================
-- POLIGRAFIA
-- ==============================

CREATE INDEX idx_respuestas_poligrafia
ON Respuestas_Poligrafia(id_poligrafia);


-- ==============================
-- SOCIOECONOMICO DOCUMENTOS
-- ==============================

CREATE INDEX idx_documentos_socio
ON Documentos_Socioeconomico(id_socioeconomico);


-- ==============================
-- AUDITORIA
-- ==============================

CREATE INDEX idx_actividad_login_empleado
ON Actividad_Login(id_empleado);

CREATE INDEX idx_historial_empleado_fecha
ON Historial_Modificaciones(id_empleado, fecha_modificacion DESC);


-- =====================================================
-- FIN DE INDICES
-- =====================================================