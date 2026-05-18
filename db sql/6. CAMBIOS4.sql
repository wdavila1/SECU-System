-- =====================================================
-- CAMBIOS 4: Migración de puestos por empleado (1:1 -> N:M)
-- y tabla de mapeo tipo_servicio <-> puesto
-- =====================================================

-- 1. Crear tabla intermedia empleado_puesto (relación muchos a muchos)
CREATE TABLE IF NOT EXISTS empleado_puesto (
  id_empleado INT NOT NULL REFERENCES empleados(id_empleado) ON DELETE CASCADE,
  id_puesto   INT NOT NULL REFERENCES puesto_trabajo(id_puesto) ON DELETE CASCADE,
  PRIMARY KEY (id_empleado, id_puesto)
);

-- 2. Migrar datos existentes a la nueva tabla (si la columna id_puesto existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'empleados' AND column_name = 'id_puesto'
  ) THEN
    INSERT INTO empleado_puesto (id_empleado, id_puesto)
    SELECT id_empleado, id_puesto FROM empleados WHERE id_puesto IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 3. Quitar la columna id_puesto de empleados (ya no se usa)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'empleados' AND column_name = 'id_puesto'
  ) THEN
    ALTER TABLE empleados DROP COLUMN id_puesto;
  END IF;
END $$;

-- 4. Crear tabla de mapeo entre tipos de servicio y puestos compatibles
CREATE TABLE IF NOT EXISTS tipo_servicio_puesto (
  id_tipo_servicio INT NOT NULL REFERENCES tipo_servicio(id_tipo_servicio) ON DELETE CASCADE,
  id_puesto        INT NOT NULL REFERENCES puesto_trabajo(id_puesto) ON DELETE CASCADE,
  PRIMARY KEY (id_tipo_servicio, id_puesto)
);

-- 5. Insertar las relaciones según los tipos de servicio existentes usando subquery dinámica
-- Estudio Socioeconómico Rural  → Encuestador Socioeconómico
-- Estudio Socioeconómico Urbano → Encuestador Socioeconómico
-- Evaluación Psicométrica       → Psicometrista
-- Poligrafía                    → Poligrafista
INSERT INTO tipo_servicio_puesto (id_tipo_servicio, id_puesto)
SELECT ts.id_tipo_servicio, pt.id_puesto
FROM tipo_servicio ts, puesto_trabajo pt
WHERE (ts.tipo_servicio ILIKE '%Socioecon%' AND pt.puesto ILIKE '%Socioecon%')
   OR (ts.tipo_servicio ILIKE '%Psico%' AND pt.puesto ILIKE '%Psico%')
   OR (ts.tipo_servicio ILIKE '%Poligraf%' AND pt.puesto ILIKE '%Poligraf%')
ON CONFLICT DO NOTHING;


--- CAMBIOS 5
-- CAMBIOS5: Agregar campo direccion_servicio a la tabla servicios
-- Fecha: 2026-04
-- Descripción: Campo para almacenar la dirección donde se realizará el servicio

ALTER TABLE servicios ADD COLUMN direccion_servicio TEXT NULL;

-- Comentario: Este campo permite especificar la ubicación exacta del servicio,
-- que puede ser diferente a la ciudad. Por ejemplo:
-- - Para Poligrafía/Psicométrico: "SECU, COLONIA ALAMEDA" (oficina central)
-- - Para Socioeconómico: La dirección del domicilio del candidato

ALTER TABLE actividad_login ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50) NULL;

-- =====================================================
-- CAMBIOS 6: Gestión de Carga de Encuestadores
-- Fecha límite del servicio
-- =====================================================

-- 1. Agregar columna fecha_limite a servicios
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS fecha_limite DATE NULL;

-- 2. Actualizar servicios existentes: fecha_limite = fecha_servicio + 7 días
UPDATE servicios 
SET fecha_limite = fecha_servicio + INTERVAL '7 days'
WHERE fecha_limite IS NULL;

-- ============================================================
-- PARTE 1: Agregar columna tiempo_llenado_segundos
-- a los 3 formularios del encuestador
-- Ejecutar en Supabase SQL Editor
-- ============================================================

ALTER TABLE formulario_socioeconomico ADD COLUMN IF NOT EXISTS tiempo_llenado_segundos INT NULL;
ALTER TABLE formulario_poligrafia     ADD COLUMN IF NOT EXISTS tiempo_llenado_segundos INT NULL;
ALTER TABLE formulario_psicometrico   ADD COLUMN IF NOT EXISTS tiempo_llenado_segundos INT NULL;