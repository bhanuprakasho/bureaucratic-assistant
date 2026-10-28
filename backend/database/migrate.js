const { db } = require('./database');
const bcrypt = require('bcryptjs');

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function runMigrations() {
  console.log('Running database schema migrations with async promise handling...');

  // 1. Users Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'citizen', -- citizen, reviewer, admin
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Private Documents Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      storage_filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      document_type TEXT,
      confidence TEXT,
      extracted_fields TEXT, -- JSON
      raw_text TEXT,
      is_synthetic INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 3. Application Drafts Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS application_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      form_data TEXT NOT NULL, -- JSON
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 4. User Checklists Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS user_checklists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      service_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      items TEXT NOT NULL, -- JSON
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, service_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 5. Scam Reports Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS scam_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      message_text TEXT NOT NULL,
      ml_prediction TEXT NOT NULL,
      ml_probability REAL,
      model_used TEXT,
      risk_level TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      flags TEXT, -- JSON
      recommendation TEXT,
      disclaimer TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 6. Immigration Cases Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS immigration_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_number TEXT UNIQUE NOT NULL,
      applicant_name TEXT NOT NULL,
      applicant_email TEXT,
      category TEXT DEFAULT 'Immigration & Identity Screening',
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW, UNDER_REVIEW, APPROVED, REJECTED, REQUIRES_MORE_INFO
      creator_id INTEGER NOT NULL,
      assigned_reviewer_id INTEGER,
      reviewer_decision TEXT,
      reviewer_notes TEXT,
      decision_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_reviewer_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 7. Case Documents Junction Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS case_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      document_id INTEGER NOT NULL,
      doc_role TEXT NOT NULL, -- PRIMARY_PASSPORT, NATIONAL_ID, VISA, SUPPORTING
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES immigration_cases(id) ON DELETE CASCADE,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )
  `);

  // 8. Case Screening Flags Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS case_flags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      flag_code TEXT NOT NULL,
      severity TEXT NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence TEXT, -- JSON
      status TEXT DEFAULT 'ACTIVE', -- ACTIVE, DISMISSED, RESOLVED
      reviewer_comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES immigration_cases(id) ON DELETE CASCADE
    )
  `);

  // 9. Case Audit Events Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT, -- JSON
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES immigration_cases(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // 10. Reminders Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      service_id TEXT,
      document_name TEXT,
      due_date DATE NOT NULL,
      status TEXT DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, CANCELLED
      notification_type TEXT DEFAULT 'IN_APP',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 11. Saved Statements & Letters Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      letter_type TEXT NOT NULL,
      service_id TEXT,
      recipient_office TEXT,
      content TEXT NOT NULL,
      facts_data TEXT, -- JSON
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 12. Knowledge Base Articles Table
  await runSql(`
    CREATE TABLE IF NOT EXISTS knowledge_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      jurisdiction TEXT NOT NULL DEFAULT 'India (Central)',
      source_url TEXT NOT NULL,
      official_portal TEXT NOT NULL,
      effective_date DATE,
      verification_date DATE,
      review_status TEXT DEFAULT 'VERIFIED', -- VERIFIED, DRAFT, PENDING_REVIEW
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      official_fee TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create indexes
  await runSql(`CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS idx_drafts_user ON application_drafts(user_id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS idx_checklists_user ON user_checklists(user_id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS idx_cases_creator ON immigration_cases(creator_id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS idx_cases_status ON immigration_cases(status)`);
  await runSql(`CREATE INDEX IF NOT EXISTS idx_flags_case ON case_flags(case_id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_logs(case_id)`);
  await runSql(`CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id)`);

  // Seed default system users
  const saltRounds = 10;
  const defaultUsers = [
    {
      username: 'citizen_demo',
      email: 'citizen@example.com',
      password: 'Password123!',
      full_name: 'Priya Sharma (Citizen)',
      role: 'citizen'
    },
    {
      username: 'reviewer_demo',
      email: 'reviewer@gov-verification.in',
      password: 'ReviewerPass123!',
      full_name: 'Officer Rajesh Kumar (Immigration Reviewer)',
      role: 'reviewer'
    },
    {
      username: 'admin_demo',
      email: 'admin@gov-verification.in',
      password: 'AdminSecurePass123!',
      full_name: 'System Administrator',
      role: 'admin'
    }
  ];

  for (const u of defaultUsers) {
    const hash = await bcrypt.hash(u.password, saltRounds);
    await runSql(
      `INSERT OR IGNORE INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)`,
      [u.username, u.email, hash, u.full_name, u.role]
    );
  }

  console.log('Database schema migrations completed successfully.');
}

if (require.main === module) {
  runMigrations().then(() => {
    console.log('Migration script finished.');
    process.exit(0);
  }).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = runMigrations;
