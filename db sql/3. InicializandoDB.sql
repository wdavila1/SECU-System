
--Tipos de servicios
INSERT INTO Tipo_Servicio (tipo_servicio, precio_actual) VALUES
('Poligrafía', 1045.00),
('Estudio Socioeconómico Urbano', 845.00),
('Estudio Socioeconómico Rural', 900.00),
('Evaluación Psicométrica', 600.00);

--PUESTOS DE TRABAJO
INSERT INTO Puesto_Trabajo (puesto) VALUES
('Administrador'),
('Poligrafista'),
('Encuestador'),
('Psicólogo Evaluador'),
('Digitador');

--ROLES
INSERT INTO Roles (rol) VALUES
('Administrador'),
('Encuestador'),
('Digitador');

--DEPARTAMENTOS
INSERT INTO Departamentos (departamento) VALUES
('Atlántida'),
('Colón'),
('Comayagua'),
('Copán'),
('Cortés'),
('Choluteca'),
('El Paraíso'),
('Francisco Morazán'),
('Gracias a Dios'),
('Intibucá'),
('Islas de la Bahía'),
('La Paz'),
('Lempira'),
('Ocotepeque'),
('Olancho'),
('Santa Bárbara'),
('Valle'),
('Yoro');

---------------------------
---------------------------

-- CIUDADES (MÁS IMPORTANTES)

--Francisco Morazán
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('Tegucigalpa', 8),
('Comayagüela', 8),
('Valle de Ángeles', 8),
('Santa Lucía', 8),
('Talanga', 8),
('Ojojona', 8),
('San Antonio de Oriente', 8),
('Tatumbla', 8),
('Cedros', 8),
('Maraita', 8);

--Cortes
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('San Pedro Sula', 5),
('Puerto Cortés', 5),
('Choloma', 5),
('La Lima', 5),
('Villanueva', 5),
('Omoa', 5),
('San Manuel', 5),
('Santa Cruz de Yojoa', 5),
('Potrerillos', 5),
('San Antonio de Cortés', 5);

--Atlántida
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('La Ceiba', 1),
('Tela', 1),
('Jutiapa', 1),
('Arizona', 1),
('Esparta', 1),
('El Porvenir', 1),
('La Masica', 1),
('San Francisco', 1);

--Yoro
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('El Progreso', 18),
('Yoro', 18),
('Olanchito', 18),
('Victoria', 18),
('Morazán', 18),
('Arenal', 18),
('Jocón', 18),
('El Negrito', 18);

--Comayagua
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('Comayagua', 3),
('Siguatepeque', 3),
('La Libertad', 3),
('Ajuterique', 3),
('Villa de San Antonio', 3),
('San Jerónimo', 3),
('Taulabé', 3),
('Las Lajas', 3);

--Choluteca
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('Choluteca', 6),
('San Marcos de Colón', 6),
('Pespire', 6),
('El Corpus', 6),
('Apacilagua', 6),
('Orocuina', 6),
('Duyure', 6);

--Olancho
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('Juticalpa', 15),
('Catacamas', 15),
('Campamento', 15),
('San Esteban', 15),
('Dulce Nombre de Culmí', 15),
('Santa María del Real', 15),
('Salamá', 15);

--Copán
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('Santa Rosa de Copán', 4),
('La Entrada', 4),
('Copán Ruinas', 4),
('San Juan de Opoa', 4),
('Cabañas', 4),
('Florida', 4),
('Trinidad de Copán', 4);

--Santa Bárbara
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('Santa Bárbara', 16),
('Quimistán', 16),
('San Luis', 16),
('Macuelizo', 16),
('Trinidad', 16),
('Las Vegas', 16),
('Azacualpa', 16);

--Islas de la Bahía
INSERT INTO Ciudades (ciudad, id_departamento) VALUES
('Roatán', 11),
('Utila', 11),
('Guanaja', 11);

---------------------------
---------------------------

--Empresas de ejemplo (opcional para pruebas)
INSERT INTO Empresas (empresa) VALUES
('Grupo Ficohsa'),
('Banco Atlántida'),
('Tigo Honduras'),
('Claro Honduras'),
('Grupo Karim''s'),
('Dole Honduras'),
('Standard Fruit');