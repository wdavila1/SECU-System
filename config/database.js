const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Verificar conexión y configurar zona horaria Honduras (UTC-6)
pool.on('connect', (client) => {
  client.query("SET timezone = 'America/Tegucigalpa'");
  console.log('Conectado a PostgreSQL (Supabase)');
});

pool.on('error', (err) => {
  console.error('Error en la conexión a PostgreSQL:', err);
});

// Función helper para ejecutar queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query ejecutada', { text: text.substring(0, 50), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error en query:', error);
    throw error;
  }
};

module.exports = { pool, query };
