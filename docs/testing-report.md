# Automated Testing & Verification Report

## 1. Test Suite Summary

- **Test Runner:** Node.js native test runner (`node --test`)
- **Assertion Library:** `node:assert/strict`
- **Test File:** `backend/tests/system.test.js`
- **Execution Date:** October 2026
- **Total Tests:** 27
- **Passed:** 27 (100%)
- **Failed:** 0
- **Execution Time:** ~11.4 seconds

---

## 2. Test Execution Results by Subsystem

### 2.1 Authentication & Role-Based Access Control (6/6 Passed)
- `✔ should register a new citizen user (259.22ms)`: Verifies bcrypt password hashing, automatic default assignment of `citizen` role, and JWT token issuance.
- `✔ should sign in with seeded citizen credentials (89.63ms)`: Confirms `citizen_demo` login.
- `✔ should sign in with seeded reviewer credentials (85.92ms)`: Confirms `reviewer_demo` login.
- `✔ should sign in with seeded admin credentials (84.37ms)`: Confirms `admin_demo` login.
- `✔ should reject invalid password (82.90ms)`: Verifies HTTP 401 on incorrect credentials.
- `✔ should reject forged demo token strings (2.90ms)`: Confirms elimination of fake `demo-token` bypasses.

### 2.2 Government Service Directory & Eligibility Evaluation (3/3 Passed)
- `✔ should retrieve services list from database (4.95ms)`: Verifies SQLite `services` table retrieval.
- `✔ should correctly evaluate an eligible student scholarship applicant (71.28ms)`: Tests Post-Matric Scholarship rules with valid age, income under ceiling, and student status.
- `✔ should correctly evaluate an ineligible applicant exceeding income ceiling (5.55ms)`: Confirms immediate ineligibility when income exceeds ₹2,50,000.

### 2.3 Document Upload, Classification & Private Storage (3/3 Passed)
- `✔ should upload a document and extract fields via classifier (23.13ms)`: Uploads passport text file, extracts Passport Number `Z9182736`, DOB `14/08/1995`, and Name `Rahul Sharma`.
- `✔ should stream private document to authorized owner (7.95ms)`: Verifies HTTP 200 stream on `GET /api/documents/:id/file`.
- `✔ should deny unauthenticated requests to download private files (1.74ms)`: Verifies HTTP 401 when accessing private files without Bearer token.

### 2.4 Machine Learning Scam Detection (2/2 Passed)
- `✔ should detect high risk scam lure with ML model and heuristic indicators (5324.67ms)`: Calls Python subprocess, receives `spam` classification (77.5% probability), detects unofficial domain `bescom-pay.xyz`, assigns HIGH risk score (75/100).
- `✔ should classify genuine citizen notice as low risk ham (3145.38ms)`: Validates Aadhaar advisory containing `.gov.in` domain, outputs LOW risk score.

### 2.5 Immigration Screening Workflow & Role Authorization (6/6 Passed)
- `✔ should allow citizen to create an immigration case (20.69ms)`: Creates case `CASE-2026-XXXXXX`.
- `✔ should attach document and run automated screening analysis (37.51ms)`: Attaches passport and runs cross-document verification engine.
- `✔ should upload an expired passport and generate EXPIRED_DOCUMENT flag (77.31ms)`: Injects expired passport (`01/01/2020`), detects expired date, raises CRITICAL `EXPIRED_DOCUMENT` flag.
- `✔ should DENY citizen from changing reviewer flags (Forbidden 403) (6.62ms)`: Verifies role isolation; citizen cannot resolve flags.
- `✔ should ALLOW reviewer to update flag status (13.67ms)`: Authorizes reviewer to resolve flag with comment.
- `✔ should ALLOW reviewer to record binding decision (17.48ms)`: Sets case to `APPROVED` and records reviewer notes.

### 2.6 Checklists, Application Drafts & Reminders Persistence (4/4 Passed)
- `✔ should save and retrieve user checklist items in database (17.13ms)`: Verifies persistence in `user_checklists`.
- `✔ should save application draft and persist across reloads (12.59ms)`: Verifies persistence in `application_drafts`.
- `✔ should schedule reminder and compute upcoming timing status (11.88ms)`: Checks remaining days calculation.
- `✔ should generate official Statement of Purpose (SOP) without fabricating facts (26.33ms)`: Validates SOP drafting incorporating applicant facts.

### 2.7 Knowledge Base & Grounded Assistant Attribution (3/3 Passed)
- `✔ should return grounded official answers citing source portals (4.60ms)`: Confirms citations to `passportindia.gov.in`.
- `✔ should DENY non-admin users from creating knowledge articles (3.52ms)`: Verifies HTTP 403.
- `✔ should ALLOW admin to publish official article (9.90ms)`: Confirms administrative publishing.

---

## 3. Test Command Reproduction

```bash
cd backend
npm test
```
