# Intelligent Bureaucratic Assistance and Verification System

An autonomous, full-stack citizen assistance platform, machine learning scam screener, and immigration document verification system designed for university Computer Science and Engineering capstone evaluation.

---

## 1. System Overview

Navigating bureaucratic public services is often hindered by fragmented gazette directives, confusing eligibility requirements, and widespread phishing scams impersonating government bodies (such as electricity boards, income tax refunds, or law enforcement notices).

This platform provides:
1. **Government Service Assistant & Directory:** Official requirements, fees, and procedures for Aadhaar, PAN, Passport, Driving Licence, and Welfare Schemes.
2. **Private Document OCR Vault:** Automated Tesseract OCR and PDF parsing for Indian identity documents with secure, authenticated file streaming (no public uploads folder).
3. **Deterministic Scheme Eligibility Checker:** Rule-based evaluation of income ceilings, age brackets, student status, and reservation categories without LLM hallucination.
4. **Persistent Interactive Checklist:** Service-specific document gathering checklists persisted in SQLite.
5. **Machine Learning Scam & Phishing Screener:** Scikit-learn TF-IDF Logistic Regression classifier trained on the UCI SMS Spam Collection + synthetic Indian bureaucratic lures (98.46% accuracy, 96.18% spam recall) combined with official `.gov.in` domain integrity checks.
6. **Immigration & Screening Workstation:** Complete reviewer workflow comparing applicant dossiers (Passport vs. Aadhaar/DL), detecting name/DOB discrepancies, flagging expired documents, and logging reviewer conclusions with tamper-evident audit trails.
7. **Grounded Knowledge Assistant & Search:** Lexical TF-IDF search citing official verified source URLs, portals, and verification dates.
8. **Application Drafts & Statement Generator:** Form draft management autofilled from verified OCR documents, and formal Statement of Purpose (SOP) / affidavit generator based strictly on user-supplied facts.
9. **Document Renewal & Expiry Reminders:** Automated schedule tracking for passport and driving licence expirations with background worker alerts.
10. **RAG Chat Assistant:** Retrieval-augmented conversational assistance that retrieves relevant information from its document collection and provides grounded responses through a separate Streamlit application integrated into the React frontend.

---

## 2. Architecture & Technology Stack

- **Frontend:** React 18, Vite 5, React Router 6, Axios, Lucide React Icons.
- **Backend:** Node.js (v18+ or v24), Express 4, Helmet (HTTP security headers), Express Rate Limit, Multer (secure disk storage), Tesseract.js, `pdf-parse`.
- **Database:** SQLite3 with relational foreign keys, performance indexes, and non-destructive schema migrations.
- **Security:** `bcryptjs` password hashing (10 rounds), JSON Web Tokens (JWT) with 7-day expiration, server-side RBAC (`citizen`, `reviewer`, `admin`), private file access controls.
- **Machine Learning & NLP:** Python 3.11+, Scikit-learn (TF-IDF Vectorizer + Logistic Regression / Multinomial Naive Bayes), Pandas, NumPy, Joblib.
- **RAG Chat Assistant:** Python, Streamlit, and the dependencies listed in `rag-chat-assistant/requirements.txt`; see `rag-chat-assistant/readme.md` for its detailed documentation.

---

## 3. Directory Layout

```text
├── backend/
│   ├── controllers/         # Auth, Documents, Eligibility, Scam, Immigration, Knowledge, Checklists, Drafts, Reminders, Letters
│   ├── data/                # Government service seed JSON data
│   ├── database/            # SQLite database file, database.js connection, safe seed.js, and migrate.js
│   ├── middleware/          # authMiddleware.js (authenticateToken, requireRole, optionalAuth)
│   ├── routes/              # Express REST API routes
│   ├── services/            # OCR, Document Classifier, Immigration Verification, Reminder Scheduler
│   ├── tests/               # system.test.js automated test suite
│   ├── uploads/             # Private server-controlled upload storage (excluded from public web)
│   ├── package.json
│   └── server.js            # Express application entrypoint
├── data/
│   ├── raw/                 # Downloaded UCI SMS Spam Collection archive
│   ├── processed/           # combined_spam_dataset.csv (5,176 records) & dataset_statistics.json
│   └── README.md            # Dataset provenance and acquisition documentation
├── docs/
│   ├── PROJECT_STATUS.md    # Requirement-by-requirement audit checklist
│   ├── architecture.md      # Full-stack architectural specification
│   ├── database-schema.md   # Entity-Relationship diagram and table definitions
│   ├── api-documentation.md # REST API endpoint specifications
│   ├── dataset-documentation.md # Dataset statistics, provenance, and licences
│   ├── model-training.md    # Preprocessing, model comparison, and reproduction
│   ├── data-pipeline.md     # Official gazette ingestion and review workflow
│   ├── testing-report.md    # Automated test execution evidence
│   ├── limitations.md       # Operational boundaries and future expansions
│   └── viva-guide.md        # Comprehensive student examination preparation guide
├── rag-chat-assistant/      # RAG Chat Assistant subsystem (see its own readme.md)
│   ├── scripts/              # Includes the Streamlit entry point: app.py
│   ├── src/                  # RAG ingestion, processing, indexing, retrieval, and generation modules
│   ├── requirements.txt      # RAG subsystem Python dependencies
│   └── readme.md             # Detailed RAG Chat Assistant documentation
├── frontend/
│   ├── src/
│   │   ├── components/      # Navbar, Footer, ProtectedRoute
│   │   ├── context/         # AuthContext.jsx (JWT auth provider)
│   │   ├── pages/           # Dashboard, Services, DocumentUpload, Eligibility, Checklist, ScamVerification,
│   │   │                    # ImmigrationCases, ImmigrationCaseDetail, KnowledgeBase, ApplicationDrafts, RemindersPage, Login, Register
│   │   ├── services/        # api.js (Axios client with Bearer interceptors)
│   │   ├── App.jsx          # Route registration
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── models/
│   ├── scam_detection_pipeline.joblib  # Trained scikit-learn model artifact
│   ├── model_metrics.json              # Portable held-out evaluation metrics
│   └── README.md                       # Model loading and reproduction instructions
├── scripts/
│   ├── acquire_and_prepare_dataset.py  # Dataset download & curation script
│   ├── train_scam_model.py             # Reproducible training & model comparison
│   ├── evaluate_scam_model.py          # Standalone evaluation reproduction script
│   └── predict_scam.py                 # CLI & Node child process inference bridge
├── .env.example             # Configuration template
├── requirements.txt         # Python dependencies
└── README.md                # Project documentation
```

---

## 4. Setup & Startup Guide (Local Laptop)

### Prerequisites
- **Node.js:** v18.0.0 or later (v24 tested and verified).
- **npm:** v9.0.0 or later.
- **Python:** Python 3.10 or 3.11 with `pip`.

### Step 1: Clone or Extract Repository
Navigate into the project root directory:
```bash
cd "C:\Users\karan\OneDrive\Desktop\bn"
```

### Step 2: Install Python Dependencies
```bash
python -m pip install -r requirements.txt
```

### Step 3: Install Backend Dependencies & Run Database Migration
```bash
cd backend
npm install
node database/seed.js
cd ..
```

### Step 4: Install Frontend Dependencies & Build Bundle
```bash
cd frontend
npm install
npm run build
cd ..
```

### Step 5: (Optional) Retrain or Verify ML Scam Model
To verify that the dataset and model train reproducibly:
```bash
python scripts/acquire_and_prepare_dataset.py
python scripts/train_scam_model.py
python scripts/evaluate_scam_model.py
```

### Step 6: Start Backend Server
In Terminal 1:
```bash
cd backend
npm start
```
The backend server starts on `http://localhost:5001`. Confirm health check at:
`http://localhost:5001/api/health`

### Step 7: Start Frontend Development Server
In Terminal 2:
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in any modern web browser.

### Step 8: Configure and Start the RAG Chat Assistant

The RAG Chat Assistant runs as a separate Streamlit application. Keep it running alongside the backend and frontend during local development.

**8.1 Configure the frontend URL**

Create `frontend/.env` and add:
```env
VITE_RAG_ASSISTANT_URL=http://localhost:8501/?embed=true
```

This URL is for local development. When deploying, replace it with the actual URL of the separately hosted Streamlit application. Do not commit `frontend/.env`.

**8.2 Install the RAG Assistant dependencies**

Open a new terminal at the repository root and run:
```bash
cd rag-chat-assistant
python -m venv .venv
source .venv/Scripts/activate
python -m pip install -r requirements.txt
```

On Windows Command Prompt instead of Git Bash, activate the environment with:
```bat
.venv\Scripts\activate
```

**8.3 Start Streamlit**

From the `rag-chat-assistant` directory, run:
```bash
python -m streamlit run scripts/app.py
```

Streamlit should be available at `http://localhost:8501`. Keep this terminal running. The React page uses `VITE_RAG_ASSISTANT_URL` to embed the application.

For subsystem-specific setup, configuration, and usage details, refer to `rag-chat-assistant/readme.md`.

---

## 5. Pre-Seeded Demonstration Accounts

For viva and faculty evaluation, three role-based test accounts are pre-seeded with hashed passwords:

| Role | Username | Email | Password | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| **Citizen** | `citizen_demo` | `citizen@example.com` | `Password123!` | Create application drafts, upload private documents, schedule reminders, initiate immigration screening cases. |
| **Reviewer** | `reviewer_demo` | `reviewer@gov-verification.in` | `ReviewerPass123!` | Access reviewer workstation, inspect cross-document discrepancies, update flag status (Active/Dismissed/Resolved), record official case conclusions. |
| **Admin** | `admin_demo` | `admin@gov-verification.in` | `AdminSecurePass123!` | All reviewer capabilities + publish and delete official guidelines in the knowledge base. |

*(Quick-fill buttons are provided on the `/login` page for fast sign-in during evaluation).*

---

## 6. Automated Testing

To run the complete automated test suite (27 comprehensive integration tests covering Auth, RBAC, Data Isolation, OCR, ML Inference, Immigration Workflows, and Persistence):
```bash
cd backend
npm test
```
**Expected Result:**
```text
ℹ tests 27
ℹ suites 7
ℹ pass 27
ℹ fail 0
```

---

## 7. Demonstration Workflows

- **Workflow A — Scholarship Application Preparation:**  
  Explore `Post-Matric Scholarship Scheme` in Service Directory → Test eligibility in Eligibility Checker → Click "Prepare Document Checklist" → Upload supporting ID to private vault → Reopen Application Draft with autofilled details.
- **Workflow B — Machine Learning Scam Screening:**  
  Navigate to `/scam-verify` → Click the "Electricity Scam" sample button → Execute ML inference → Observe `98.46%` model confidence and official domain inspection → Verify saved report appears in database history.
- **Workflow C — Immigration Document Verification:**  
  Sign in as `citizen_demo` → Open `/immigration` and create a screening case → Inject synthetic test documents (e.g. Valid Passport + Mismatched Aadhaar) → Observe automated `DOB_MISMATCH` or `NAME_MISMATCH` security flags → Sign in as `reviewer_demo` → Resolve flag with comment → Record binding `APPROVED` or `REJECTED` decision with audit trail.
- **Workflow D — Expiry Reminders & Administration:**  
  Navigate to `/reminders` → Schedule a reminder for an upcoming document expiry → Observe automated calculation of remaining days and overdue states → Sign in as `admin_demo` → Open `/knowledge` and publish a new official directive.

---

## 8. Licences & Attributions

- **UCI SMS Spam Collection:** Almeida, T., Hidalgo, J., & Yamakami, A. (2011). CC BY 4.0.
- **Tesseract.js:** Apache 2.0.
- **Icons:** Lucide React (ISC License).
