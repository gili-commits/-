const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY,
        tenant_name TEXT,
        property TEXT,
        start_date TEXT,
        end_date TEXT,
        monthly_rent REAL,
        currency TEXT DEFAULT 'ILS',
        pdf_path TEXT,
        raw_text TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER,
        due_date TEXT,
        amount REAL,
        paid INTEGER DEFAULT 0,
        paid_date TEXT,
        notes TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE,
        address TEXT,
        type TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER,
        event_date TEXT,
        type TEXT,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err.message);
  }
}

const db = {
  all: (sql, params, callback) => {
    const pgSql = convertPlaceholders(sql);
    pool.query(pgSql, params)
      .then(result => callback(null, result.rows))
      .catch(err => callback(err));
  },
  get: (sql, params, callback) => {
    const pgSql = convertPlaceholders(sql);
    pool.query(pgSql, params)
      .then(result => callback(null, result.rows[0] || null))
      .catch(err => callback(err));
  },
  run: (sql, params, callback) => {
    let pgSql = convertPlaceholders(sql);
    pgSql = pgSql.replace(/INSERT OR IGNORE/i, 'INSERT');
    if (pgSql.trim().toUpperCase().startsWith('INSERT')) {
      pgSql += ' ON CONFLICT DO NOTHING RETURNING id';
    }
    pool.query(pgSql, params)
      .then(result => {
        if (callback) {
          callback.call({ lastID: result.rows[0]?.id || null, changes: result.rowCount }, null);
        }
      })
      .catch(err => {
        if (callback) callback.call({}, err);
      });
  },
  close: () => pool.end()
};

initializeDatabase();

module.exports = db;