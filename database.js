const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'rental.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_name TEXT,
        property TEXT,
        start_date TEXT,
        end_date TEXT,
        monthly_rent REAL,
        currency TEXT DEFAULT 'ILS',
        pdf_path TEXT,
        raw_text TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER,
        due_date TEXT,
        amount REAL,
        paid INTEGER DEFAULT 0,
        paid_date TEXT,
        notes TEXT,
        FOREIGN KEY (contract_id) REFERENCES contracts(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        address TEXT,
        type TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contract_id INTEGER,
        event_date TEXT,
        type TEXT,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (contract_id) REFERENCES contracts(id)
      )
    `, (err) => {
      if (err) {
        console.error('Error creating tables:', err.message);
      } else {
        console.log('Database tables initialized successfully');
      }
    });
  });
}

module.exports = db;
