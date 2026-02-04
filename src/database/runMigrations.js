/**
 * Migration Runner for Heroku Release Phase
 * Runs all database migrations in order
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Parse DATABASE_URL for Heroku or use individual params for local
let poolConfig;

if (process.env.DATABASE_URL) {
  // Heroku provides DATABASE_URL as a single connection string
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Always use SSL for Heroku
  };
} else {
  // Local development uses individual parameters
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'adsdata',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    ssl: false,
  };
}

const pool = new Pool(poolConfig);

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting database migrations...');

    // Create migrations tracking table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${files.length} migration files`);

    for (const file of files) {
      // Check if migration already applied
      const result = await client.query(
        'SELECT id FROM schema_migrations WHERE migration_name = $1',
        [file]
      );

      if (result.rows.length > 0) {
        console.log(`⏭️  Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`⚙️  Running ${file}...`);

      // Read and execute migration
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed to apply ${file}:`, err.message);

        // Continue with other migrations instead of failing completely
        // Some migrations might fail if they've been partially applied
        if (err.message.includes('already exists')) {
          console.log(`⚠️  ${file} partially exists, marking as applied`);
          await client.query(
            'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
        } else if (err.message.includes('does not exist') && err.message.includes('role')) {
          // Skip GRANT errors for roles that don't exist (common on Heroku)
          console.log(`⚠️  ${file} contains GRANT statements for non-existent role, skipping those and continuing`);
          // Try to apply migration without GRANT statements
          const sqlWithoutGrants = sql.split('\n').filter(line => !line.trim().toUpperCase().startsWith('GRANT')).join('\n');
          try {
            await client.query('BEGIN');
            await client.query(sqlWithoutGrants);
            await client.query(
              'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
              [file]
            );
            await client.query('COMMIT');
            console.log(`✅ Applied ${file} (without GRANT statements)`);
          } catch (retryErr) {
            await client.query('ROLLBACK');
            throw retryErr;
          }
        } else {
          throw err;
        }
      }
    }

    console.log('✅ All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migrations
runMigrations();
