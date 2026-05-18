-- =====================================================
-- BASE DE DATOS SECU 

-- =====================================================


-- =====================================================
-- 1. DEPARTAMENTOS
-- =====================================================
CREATE TABLE Departamentos (
    id_departamento INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    departamento    VARCHAR(25) NOT NULL
);


-- =====================================================
-- 2. CIUDADES
-- =====================================================
CREATE TABLE Ciudades (
    id_ciudad       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ciudad          VARCHAR(40) NOT NULL,
    id_departamento INT NOT NULL,
    CONSTRAINT FK_Ciudades_Departamentos FOREIGN KEY (id_departamento)
        REFERENCES Departamentos(id_departamento),
    CONSTRAINT UQ_Ciudad_Departamento UNIQUE (id_departamento, ciudad)
);


-- =====================================================
-- 3. PUESTO_TRABAJO
-- =====================================================
CREATE TABLE Puesto_Trabajo (
    id_puesto INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    puesto    VARCHAR(40) NOT NULL
);


-- =====================================================
-- 4. PERSONAS
-- =====================================================
CREATE TABLE Personas (
    id_persona       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    p_nombre         VARCHAR(60)  NOT NULL,
    s_nombre         VARCHAR(60)  NOT NULL,
    p_apellido       VARCHAR(60)  NOT NULL,
    s_apellido       VARCHAR(60)  NOT NULL,
    dni              VARCHAR(15)  NOT NULL UNIQUE,
    correo           VARCHAR(30)  NOT NULL UNIQUE,
    telefono         VARCHAR(20)  NOT NULL,
    direccion        VARCHAR(200) NOT NULL,
    genero           VARCHAR(15)  NULL CHECK (genero IN ('Masculino', 'Femenino', 'Otro')),
    fecha_nacimiento DATE         NOT NULL,
    id_ciudad        INT          NOT NULL,
    CONSTRAINT FK_Ciudad_Persona FOREIGN KEY (id_ciudad) REFERENCES Ciudades(id_ciudad)
);


-- =====================================================
-- 5. EMPLEADOS  (herencia de Personas)
-- Nota: id_puesto eliminado → ver tabla empleado_puesto
-- =====================================================
CREATE TABLE Empleados (
    id_empleado           INT     PRIMARY KEY,
    usuario               VARCHAR(15)  NOT NULL UNIQUE,
    contrasenia           TEXT         NOT NULL,
    requiere_cambio       BOOLEAN      DEFAULT FALSE,
    fecha_ultimo_cambio   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    fecha_contratacion    DATE         NOT NULL,
    estado_empleado       BOOLEAN      DEFAULT TRUE,
    CONSTRAINT FK_Empleados_Personas FOREIGN KEY (id_empleado)
        REFERENCES Personas(id_persona)
);


-- =====================================================
-- 6. CANDIDATOS  (herencia de Personas)
-- =====================================================
CREATE TABLE Candidatos (
    id_candidato INT PRIMARY KEY,
    CONSTRAINT FK_Candidatos_Personas FOREIGN KEY (id_candidato)
        REFERENCES Personas(id_persona)
);


-- =====================================================
-- 7. ROLES
-- =====================================================
CREATE TABLE Roles (
    id_rol INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rol    VARCHAR(30) NOT NULL UNIQUE
);


-- =====================================================
-- 8. EMPLEADO_ROL  (muchos roles por empleado)
-- =====================================================
CREATE TABLE Empleado_Rol (
    id_empleado INT NOT NULL,
    id_rol      INT NOT NULL,
    PRIMARY KEY (id_empleado, id_rol),
    FOREIGN KEY (id_empleado) REFERENCES Empleados(id_empleado),
    FOREIGN KEY (id_rol)      REFERENCES Roles(id_rol)
);


-- =====================================================
-- 9. EMPLEADO_PUESTO  (N:M — reemplaza id_puesto en Empleados)
-- =====================================================
CREATE TABLE empleado_puesto (
    id_empleado INT NOT NULL REFERENCES Empleados(id_empleado)    ON DELETE CASCADE,
    id_puesto   INT NOT NULL REFERENCES Puesto_Trabajo(id_puesto) ON DELETE CASCADE,
    PRIMARY KEY (id_empleado, id_puesto)
);


-- =====================================================
-- 10. EMPRESAS
-- =====================================================
CREATE TABLE Empresas (
    id_empresa INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa    VARCHAR(100) NOT NULL
);


-- =====================================================
-- 11. TIPO_SERVICIO
-- =====================================================
CREATE TABLE Tipo_Servicio (
    id_tipo_servicio INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_servicio    VARCHAR(100)   NOT NULL,
    precio_actual    DECIMAL(10,2)  NOT NULL
);


-- =====================================================
-- 12. TIPO_SERVICIO_PUESTO  (mapeo tipo_servicio ↔ puesto)
-- =====================================================
CREATE TABLE tipo_servicio_puesto (
    id_tipo_servicio INT NOT NULL REFERENCES Tipo_Servicio(id_tipo_servicio) ON DELETE CASCADE,
    id_puesto        INT NOT NULL REFERENCES Puesto_Trabajo(id_puesto)       ON DELETE CASCADE,
    PRIMARY KEY (id_tipo_servicio, id_puesto)
);


-- =====================================================
-- 13. COTIZACIONES
-- =====================================================
CREATE TABLE Cotizaciones (
    id_cotizacion      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo_cotizacion  VARCHAR(30)   NOT NULL UNIQUE,
    id_empresa         INT           NOT NULL,
    fecha_cotizacion   DATE          NOT NULL DEFAULT CURRENT_DATE,
    subtotal           DECIMAL(10,2) NOT NULL DEFAULT 0,
    impuesto_iva       DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_cotizado     DECIMAL(10,2) NOT NULL DEFAULT 0,
    estado_cotizacion  VARCHAR(15)   NOT NULL
        CHECK (estado_cotizacion IN ('Pendiente', 'Aceptada', 'Rechazada')),
    -- Campos agregados en CAMBIOS 2
    vigencia_dias      INT           NOT NULL DEFAULT 30,
    contacto           VARCHAR(100)  NULL,
    observaciones      TEXT          NULL,
    CONSTRAINT FK_Cotizacion_Empresa FOREIGN KEY (id_empresa)
        REFERENCES Empresas(id_empresa)
);


-- =====================================================
-- 14. COTIZACION_DETALLE
-- =====================================================
CREATE TABLE Cotizacion_Detalle (
    id_detalle       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_cotizacion    INT           NOT NULL,
    id_tipo_servicio INT           NOT NULL,
    cantidad         INT           NOT NULL CHECK (cantidad > 0),
    precio_unitario  DECIMAL(10,2) NOT NULL,
    subtotal_linea   DECIMAL(10,2) NOT NULL,
    CONSTRAINT FK_Detalle_Cotizacion    FOREIGN KEY (id_cotizacion)    REFERENCES Cotizaciones(id_cotizacion),
    CONSTRAINT FK_Detalle_TipoServicio  FOREIGN KEY (id_tipo_servicio) REFERENCES Tipo_Servicio(id_tipo_servicio),
    CONSTRAINT UQ_Cotizacion_TipoServicio UNIQUE (id_cotizacion, id_tipo_servicio)
);


-- =====================================================
-- 15. FACTURAS
-- =====================================================
CREATE TABLE Facturas (
    id_factura          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_empresa          INT           NOT NULL,
    numero_factura      VARCHAR(60)   NOT NULL,
    fecha_factura       DATE          NULL,
    status_factura      VARCHAR(20)   NOT NULL
        CHECK (status_factura IN ('Pendiente', 'Pagada', 'Negada')),
    url_imagen_factura  TEXT          NULL,
    -- Agregados en CAMBIOS 3
    id_cotizacion       INT           NULL,
    monto_total         DECIMAL(10,2) NULL,
    CONSTRAINT FK_Factura_Empresa      FOREIGN KEY (id_empresa)    REFERENCES Empresas(id_empresa),
    CONSTRAINT UQ_Factura_Empresa      UNIQUE (id_empresa, numero_factura),
    CONSTRAINT fk_facturas_cotizaciones FOREIGN KEY (id_cotizacion)
        REFERENCES Cotizaciones(id_cotizacion) ON DELETE RESTRICT,
    CONSTRAINT check_monto_positivo    CHECK (monto_total >= 0)
);


-- =====================================================
-- 16. EXPEDIENTES
-- Agrupa varios servicios de un mismo candidato para una empresa
-- (ej: poligrafía + socioeconómico + psicométrico = 1 expediente)
-- =====================================================
CREATE TABLE Expedientes (
    id_expediente    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_candidato     INT          NOT NULL,
    id_empresa       INT          NOT NULL,
    fecha_expediente DATE         NOT NULL DEFAULT CURRENT_DATE,
    estado           VARCHAR(20)  NOT NULL DEFAULT 'En proceso'
        CHECK (estado IN ('En proceso', 'Finalizado', 'Cancelado')),
    observaciones    TEXT         NULL,
    CONSTRAINT FK_Expediente_Candidato FOREIGN KEY (id_candidato)
        REFERENCES Candidatos(id_candidato),
    CONSTRAINT FK_Expediente_Empresa   FOREIGN KEY (id_empresa)
        REFERENCES Empresas(id_empresa)
);


-- =====================================================
-- 17. SERVICIOS  (tabla central)
-- =====================================================
CREATE TABLE Servicios (
    id_servicio          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_candidato         INT          NOT NULL,
    id_tipo_servicio     INT          NOT NULL,
    id_empresa           INT          NOT NULL,
    id_ciudad            INT          NOT NULL,
    id_encuestador       INT          NULL,
    id_creador           INT          NOT NULL,
    id_cotizacion        INT          NULL,
    id_expediente        INT          NULL,
    id_factura           INT          NULL,
    fecha_servicio       DATE         NOT NULL,
    fecha_limite         DATE         NULL,
    estado_servicio      VARCHAR(20)  NOT NULL DEFAULT 'Pendiente'
        CHECK (estado_servicio IN ('Pendiente', 'En proceso', 'Finalizado', 'Cancelado')),
    formulario_bloqueado BOOLEAN      NOT NULL DEFAULT FALSE,
    direccion_servicio   TEXT         NULL,
    CONSTRAINT FK_Servicio_Candidato   FOREIGN KEY (id_candidato)     REFERENCES Candidatos(id_candidato),
    CONSTRAINT FK_Servicio_Tipo        FOREIGN KEY (id_tipo_servicio)  REFERENCES Tipo_Servicio(id_tipo_servicio),
    CONSTRAINT FK_Servicio_Empresa     FOREIGN KEY (id_empresa)        REFERENCES Empresas(id_empresa),
    CONSTRAINT FK_Servicio_Ciudad      FOREIGN KEY (id_ciudad)         REFERENCES Ciudades(id_ciudad),
    CONSTRAINT FK_Servicio_Encuestador FOREIGN KEY (id_encuestador)    REFERENCES Empleados(id_empleado),
    CONSTRAINT FK_Servicio_Creador     FOREIGN KEY (id_creador)        REFERENCES Empleados(id_empleado),
    CONSTRAINT FK_Servicio_Cotizacion  FOREIGN KEY (id_cotizacion)     REFERENCES Cotizaciones(id_cotizacion),
    CONSTRAINT FK_Servicio_Expediente  FOREIGN KEY (id_expediente)     REFERENCES Expedientes(id_expediente),
    CONSTRAINT fk_servicios_facturas   FOREIGN KEY (id_factura)
        REFERENCES Facturas(id_factura) ON DELETE SET NULL
);


-- =====================================================
-- FORMULARIOS ESTÁTICOS
-- =====================================================

-- =====================================================
-- 18. FORMULARIO_POLIGRAFIA  (1:1 con Servicios)
-- =====================================================
CREATE TABLE Formulario_Poligrafia (
    id_poligrafia              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_servicio                INT          NOT NULL UNIQUE,
    nivel_veracidad_general    SMALLINT     CHECK (nivel_veracidad_general BETWEEN 1 AND 10),
    resultado                  VARCHAR(20)  NOT NULL
        CHECK (resultado IN ('Verdad', 'Engaño', 'Inconcluso')),
    comentarios                TEXT         NULL,
    firma_evaluador            BOOLEAN      NULL DEFAULT FALSE,
    fecha_evaluacion           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_formulario          VARCHAR(20)  NOT NULL DEFAULT 'En proceso'
        CHECK (estado_formulario IN ('En proceso', 'Finalizado')),
    fecha_ultima_actualizacion TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Agregado en CAMBIOS 6
    tiempo_llenado_segundos    INT          NULL,
    CONSTRAINT FK_FormPoligrafia_Servicio FOREIGN KEY (id_servicio)
        REFERENCES Servicios(id_servicio)
);


-- =====================================================
-- 18.1. RESPUESTAS_POLIGRAFIA  (1:N con Formulario_Poligrafia)
-- =====================================================
CREATE TABLE Respuestas_Poligrafia (
    id_respuesta    INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_poligrafia   INT      NOT NULL,
    numero_pregunta SMALLINT NOT NULL,
    respuesta       BOOLEAN  NOT NULL,
    CONSTRAINT FK_Respuestas_Poligrafia FOREIGN KEY (id_poligrafia)
        REFERENCES Formulario_Poligrafia(id_poligrafia),
    CONSTRAINT UQ_Pregunta_Poligrafia UNIQUE (id_poligrafia, numero_pregunta)
);


-- =====================================================
-- 19. FORMULARIO_SOCIOECONOMICO  (1:1 con Servicios)
-- =====================================================
CREATE TABLE Formulario_Socioeconomico (
    id_socioeconomico              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_servicio                    INT           NOT NULL UNIQUE,
    fecha_visita                   DATE          NOT NULL DEFAULT CURRENT_DATE,
    -- Información del hogar
    personas_en_casa               SMALLINT      NOT NULL CHECK (personas_en_casa > 0),
    personas_aportan_ingreso       SMALLINT      NOT NULL CHECK (personas_aportan_ingreso >= 0),
    -- Información financiera
    ingreso_mensual_personal       DECIMAL(10,2) NOT NULL,
    ingreso_mensual_hogar          DECIMAL(10,2) NOT NULL,
    gastos_mensuales_aproximados   DECIMAL(10,2) NULL,
    deudas_actuales                DECIMAL(10,2) NULL,
    -- Vivienda
    tipo_vivienda                  VARCHAR(20)   CHECK (tipo_vivienda IN ('Propia', 'Alquilada', 'Familiar', 'Hipotecada')),
    -- Información laboral actual
    trabaja_actualmente            BOOLEAN       NOT NULL,
    empresa_actual                 VARCHAR(150)  NULL,
    tiempo_trabajando_meses        INT           NULL,
    -- Información del cónyuge
    estado_civil                   VARCHAR(20)   CHECK (estado_civil IN ('Soltero', 'Casado', 'Union libre', 'Divorciado', 'Viudo')),
    nombre_conyugue                VARCHAR(150)  NULL,
    telefono_conyugue              VARCHAR(20)   NULL,
    lugar_trabajo_conyugue         VARCHAR(150)  NULL,
    comentarios                    TEXT          NULL,
    estado_formulario              VARCHAR(20)   NOT NULL DEFAULT 'En proceso'
        CHECK (estado_formulario IN ('En proceso', 'Finalizado')),
    fecha_ultima_actualizacion     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Agregado en CAMBIOS 6
    tiempo_llenado_segundos        INT           NULL,
    CONSTRAINT FK_FormSocio_Servicio FOREIGN KEY (id_servicio)
        REFERENCES Servicios(id_servicio)
);


-- =====================================================
-- 19.1. DOCUMENTOS_SOCIOECONOMICO  (1:N con Formulario_Socioeconomico)
-- =====================================================
CREATE TABLE Documentos_Socioeconomico (
    id_documento      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_socioeconomico INT          NOT NULL,
    tipo_documento    VARCHAR(50)  NOT NULL
        CHECK (tipo_documento IN ('DNI', 'Titulo Academico', 'Antecedente Penal', 'Antecedente Policial', 'Otro')),
    nombre_archivo    VARCHAR(200) NOT NULL,
    url_documento     TEXT         NOT NULL,
    CONSTRAINT FK_Documentos_Socio FOREIGN KEY (id_socioeconomico)
        REFERENCES Formulario_Socioeconomico(id_socioeconomico)
);


-- =====================================================
-- 20. FORMULARIO_PSICOMETRICO  (1:1 con Servicios)
-- =====================================================
CREATE TABLE Formulario_Psicometrico (
    id_psicometrico            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_servicio                INT       NOT NULL UNIQUE,
    url_reporte_pdf            TEXT      NULL,
    comentarios                TEXT      NULL,
    fecha_evaluacion           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_formulario          VARCHAR(20) NOT NULL DEFAULT 'En proceso'
        CHECK (estado_formulario IN ('En proceso', 'Finalizado')),
    fecha_ultima_actualizacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Agregado en CAMBIOS 6
    tiempo_llenado_segundos    INT       NULL,
    CONSTRAINT FK_FormPsico_Servicio FOREIGN KEY (id_servicio)
        REFERENCES Servicios(id_servicio)
);


-- =====================================================
-- AUDITORÍA
-- =====================================================

-- =====================================================
-- 21. ACTIVIDAD_LOGIN
-- =====================================================
CREATE TABLE Actividad_Login (
    id_actividad        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_empleado         INT       NOT NULL,
    fecha_inicio_sesion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierra_sesion TIMESTAMP NULL,
    -- Agregado en CAMBIOS 4
    ip_address          VARCHAR(50) NULL,
    CONSTRAINT FK_Actividad_Empleado FOREIGN KEY (id_empleado)
        REFERENCES Empleados(id_empleado)
);


-- =====================================================
-- 22. HISTORIAL_MODIFICACIONES
-- =====================================================
CREATE TABLE Historial_Modificaciones (
    id_historial       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabla_modificada   VARCHAR(50) NOT NULL,
    id_registro        INT         NOT NULL,
    campo_modificado   VARCHAR(50) NOT NULL,
    valor_anterior     TEXT        NULL,
    valor_nuevo        TEXT        NULL,
    fecha_modificacion TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_empleado        INT         NOT NULL,
    CONSTRAINT FK_Historial_Empleado FOREIGN KEY (id_empleado)
        REFERENCES Empleados(id_empleado)
);


-- =====================================================
-- 23. SESSION  (express-session)
-- =====================================================
CREATE TABLE "session" (
    "sid"    VARCHAR   NOT NULL,
    "sess"   JSON      NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    PRIMARY KEY ("sid")
);


-- =====================================================
-- ÍNDICES DE OPTIMIZACIÓN
-- =====================================================

-- Ciudades
CREATE INDEX idx_ciudades_departamento     ON Ciudades(id_departamento);

-- Personas
CREATE INDEX idx_personas_ciudad           ON Personas(id_ciudad);

-- Facturas
CREATE INDEX idx_facturas_empresa          ON Facturas(id_empresa);
CREATE INDEX idx_factura_numero            ON Facturas(numero_factura);

-- Cotizaciones
CREATE INDEX idx_cotizaciones_empresa      ON Cotizaciones(id_empresa);

-- Detalle Cotizaciones
CREATE INDEX idx_detalle_cotizacion        ON Cotizacion_Detalle(id_cotizacion);

-- Servicios (tabla central)
CREATE INDEX idx_servicios_candidato       ON Servicios(id_candidato);
CREATE INDEX idx_servicios_empresa         ON Servicios(id_empresa);
CREATE INDEX idx_servicios_tipo            ON Servicios(id_tipo_servicio);
CREATE INDEX idx_servicios_ciudad          ON Servicios(id_ciudad);
CREATE INDEX idx_servicios_encuestador     ON Servicios(id_encuestador);
CREATE INDEX idx_servicios_factura         ON Servicios(id_factura);
CREATE INDEX idx_servicios_cotizacion      ON Servicios(id_cotizacion);
CREATE INDEX idx_servicios_estado          ON Servicios(estado_servicio);
CREATE INDEX idx_servicios_expediente      ON Servicios(id_expediente);

-- Poligrafía
CREATE INDEX idx_respuestas_poligrafia     ON Respuestas_Poligrafia(id_poligrafia);

-- Socioeconómico Documentos
CREATE INDEX idx_documentos_socio          ON Documentos_Socioeconomico(id_socioeconomico);

-- Auditoría
CREATE INDEX idx_actividad_login_empleado  ON Actividad_Login(id_empleado);
CREATE INDEX idx_historial_empleado_fecha  ON Historial_Modificaciones(id_empleado, fecha_modificacion DESC);
CREATE INDEX IX_Historial_Tabla            ON Historial_Modificaciones(tabla_modificada, id_registro);
CREATE INDEX "IDX_session_expire"          ON "session" ("expire");

