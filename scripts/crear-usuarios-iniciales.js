/**
 * Script para crear usuarios iniciales del sistema SECU
 * 
 * Ejecutar con: node scripts/crear-usuarios-iniciales.js
 * 
 * Usuarios creados:
 * - admin (Administrador)
 * - wilson (Digitador)
 * - angie (Digitador)
 * - ariel (Digitador)
 * - jeancarlo (Encuestador)
 * - antony (Encuestador)
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Usuarios a crear
const usuarios = [
  {
    p_nombre: 'Admin',
    s_nombre: '',
    p_apellido: 'Sistema',
    s_apellido: '',
    dni: '0801-1990-00001',
    correo: 'admin@secu.hn',
    telefono: '9999-0001',
    direccion: 'Tegucigalpa, Francisco Morazan',
    genero: 'Masculino',
    fecha_nacimiento: '1990-01-01',
    id_ciudad: 1, // Tegucigalpa
    usuario: 'admin',
    contrasenia: 'Admin123!',
    id_puesto: 1, // Administrador
    roles: [1] // Administrador
  },
  {
    p_nombre: 'Wilson',
    s_nombre: 'Daniel',
    p_apellido: 'Avila',
    s_apellido: 'Flores',
    dni: '0801-2005-08750',
    correo: 'wilson@secu.hn',
    telefono: '9681-1136',
    direccion: 'Tegucigalpa, Francisco Morazan',
    genero: 'Masculino',
    fecha_nacimiento: '2005-04-01',
    id_ciudad: 1,
    usuario: 'wilson',
    contrasenia: 'Wilson123!',
    id_puesto: 5, // Digitador
    roles: [3] // Digitador
  },
  {
    p_nombre: 'Angie',
    s_nombre: '',
    p_apellido: 'Enamorado',
    s_apellido: '',
    dni: '0801-1996-00003',
    correo: 'angie@secu.hn',
    telefono: '9999-0003',
    direccion: 'Tegucigalpa, Francisco Morazan',
    genero: 'Femenino',
    fecha_nacimiento: '1996-03-20',
    id_ciudad: 1,
    usuario: 'angie',
    contrasenia: 'Angie123!',
    id_puesto: 5, // Digitador
    roles: [3] // Digitador
  },
  {
    p_nombre: 'Eddy',
    s_nombre: 'Ariel',
    p_apellido: 'Cruz',
    s_apellido: '',
    dni: '0801-1994-00004',
    correo: 'ariel@secu.hn',
    telefono: '9999-0004',
    direccion: 'Tegucigalpa, Francisco Morazan',
    genero: 'Masculino',
    fecha_nacimiento: '1994-08-10',
    id_ciudad: 1,
    usuario: 'ariel',
    contrasenia: 'Ariel123!',
    id_puesto: 5, // Digitador
    roles: [3] // Digitador
  },
  {
    p_nombre: 'Jeancarlo',
    s_nombre: '',
    p_apellido: 'Suares',
    s_apellido: '',
    dni: '0801-1997-00005',
    correo: 'jeancarlo@secu.hn',
    telefono: '9999-0005',
    direccion: 'Tegucigalpa, Francisco Morazan',
    genero: 'Masculino',
    fecha_nacimiento: '1997-11-25',
    id_ciudad: 1,
    usuario: 'jeancarlo',
    contrasenia: 'Jeancarlo123!',
    id_puesto: 3, // Encuestador
    roles: [2] // Encuestador
  },
  {
    p_nombre: 'Antony',
    s_nombre: '',
    p_apellido: 'Funez',
    s_apellido: '',
    dni: '0801-1998-00006',
    correo: 'antony@secu.hn',
    telefono: '9999-0006',
    direccion: 'Tegucigalpa, Francisco Morazan',
    genero: 'Masculino',
    fecha_nacimiento: '1998-02-14',
    id_ciudad: 1,
    usuario: 'antony',
    contrasenia: 'Antony123!',
    id_puesto: 3, // Encuestador
    roles: [2] // Encuestador
  }
];

async function crearUsuarios() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(60));
    console.log('SCRIPT DE CREACION DE USUARIOS INICIALES - SECU');
    console.log('='.repeat(60));
    console.log('');

    for (const usuario of usuarios) {
      try {
        await client.query('BEGIN');

        // Verificar si el usuario ya existe
        const existeUsuario = await client.query(
          'SELECT id_empleado FROM empleados WHERE usuario = $1',
          [usuario.usuario]
        );

        if (existeUsuario.rows.length > 0) {
          console.log(`[EXISTE] Usuario '${usuario.usuario}' ya existe, saltando...`);
          await client.query('ROLLBACK');
          continue;
        }

        // Verificar si el DNI ya existe
        const existeDNI = await client.query(
          'SELECT id_persona FROM personas WHERE dni = $1',
          [usuario.dni]
        );

        if (existeDNI.rows.length > 0) {
          console.log(`[EXISTE] DNI '${usuario.dni}' ya existe, saltando...`);
          await client.query('ROLLBACK');
          continue;
        }

        // Hash de la contrasenia
        const hashedPassword = await bcrypt.hash(usuario.contrasenia, 10);

        // Insertar persona
        const personaResult = await client.query(
          `INSERT INTO personas (p_nombre, s_nombre, p_apellido, s_apellido, dni, correo, telefono, direccion, genero, fecha_nacimiento, id_ciudad)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id_persona`,
          [
            usuario.p_nombre, usuario.s_nombre, usuario.p_apellido, usuario.s_apellido,
            usuario.dni, usuario.correo, usuario.telefono, usuario.direccion,
            usuario.genero, usuario.fecha_nacimiento, usuario.id_ciudad
          ]
        );

        const idPersona = personaResult.rows[0].id_persona;

        // Insertar empleado
        await client.query(
          `INSERT INTO empleados (id_empleado, usuario, contrasenia, requiere_cambio, id_puesto, fecha_contratacion)
           VALUES ($1, $2, $3, TRUE, $4, CURRENT_DATE)`,
          [idPersona, usuario.usuario, hashedPassword, usuario.id_puesto]
        );

        // Insertar roles
        for (const idRol of usuario.roles) {
          await client.query(
            'INSERT INTO empleado_rol (id_empleado, id_rol) VALUES ($1, $2)',
            [idPersona, idRol]
          );
        }

        await client.query('COMMIT');

        const rolesNombres = usuario.roles.map(r => {
          if (r === 1) return 'Administrador';
          if (r === 2) return 'Encuestador';
          if (r === 3) return 'Digitador';
          return 'Desconocido';
        }).join(', ');

        console.log(`[CREADO] Usuario: ${usuario.usuario}`);
        console.log(`         Nombre: ${usuario.p_nombre} ${usuario.p_apellido}`);
        console.log(`         Roles: ${rolesNombres}`);
        console.log(`         Contrasenia temporal: ${usuario.contrasenia}`);
        console.log('');

      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[ERROR] Error creando usuario '${usuario.usuario}':`, err.message);
      }
    }

    console.log('='.repeat(60));
    console.log('RESUMEN DE CREDENCIALES');
    console.log('='.repeat(60));
    console.log('');
    console.log('Usuario      | Contrasenia      | Rol');
    console.log('-'.repeat(50));
    usuarios.forEach(u => {
      const rol = u.roles.includes(1) ? 'Administrador' : 
                  u.roles.includes(2) ? 'Encuestador' : 'Digitador';
      console.log(`${u.usuario.padEnd(12)} | ${u.contrasenia.padEnd(16)} | ${rol}`);
    });
    console.log('');
    console.log('NOTA: Todos los usuarios deben cambiar su contrasenia');
    console.log('      en el primer inicio de sesion.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error general:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

crearUsuarios();
