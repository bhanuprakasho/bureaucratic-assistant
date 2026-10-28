# Student Examination & Viva Voce Guide

This guide prepares students to explain and demonstrate the project to university examiners, evaluators, and faculty.

---

## 1. Executive Summary (The "Elevator Pitch")

> *"Our project is an Intelligent Bureaucratic Assistance and Verification System designed to address two critical civic challenges: the complexity of navigating public service requirements, and the proliferation of cyber scams impersonating government agencies.*  
> *The system combines a React frontend, an Express/Node.js backend, a normalized SQLite database, Tesseract.js OCR, and a Scikit-learn TF-IDF Logistic Regression machine learning model. It provides citizens with private document vaults, deterministic eligibility checks, persistent checklists, and scam screening, while offering immigration officers a dedicated screening workstation to detect cross-document identity discrepancies and record binding audit decisions."*

---

## 2. Key Architectural Decisions & Justifications

### Q1: Why use SQLite instead of MongoDB?
- **Answer:** Bureaucratic and immigration workflows require strict relational integrity (ACID compliance). An immigration case has foreign keys linking documents, security flags, reviewer decisions, and audit events. Relational foreign key cascades (`ON DELETE CASCADE`) ensure orphaned records cannot exist. Additionally, SQLite requires zero external server setup, making the application lightweight, portable, and reproducible.

### Q2: Why choose Logistic Regression over Naive Bayes for scam detection?
- **Answer:** While Multinomial Naive Bayes achieved 98.84% accuracy with 99.17% precision, it missed 11 spam messages (91.60% recall). In civic cybersecurity, a **False Negative** (allowing a citizen to fall victim to a fraudulent tax or power disconnection notice) is significantly more dangerous than a minor increase in false alerts. Logistic Regression with balanced class weights achieved **96.18% recall** on the held-out test set, missing only 5 lures out of 131.

### Q3: How is document privacy enforced?
- **Answer:** The default Express static file server (`/uploads`) was removed. Uploaded identity files are given randomized server-controlled filenames (`doc-<timestamp>-<random>.ext`) and saved outside public directories. They can only be accessed through `/api/documents/:id/file`, which verifies JWT bearer tokens, prevents directory traversal via `path.basename()`, and checks ownership (allowing only the file owner, reviewer, or admin).

### Q4: Why combine Machine Learning with rule-based heuristics?
- **Answer:** Machine learning models are probabilistic; an adversarial scammer might use novel wording that evades TF-IDF tokens. By combining the ML probability (45% weight) with deterministic domain integrity rules (55% weight)—such as checking whether a link points to `.gov.in` versus suspicious top-level domains like `.xyz` or `.top`, or detecting urgent payment demands—the system provides transparent, explainable threat indicators.

---

## 3. Demonstration Workflow Walkthroughs

### Workflow A: Post-Matric Scholarship Dossier
1. Open **Services** → select *Post-Matric Scholarship Scheme*.
2. Open **Eligibility** → enter age `20`, income `₹1,80,000`, student `Yes`, category `OBC`. Click **Check Scheme Eligibility** → observe *Potentially Eligible* result.
3. Click **Prepare Document Checklist** → check off gathered certificates and click **Save Checklist Progress** (persists in SQLite).
4. Open **Drafts & Letters** → click **Autofill from Verified Documents** → save application draft to database.

### Workflow B: Machine Learning Scam Screening
1. Open **Scam Verify** page.
2. Click the **Electricity Scam** test case button:  
   *"Dear Customer, Your Electricity power connection will be cut tonight at 9.30 PM immediately contact officer at 9812345678 or pay immediately via http://bescom-pay.xyz/bill"*
3. Click **Analyze Message** → observe Python ML inference result:  
   - Model: `Logistic Regression (TF-IDF)`
   - Prediction: `SPAM` (Probability: 77.5%)
   - Detected Flags: Immediate fee payment demand, unofficial domain `.xyz`.
   - Risk Level: `HIGH (75/100)`.
4. Check the history table below to show that the report is persisted in `scam_reports`.

### Workflow C: Official Reviewer Immigration Investigation
1. Sign in as `citizen_demo` (`Password123!`).
2. Go to **Immigration Cases** → click **Initiate New Screening Case** → enter applicant name *Rahul Sharma*.
3. Click **+ Expired Passport** (synthetic test fixture) and **+ Mismatched ID**.
4. Observe the automated consistency screening engine generating security flags:
   - `EXPIRED_DOCUMENT` (CRITICAL)
   - `NAME_MISMATCH` (HIGH)
   - `DOB_MISMATCH` (CRITICAL)
5. Attempting to resolve flags as a citizen is rejected (`403 Forbidden`).
6. Sign in as `reviewer_demo` (`ReviewerPass123!`) → open the case.
7. Click **Resolve Flag** → enter verification justification comment.
8. Choose **REJECTED** or **APPROVED** in the Reviewer Decision Panel → click **Record Binding Review Decision**.
9. Inspect the **Tamper-Evident Audit History** showing the actor, timestamp, and action logged in SQLite.
