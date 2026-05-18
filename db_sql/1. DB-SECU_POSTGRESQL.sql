-- Crear base de datos
CREATE DATABASE secu;

-- Conectarse a la base de datos (en psql)
-- \c secu


-- 1. Departamentos
CREATE TABLE Departamentos (
    id_departamento INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    departamento VARCHAR(25) NOT NULL
);

-- 2. Ciudades
CREATE TABLE Ciudades (
    id_ciudad INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ciudad VARCHAR(40) NOT NULL,
    id_departamento INT NOT NULL,
    CONSTRAINT FK_Ciudades_Departamentos FOREIGN KEY (id_departamento) REFERENCES Departamentos(id_departamento),
    CONSTRAINT UQ_Ciudad_Departamento UNIQUE (id_departamento, ciudad) --Para no insertar 2 ciudades con el mismo departamento
);

--  3. Puesto_Trabajo
CREATE TABLE Puesto_Trabajo (
    id_puesto INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    puesto VARCHAR(40) NOT NULL
);

-- 4. Personas
CREATE TABLE Personas (
    id_persona INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    p_nombre VARCHAR(60) NOT NULL,
    s_nombre VARCHAR(60) NOT NULL,
    p_apellido VARCHAR(60) NOT NULL,
    s_apellido VARCHAR(60) NOT NULL,
    dni VARCHAR(15) NOT NULL UNIQUE,
    correo VARCHAR(30) NOT NULL UNIQUE,
    telefono VARCHAR(20) NOT NULL,
    direccion VARCHAR(200) NOT NULL, --detalle de la dirección
    genero VARCHAR(15) NULL CHECK (genero IN ('Masculino', 'Femenino', 'Otro')),
    fecha_nacimiento DATE NOT NULL,
    id_ciudad INT NOT NULL,
    CONSTRAINT FK_Ciudad_Persona FOREIGN KEY (id_ciudad) REFERENCES Ciudades(id_ciudad)
);

-- 5. Empleados (Herencia de Personas)
CREATE TABLE Empleados (
    id_empleado INT PRIMARY KEY, -- El mismo ID de Personas (Relación 1:1)
    usuario VARCHAR(15) NOT NULL UNIQUE,
    contrasenia TEXT NOT NULL, -- Siempre se usa más espacio para Hash
    requiere_cambio BOOLEAN DEFAULT FALSE, -- Para forzar al usuario a cambiar su contraseña en el primer inicio de sesión o después de un restablecimiento de contraseña (TRUE = Requiere cambio, FALSE = No requiere cambio)
    fecha_ultimo_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_puesto INT NOT NULL,
    fecha_contratacion DATE NOT NULL,
    estado_empleado BOOLEAN DEFAULT TRUE, -- Para marcar si el empleado está activo o no (en caso de baja), en lugar de eliminarlo (TRUE Activo, FALSE Inactivo)
    CONSTRAINT FK_Empleados_Puesto FOREIGN KEY (id_puesto) REFERENCES Puesto_Trabajo(id_puesto),
    CONSTRAINT FK_Empleados_Personas FOREIGN KEY (id_empleado) REFERENCES Personas(id_persona)
);

-- 6. Candidatos (Herencia de Personas)
CREATE TABLE Candidatos(
    id_candidato INT PRIMARY KEY, -- El mismo ID de Personas
    CONSTRAINT FK_Candidatos_Personas FOREIGN KEY (id_candidato) REFERENCES Personas(id_persona)
);

-- 7. Roles
CREATE TABLE Roles ( 
    id_rol INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, 
    rol VARCHAR(30) NOT NULL UNIQUE --Administrador, Digitador, Encuestador
);

--8. Empleado_Rol (muchos roles por empleado)
CREATE TABLE Empleado_Rol (
    id_empleado INT NOT NULL,
    id_rol INT NOT NULL,
    PRIMARY KEY (id_empleado, id_rol), -- Clave compuesta 
    FOREIGN KEY (id_empleado) REFERENCES Empleados(id_empleado),
    FOREIGN KEY (id_rol) REFERENCES Roles(id_rol)
);

-- 9. Empresas
CREATE TABLE Empresas (
    id_empresa INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa VARCHAR(100) NOT NULL
);

-- 10. Tipo de servicio 
CREATE TABLE Tipo_Servicio (
    id_tipo_servicio INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_servicio VARCHAR(100) NOT NULL,
    precio_actual DECIMAL(10,2) NOT NULL -- Precio actual del servicio
);

-- 11. Facturas
CREATE TABLE Facturas (
    id_factura INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_empresa INT NOT NULL,
    numero_factura VARCHAR(60) NOT NULL,
    fecha_factura DATE NULL,
    status_factura VARCHAR(20) NOT NULL CHECK (status_factura IN ('Pendiente', 'Pagada', 'Negada')),
    -- monto_total DECIMAL(10,2) NULL
    url_imagen_factura TEXT NULL, -- Ruta o URL de la imagen que esa imagen basicamente estaria en la nube o en un servidor de archivos(supabase), y aqui solo se guarda la referencia a esa imagen
    CONSTRAINT FK_Factura_Empresa FOREIGN KEY (id_empresa) REFERENCES Empresas(id_empresa),
    CONSTRAINT UQ_Factura_Empresa UNIQUE (id_empresa, numero_factura)
);

-- 12. Cotizaciones
CREATE TABLE Cotizaciones (
    id_cotizacion INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_cotizacion VARCHAR(30) NOT NULL UNIQUE,
    id_empresa INT NOT NULL,
    fecha_cotizacion DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0, -- Esto se puede hacer con un trigger o con lógica en el backend al sumar los subtotales de Cotizacion_Detalle
    impuesto_iva DECIMAL(10,2) NOT NULL DEFAULT 0, -- Aquí irá el 15% del subtotal
    total_cotizado DECIMAL(10,2) NOT NULL DEFAULT 0, -- Esto se puede hacer con un trigger o con lógica en el backend.
    estado_cotizacion VARCHAR(15) NOT NULL CHECK (estado_cotizacion IN ('Pendiente', 'Aceptada', 'Rechazada')),
    CONSTRAINT FK_Cotizacion_Empresa FOREIGN KEY (id_empresa) REFERENCES Empresas(id_empresa)
);

ALTER TABLE Cotizaciones
  ADD COLUMN vigencia_dias   INT          NOT NULL DEFAULT 30,
  ADD COLUMN contacto        VARCHAR(100) NULL,
  ADD COLUMN observaciones   TEXT         NULL;
  

--13. Detalle de Cotización (relación 1:N con Cotizaciones, para listar los servicios cotizados en cada cotización)
CREATE TABLE Cotizacion_Detalle (
    id_detalle INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_cotizacion INT NOT NULL,
    id_tipo_servicio INT NOT NULL,
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal_linea DECIMAL(10,2) NOT NULL, -- Cantidad * Precio Unitario, se puede calcular con un trigger o con lógica en el backend al insertar o actualizar el detalle
    CONSTRAINT FK_Detalle_Cotizacion FOREIGN KEY (id_cotizacion) REFERENCES Cotizaciones(id_cotizacion),
    CONSTRAINT FK_Detalle_TipoServicio FOREIGN KEY (id_tipo_servicio) REFERENCES Tipo_Servicio(id_tipo_servicio),
    CONSTRAINT UQ_Cotizacion_TipoServicio UNIQUE (id_cotizacion, id_tipo_servicio) -- Para evitar que se agregue el mismo tipo de servicio más de una vez en la misma cotización
);

-- 14. Servicios (tabla central)
CREATE TABLE Servicios (
    id_servicio INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_candidato INT NOT NULL,
    id_tipo_servicio INT NOT NULL,
    id_empresa INT NOT NULL,
    id_ciudad INT NOT NULL,
    id_encuestador INT NULL, -- Puede ser poligrafista o encargado, se determina por el rol del empleado
    id_creador INT NOT NULL, -- Empleado que creó el servicio, para auditoría
    id_factura INT NULL, -- NO VA..?
    id_cotizacion INT NULL, -- Para relacionar el servicio con la cotización que se le hizo a la empresa (IMPORTANTE!!, no es obligatorio que un servicio tenga cotización, pero si la tiene, se relaciona aquí)
    fecha_servicio DATE NOT NULL,
    estado_servicio VARCHAR(20) NOT NULL DEFAULT 'Pendiente' CHECK (estado_servicio IN ('Pendiente','En proceso','Finalizado','Cancelado')),
    CONSTRAINT FK_Servicio_Candidato FOREIGN KEY (id_candidato) REFERENCES Candidatos(id_candidato),
    CONSTRAINT FK_Servicio_Tipo FOREIGN KEY (id_tipo_servicio) REFERENCES Tipo_Servicio(id_tipo_servicio),
    CONSTRAINT FK_Servicio_Empresa FOREIGN KEY (id_empresa) REFERENCES Empresas(id_empresa),
    CONSTRAINT FK_Servicio_Ciudad FOREIGN KEY (id_ciudad) REFERENCES Ciudades(id_ciudad),
    CONSTRAINT FK_Servicio_Encuestador FOREIGN KEY (id_encuestador) REFERENCES Empleados(id_empleado),
    CONSTRAINT FK_Servicio_Creador FOREIGN KEY (id_creador) REFERENCES Empleados(id_empleado),
    CONSTRAINT FK_Servicio_Factura FOREIGN KEY (id_factura) REFERENCES Facturas(id_factura),
    CONSTRAINT FK_Servicio_Cotizacion FOREIGN KEY (id_cotizacion) REFERENCES Cotizaciones(id_cotizacion)
);


-- FORMULARIOS ESTATICOS 
------------------------------------------------------------

-- 15. Formulario de Poligrafía (relación 1:1 con Servicios, cada servicio tiene un formulario de poligrafía, y cada formulario de poligrafía pertenece a un servicio específico)
CREATE TABLE Formulario_Poligrafia (
    id_poligrafia INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_servicio INT NOT NULL UNIQUE,
    nivel_veracidad_general SMALLINT CHECK (nivel_veracidad_general BETWEEN 1 AND 10),
    resultado VARCHAR(20) NOT NULL CHECK (resultado IN ('Verdad','Engaño','Inconcluso')),
    comentarios TEXT NULL,
    firma_evaluador BOOLEAN NULL DEFAULT FALSE, --  FALSE = Sin firmar, TRUE = Firmado (Esto se puede usar para controlar que el evaluador no pueda modificar el formulario después de marcarlo como firmado)
    fecha_evaluacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Fecha y hora en que se realizó la evaluación
    estado_formulario VARCHAR(20) NOT NULL DEFAULT 'En proceso' CHECK (estado_formulario IN ('En proceso','Finalizado')),
    fecha_ultima_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, --Para lo del TIMER, campo para autogardado, se actualiza cada vez que se modifica el formulario
    CONSTRAINT FK_FormPoligrafia_Servicio FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio)
);

--15.1. Respuestas del Formulario de Poligrafía (relación 1:N con Formulario_Poligrafia, cada formulario de poligrafía tiene varias respuestas
CREATE TABLE Respuestas_Poligrafia (
    id_respuesta INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_poligrafia INT NOT NULL,
    numero_pregunta SMALLINT NOT NULL,
    respuesta BOOLEAN NOT NULL, -- TRUE = Si, FALSE = No
    CONSTRAINT FK_Respuestas_Poligrafia FOREIGN KEY (id_poligrafia) REFERENCES Formulario_Poligrafia(id_poligrafia),
    CONSTRAINT UQ_Pregunta_Poligrafia UNIQUE (id_poligrafia, numero_pregunta) -- Para evitar que se inserte más de una respuesta para la misma pregunta en el mismo formulario de poligrafía
);

--16. Formulario Socioeconómico (relación 1:1 con Servicios, cada servicio tiene un formulario socioeconómico, y cada formulario socioeconómico pertenece a un servicio específico)
CREATE TABLE Formulario_Socioeconomico (
    id_socioeconomico INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_servicio INT NOT NULL UNIQUE,
    fecha_visita DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Información del hogar
    personas_en_casa SMALLINT NOT NULL CHECK (personas_en_casa > 0),
    personas_aportan_ingreso SMALLINT NOT NULL CHECK (personas_aportan_ingreso >= 0),
    -- Información financiera
    ingreso_mensual_personal DECIMAL(10,2) NOT NULL,
    ingreso_mensual_hogar DECIMAL(10,2) NOT NULL,
    gastos_mensuales_aproximados DECIMAL(10,2) NULL,
    deudas_actuales DECIMAL(10,2) NULL,
    --Vivienda
    tipo_vivienda VARCHAR(20) CHECK (tipo_vivienda IN ('Propia','Alquilada','Familiar','Hipotecada')),
    -- Información laboral actual
    trabaja_actualmente BOOLEAN NOT NULL,
    empresa_actual VARCHAR(150) NULL,
    tiempo_trabajando_meses INT NULL,
    -- Información del cónyuge
    estado_civil VARCHAR(20) CHECK (estado_civil IN ('Soltero','Casado','Union libre','Divorciado','Viudo')),
    nombre_conyugue VARCHAR(150) NULL,
    telefono_conyugue VARCHAR(20) NULL,
    lugar_trabajo_conyugue VARCHAR(150) NULL,
    comentarios TEXT NULL,
    estado_formulario VARCHAR(20) NOT NULL DEFAULT 'En proceso' CHECK (estado_formulario IN ('En proceso','Finalizado')),
    fecha_ultima_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_FormSocio_Servicio FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio)
);

--16.1 Documentos del Formulario Socioeconómico (relación 1:N con Formulario_Socioeconomico, cada formulario socioeconómico puede tener varios documentos relacionados)
CREATE TABLE Documentos_Socioeconomico (
    id_documento INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_socioeconomico INT NOT NULL,
    tipo_documento VARCHAR(50) NOT NULL CHECK (tipo_documento IN ('DNI', 'Titulo Academico', 'Antecedente Penal', 'Antecedente Policial','Otro')),
    nombre_archivo VARCHAR(200) NOT NULL,
    url_documento TEXT NOT NULL, -- Ruta o URL del documento que esa imagen basicamente estaria en la nube o en un servidor de archivos(supabase), y aqui solo se guarda la referencia a esa imagen
    CONSTRAINT FK_Documentos_Socio FOREIGN KEY (id_socioeconomico) REFERENCES Formulario_Socioeconomico(id_socioeconomico)
);

--17. Formulario Psicométrico (relación 1:1 con Servicios)
CREATE TABLE Formulario_Psicometrico (
    id_psicometrico INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_servicio INT NOT NULL UNIQUE,
    url_reporte_pdf TEXT NULL, -- Ruta o URL del reporte PDF generado por la evaluación psicométrica, que estaría en la nube o en un servidor de archivos(supabase), y aquí solo se guarda la referencia a ese archivo
    comentarios TEXT NULL,
    fecha_evaluacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_formulario VARCHAR(20) NOT NULL DEFAULT 'En proceso' CHECK (estado_formulario IN ('En proceso','Finalizado')),
    fecha_ultima_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, --Para lo del TIMER, campo para autogardado, se actualiza cada vez que se modifica el formulario
    CONSTRAINT FK_FormPsico_Servicio FOREIGN KEY (id_servicio) REFERENCES Servicios(id_servicio)
);

--Autoguardado se aplica a nivel de frontend con JavaScript y backend al actualizar la fecha_ultima_actualizacion

-- AUDITORIA
------------------------------------------------------------

-- 18. Actividad del login (login y acciones en la pagina)
CREATE TABLE Actividad_Login (
    id_actividad INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_empleado INT NOT NULL,
    fecha_inicio_sesion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierra_sesion TIMESTAMP NULL,
    CONSTRAINT FK_Actividad_Empleado FOREIGN KEY (id_empleado) REFERENCES Empleados(id_empleado)
);

-- 19. Historial de modificaciones (para auditoria detallada de cambios en tablas críticas)
CREATE TABLE Historial_Modificaciones (
    id_historial INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabla_modificada VARCHAR(50) NOT NULL, -- Nombre de la tabla donde ocurrió el cambio (Servicios, Facturas, Respuestas, etc.)
    id_registro INT NOT NULL, -- ID del registro exacto que fue modificado
    -- Ej: servicio 15, factura 3, respuesta 220, etc.
    campo_modificado VARCHAR(50) NOT NULL, --- Nombre del campo que cambió (status_factura, id_encargado, respuesta, etc.)
    valor_anterior TEXT NULL, -- Valor que tenía el campo antes del cambio
    valor_nuevo TEXT NULL, -- Valor que tiene el campo después del cambio   
    fecha_modificacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_empleado INT NOT NULL, -- Empleado que realizó la modificación
    CONSTRAINT FK_Historial_Empleado FOREIGN KEY (id_empleado) REFERENCES Empleados(id_empleado)
);

CREATE INDEX IX_Historial_Tabla 
ON Historial_Modificaciones(tabla_modificada, id_registro); -- Para acelerar consultas por tabla y registro específico en el historial de modificaciones


-- 20. Sesiones (para manejar sesiones de usuario en la aplicación,con express session) 
CREATE TABLE "session" (
  "sid" varchar NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  PRIMARY KEY ("sid")
);

CREATE INDEX "IDX_session_expire" ON "session" ("expire");