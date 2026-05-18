ALTER TABLE Cotizaciones
  ADD COLUMN vigencia_dias   INT          NOT NULL DEFAULT 30,
  ADD COLUMN contacto        VARCHAR(100) NULL,
  ADD COLUMN observaciones   TEXT         NULL;


 -- ============================================================
-- FASE 1 — Cambios de Base de Datos SECU
-- Ejecutar en Supabase SQL Editor
-- ============================================================


-- ============================================================
-- 1. TABLA EXPEDIENTES
-- Agrupa varios servicios de un mismo candidato para una empresa.
-- Ej: 1 candidato → poligrafía + socioeconómico + psicométrico
--     = 1 expediente con 3 servicios
-- ============================================================

CREATE TABLE Expedientes (
    id_expediente    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_candidato     INT NOT NULL,
            INT NOT NULL,
    fecha_expediente DATE NOT NULL DEFAULT CURRENT_DATE,
    estado           VARCHAR(20) NOT NULL DEFAULT 'En proceso'
                     CHECK (estado IN ('En proceso', 'Finalizado', 'Cancelado')),
    observaciones    TEXT NULL,
    CONSTRAINT FK_Expediente_Candidato FOREIGN KEY (id_candidato) REFERENCES Candidatos(id_candidato),
    CONSTRAINT FK_Expediente_Empresa   FOREIGN KEY (id_empresa)   REFERENCES Empresas(id_empresa)
);


-- ============================================================
-- 2. VINCULAR SERVICIOS AL EXPEDIENTE
-- Cada servicio puede pertenecer a un expediente (opcional).
-- Un servicio sin expediente sigue funcionando igual que antes.
-- ============================================================

ALTER TABLE Servicios
    ADD COLUMN id_expediente INT NULL,
    ADD CONSTRAINT FK_Servicio_Expediente
        FOREIGN KEY (id_expediente) REFERENCES Expedientes(id_expediente);


-- ============================================================
-- 3. FACTURA → EXPEDIENTE (quitar de Servicios)
-- La factura aplica al expediente completo, no a un servicio
-- individual. En entorno de pruebas simplemente quitamos la
-- columna de Servicios y la movemos a Expedientes.
-- ============================================================

-- 3a. Agregar id_factura al expediente
ALTER TABLE Expedientes
    ADD COLUMN id_factura INT NULL,
    ADD CONSTRAINT FK_Expediente_Factura
        FOREIGN KEY (id_factura) REFERENCES Facturas(id_factura);

-- 3b. Quitar id_factura de Servicios (entorno de pruebas, no hay datos)
ALTER TABLE Servicios
    DROP CONSTRAINT IF EXISTS FK_Servicio_Factura,
    DROP COLUMN IF EXISTS id_factura;


-- ============================================================
-- 4. CONTROL DE REAPERTURA DE FORMULARIOS
-- FALSE (default) = el encuestador puede editar
-- TRUE            = formulario bloqueado, solo lectura
--                   (solo admin puede cambiar a FALSE)
-- ============================================================

ALTER TABLE Servicios
    ADD COLUMN formulario_bloqueado BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================
-- RESULTADO FINAL: tabla Servicios queda así:
--   id_servicio, id_candidato, id_tipo_servicio, id_empresa,
--   id_ciudad, id_encuestador, id_creador, id_cotizacion,
--   id_expediente (nuevo), formulario_bloqueado (nuevo),
--   fecha_servicio, estado_servicio
-- ============================================================