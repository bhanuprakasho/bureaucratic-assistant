const { db, initDb } = require('./database');
const runMigrations = require('./migrate');
const servicesData = require('../data/governmentServices.json');

const sampleRules = [
  {
    scheme_id: "scholarship",
    scheme_name: "Post-Matric Scholarship Scheme",
    min_age: 15,
    max_age: 30,
    max_income: 250000,
    must_be_student: 1,
    allowed_categories: JSON.stringify(["SC", "ST", "OBC", "EWS", "General"]),
    required_docs: JSON.stringify(["Income Certificate", "Aadhaar Card", "Student ID / Fee Receipt", "Previous Marksheet"])
  },
  {
    scheme_id: "government-scheme",
    scheme_name: "PM Kisan Samman Nidhi",
    min_age: 18,
    max_age: 80,
    max_income: 500000,
    must_be_student: 0,
    allowed_categories: JSON.stringify(["SC", "ST", "OBC", "General", "EWS"]),
    required_docs: JSON.stringify(["Land Records / Khatauni", "Aadhaar Card", "Bank Account Passbook"])
  },
  {
    scheme_id: "driving-licence",
    scheme_name: "Driving Licence (LMV)",
    min_age: 18,
    max_age: 75,
    max_income: 100000000, // No income cap
    must_be_student: 0,
    allowed_categories: JSON.stringify(["All"]),
    required_docs: JSON.stringify(["Learner's Licence", "Aadhaar / Age Proof", "Address Proof", "Passport Photograph"])
  },
  {
    scheme_id: "passport",
    scheme_name: "Fresh Indian Passport",
    min_age: 0,
    max_age: 100,
    max_income: 100000000, // No income cap
    must_be_student: 0,
    allowed_categories: JSON.stringify(["All"]),
    required_docs: JSON.stringify(["Aadhaar Card / Address Proof", "Date of Birth Proof", "10th Certificate (Non-ECR)"])
  }
];

const sampleArticles = [
  {
    slug: 'aadhaar-enrolment-and-update',
    title: 'Aadhaar Enrolment, Biometric Update, and Address Correction',
    category: 'Identity',
    jurisdiction: 'India (Central / UIDAI)',
    source_url: 'https://uidai.gov.in',
    official_portal: 'myaadhaar.uidai.gov.in',
    effective_date: '2024-01-01',
    verification_date: '2026-03-15',
    review_status: 'VERIFIED',
    summary: 'Comprehensive guidelines for enrolling for a fresh Aadhaar card and mandatory biometric updates at ages 5 and 15.',
    content: 'Aadhaar is a 12-digit unique identity number issued by UIDAI. For enrolment, citizens must provide proof of identity (POI), proof of address (POA), and date of birth (DOB). Mandatory biometric updates for children at age 5 and 15 are free of charge. Document update can be completed online via myAadhaar portal.',
    official_fee: 'Free for enrolment & mandatory biometric updates; ₹50 for demographic updates'
  },
  {
    slug: 'pan-card-allotment-form49a',
    title: 'PAN Card Allotment & Linking with Aadhaar (Form 49A)',
    category: 'Tax & Financial',
    jurisdiction: 'India (Central / Income Tax Department)',
    source_url: 'https://incometax.gov.in',
    official_portal: 'protean-tinpan.com',
    effective_date: '2024-01-01',
    verification_date: '2026-03-20',
    review_status: 'VERIFIED',
    summary: 'Standard procedure for Indian citizens applying for a Permanent Account Number (PAN) under Section 139A.',
    content: 'PAN is mandatory for filing income tax returns, opening bank accounts, and high-value transactions. Citizens can apply online through Protean or UTIITSL portals using Form 49A. Instant e-PAN can be generated free using Aadhaar OTP on the Income Tax e-Filing portal.',
    official_fee: '₹107 (within India physical delivery) or ₹0 (Instant e-PAN via Aadhaar)'
  },
  {
    slug: 'post-matric-scholarship-guidelines',
    title: 'National Scholarship Portal (NSP) Post-Matric Guidelines',
    category: 'Education',
    jurisdiction: 'India (Ministry of Social Justice & Empowerment)',
    source_url: 'https://scholarships.gov.in',
    official_portal: 'scholarships.gov.in',
    effective_date: '2024-07-01',
    verification_date: '2026-04-10',
    review_status: 'VERIFIED',
    summary: 'Financial support schemes for students pursuing post-matriculation or post-secondary stages of education.',
    content: 'Students enrolled in recognized universities and institutions with annual household income under ₹2,50,000 can apply through the One-Time Registration (OTR) on the National Scholarship Portal. Aadhaar-seeded bank account is required for Direct Benefit Transfer (DBT).',
    official_fee: 'Free of cost / No official application fee'
  },
  {
    slug: 'ordinary-passport-tatkaal-normal',
    title: 'Indian Passport Application Procedure (Passport Seva Kendra)',
    category: 'Travel & Immigration',
    jurisdiction: 'India (Ministry of External Affairs / CPV Division)',
    source_url: 'https://passportindia.gov.in',
    official_portal: 'passportindia.gov.in',
    effective_date: '2023-11-01',
    verification_date: '2026-02-28',
    review_status: 'VERIFIED',
    summary: 'Official requirements for issuance of fresh Ordinary Indian Passport under Normal and Tatkaal schemes.',
    content: 'Applicants must register on Passport Seva Online, fill Form 1, pay online fee, and schedule an appointment at the nearest PSK or Post Office PSK (POPSK). Requires proof of date of birth, identity, address proof, and police verification.',
    official_fee: '₹1,500 (Normal 36 pages), ₹2,000 (Normal 60 pages), +₹2,000 additional for Tatkaal'
  }
];

function runSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function seed() {
  await initDb();
  await runMigrations();

  // Safely seed services only if table is empty
  const serviceCountRow = await getSql("SELECT count(*) as count FROM services");
  if (!serviceCountRow || serviceCountRow.count === 0) {
    console.log("Seeding services table...");
    const stmtService = db.prepare(`
      INSERT INTO services (id, name, category, description, eligibility, requiredDocuments, steps, importantNotes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const service of servicesData) {
      stmtService.run(
        service.id,
        service.name,
        service.category,
        service.description,
        service.eligibility,
        JSON.stringify(service.requiredDocuments),
        JSON.stringify(service.steps),
        service.importantNotes
      );
    }
    stmtService.finalize();
    console.log("Services seeded successfully.");
  } else {
    console.log(`Services already present (${serviceCountRow.count} rows), preserving existing records.`);
  }

  // Safely seed rules only if table is empty
  const rulesCountRow = await getSql("SELECT count(*) as count FROM eligibility_rules");
  if (!rulesCountRow || rulesCountRow.count === 0) {
    console.log("Seeding eligibility rules...");
    const stmtRules = db.prepare(`
      INSERT INTO eligibility_rules (scheme_id, scheme_name, min_age, max_age, max_income, must_be_student, allowed_categories, required_docs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rule of sampleRules) {
      stmtRules.run(
        rule.scheme_id,
        rule.scheme_name,
        rule.min_age,
        rule.max_age,
        rule.max_income,
        rule.must_be_student,
        rule.allowed_categories,
        rule.required_docs
      );
    }
    stmtRules.finalize();
    console.log("Eligibility rules seeded successfully.");
  } else {
    console.log(`Eligibility rules already present (${rulesCountRow.count} rows), preserving existing records.`);
  }

  // Safely seed knowledge articles if empty
  const articlesCountRow = await getSql("SELECT count(*) as count FROM knowledge_articles");
  if (!articlesCountRow || articlesCountRow.count === 0) {
    console.log("Seeding verified knowledge base articles...");
    for (const art of sampleArticles) {
      await runSql(`
        INSERT OR IGNORE INTO knowledge_articles
        (slug, title, category, jurisdiction, source_url, official_portal, effective_date, verification_date, review_status, summary, content, official_fee)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        art.slug, art.title, art.category, art.jurisdiction, art.source_url, art.official_portal,
        art.effective_date, art.verification_date, art.review_status, art.summary, art.content, art.official_fee
      ]);
    }
    console.log("Knowledge base articles seeded successfully.");
  } else {
    console.log(`Knowledge articles already present (${articlesCountRow.count} rows).`);
  }
}

if (require.main === module) {
  seed().then(() => {
    console.log("Database seeding completed.");
    process.exit(0);
  }).catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
}

module.exports = seed;
