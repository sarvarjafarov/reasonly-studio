const { Pool } = require('pg');
require('dotenv').config();

// Support Heroku's DATABASE_URL or individual connection parameters
let poolConfig;

if (process.env.DATABASE_URL) {
  // Heroku provides DATABASE_URL as a single connection string
  // Heroku Postgres requires SSL but we don't verify certificates
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false, // Don't verify SSL certificate (required for Heroku)
    },
    max: 5, // Keep pool small for Heroku's connection limits
    min: 1, // Minimum connections to keep alive
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 10000, // Wait 10 seconds for connection
    allowExitOnIdle: false, // Keep pool alive
    keepAlive: true, // Enable TCP keepalive
    keepAliveInitialDelayMillis: 10000, // Start keepalive after 10 seconds
  };
} else {
  // Local development uses individual parameters
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'adsdata',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  };
}

let pool = new Pool(poolConfig);

// Track connection state
let isConnected = false;

// Test connection
pool.on('connect', () => {
  isConnected = true;
  console.log('✅ Database connected successfully');
});

// Handle pool errors gracefully - don't crash the process
pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.message);
  isConnected = false;
  // Don't exit - let the pool try to recover
});

// Helper function to execute queries with retry logic
const query = async (text, params, retries = 2) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.log('executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
    }
    isConnected = true;
    return res;
  } catch (error) {
    isConnected = false;
    console.error('Query error:', error.message);

    // Retry on connection errors
    if (retries > 0 && (error.message.includes('Connection terminated') || error.message.includes('timeout'))) {
      console.log(`Retrying query... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 500));
      return query(text, params, retries - 1);
    }

    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  transaction,
};
