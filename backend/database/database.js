const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Initialize tables
function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Services table
      db.run(`
        CREATE TABLE IF NOT EXISTS services (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT,
          description TEXT,
          eligibility TEXT,
          requiredDocuments TEXT, -- JSON string array
          steps TEXT,             -- JSON string array
          importantNotes TEXT
        )
      `, (err) => {
        if (err) console.error('Error creating services table:', err.message);
      });

      // Eligibility rules table
      db.run(`
        CREATE TABLE IF NOT EXISTS eligibility_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scheme_id TEXT NOT NULL,
          scheme_name TEXT NOT NULL,
          min_age INTEGER DEFAULT 0,
          max_age INTEGER DEFAULT 100,
          max_income INTEGER,
          must_be_student INTEGER DEFAULT 0, -- 0 or 1
          allowed_categories TEXT,           -- JSON array or comma separated
          required_docs TEXT                 -- JSON string array
        )
      `, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

module.exports = {
  db,
  initDb
};
