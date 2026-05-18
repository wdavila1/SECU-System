
-- 1. Vincular Servicios a Facturas con integridad referencial
-- Agregamos la columna y luego el constraint de llave foránea
ALTER TABLE servicios ADD COLUMN id_factura INT NULL;

ALTER TABLE servicios 
ADD CONSTRAINT fk_servicios_facturas 
FOREIGN KEY (id_factura) REFERENCES facturas(id_factura)
ON DELETE SET NULL; -- Si se borra la factura, el servicio queda huérfano pero no se borra


-- 2. Quitar id_factura de Expedientes (Limpieza)
-- Nota: Si ya existía un FK físico, a veces debes borrar el CONSTRAINT antes del COLUMN
ALTER TABLE expedientes DROP COLUMN id_factura;


-- 3. Vincular Cotización a Factura
ALTER TABLE facturas ADD COLUMN id_cotizacion INT NULL;

ALTER TABLE facturas 
ADD CONSTRAINT fk_facturas_cotizaciones 
FOREIGN KEY (id_cotizacion) REFERENCES cotizaciones(id_cotizacion)
ON DELETE RESTRICT; -- No permite borrar una cotización si ya tiene factura


-- 4. Agregar monto total con restricción de valor positivo
ALTER TABLE facturas ADD COLUMN monto_total DECIMAL(10,2) NULL;

ALTER TABLE facturas 
ADD CONSTRAINT check_monto_positivo 
CHECK (monto_total >= 0);