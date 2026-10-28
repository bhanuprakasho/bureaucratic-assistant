# REST API Documentation

All endpoints are hosted at `http://localhost:5001/api`.  
Protected endpoints require HTTP header: `Authorization: Bearer <token>`.

---

## 1. Authentication & User Profile

### `POST /api/auth/register`
- **Access:** Public
- **Description:** Registers a new citizen user account. Public registration cannot grant reviewer or admin privileges.
- **Request Body:**
```json
{
  "username": "rahul_verma",
  "email": "rahul@example.com",
  "password": "Password123!",
  "full_name": "Rahul Verma"
}
```
- **Response (201 Created):**
```json
{
  "success": true,
  "message": "User registered successfully.",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 4,
    "username": "rahul_verma",
    "email": "rahul@example.com",
    "full_name": "Rahul Verma",
    "role": "citizen"
  }
}
```

### `POST /api/auth/login`
- **Access:** Public
- **Request Body:**
```json
{
  "username": "citizen_demo",
  "password": "Password123!"
}
```
- **Response (200 OK):** Returns JWT token and safe user profile.

### `GET /api/auth/me`
- **Access:** Authenticated
- **Response (200 OK):** Current session user profile.

---

## 2. Private Document Vault & OCR

### `POST /api/documents/upload`
- **Access:** Optional / Authenticated
- **Format:** `multipart/form-data`
- **Fields:** `document` (File: JPG, PNG, WEBP, PDF, TXT), `is_synthetic` (Boolean string)
- **Response (201 Created):**
```json
{
  "success": true,
  "documentId": 1,
  "filename": "passport.jpg",
  "fileSize": 45102,
  "mimeType": "image/jpeg",
  "is_synthetic": false,
  "result": {
    "documentType": "Passport",
    "confidence": "High",
    "extractedFields": {
      "Passport Number": "Z9182736",
      "Name": "Rahul Sharma",
      "Date of Birth": "14/08/1995",
      "Expiry Date": "09/05/2030"
    }
  }
}
```

### `GET /api/documents/:id/file`
- **Access:** Authenticated (Owner, Reviewer, or Admin)
- **Description:** Streams private binary file. Denies cross-user unauthorized access.

### `POST /api/documents/:id/confirm`
- **Access:** Authenticated (Owner or Reviewer)
- **Request Body:**
```json
{
  "confirmedFields": {
    "Name": "Rahul Sharma",
    "Date of Birth": "14/08/1995"
  },
  "documentType": "Passport"
}
```

---

## 3. Scheme Eligibility Rule Engine

### `POST /api/eligibility/check`
- **Access:** Public
- **Request Body:**
```json
{
  "schemeId": "scholarship",
  "age": 20,
  "annualIncome": 180000,
  "isStudent": "yes",
  "category": "OBC"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "schemeName": "Post-Matric Scholarship Scheme",
  "status": "Potentially Eligible",
  "isEligible": true,
  "reasons": [
    "✓ Age (20) falls within the required range of 15 to 30 years.",
    "✓ Annual income (₹1,80,000) is within eligible limit (Max ₹2,50,000).",
    "✓ Student status condition satisfied.",
    "✓ Category (OBC) is listed in eligible categories."
  ],
  "requiredDocuments": [
    "Income Certificate", "Aadhaar Card", "Student ID / Fee Receipt", "Previous Marksheet"
  ]
}
```

---

## 4. Machine Learning Scam Verification

### `POST /api/scam/analyze`
- **Access:** Public / Optional Authenticated
- **Request Body:**
```json
{
  "message": "Electricity office: Your power connection will be cut tonight at 9.30 PM immediately contact officer 9812345678 or pay at http://bescom-pay.xyz/bill"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "isMlPrediction": true,
  "modelUsed": "Logistic Regression (TF-IDF)",
  "mlPrediction": "spam",
  "mlProbability": 0.7752,
  "riskLevel": "HIGH",
  "riskScore": 75,
  "reasons": [
    "Requests immediate fee payment or monetary transfer under tight deadline",
    "Suspicious / unofficial domain detected: bescom-pay.xyz",
    "Trained ML classifier detected spam/scam language patterns (Probability: 77.5%)"
  ],
  "recommendation": "DO NOT click links, send money, or disclose OTP/banking information..."
}
```

---

## 5. Immigration Screening Workstation

### `POST /api/immigration/cases`
- **Access:** Authenticated (Citizen, Reviewer)
- **Request Body:** `{ "applicant_name": "Rahul Sharma", "category": "Identity Screening" }`
- **Response (201 Created):** `{ "success": true, "caseId": 1, "caseNumber": "CASE-2026-928102" }`

### `POST /api/immigration/cases/:id/documents`
- **Access:** Authenticated (Owner, Reviewer)
- **Request Body:** `{ "document_id": 1, "doc_role": "PRIMARY_PASSPORT" }`
- **Response (200 OK):** Attaches document and executes automated screening analysis.

### `PATCH /api/immigration/cases/:id/flags/:flagId`
- **Access:** Reviewer or Admin Only (`requireRole('reviewer', 'admin')`)
- **Request Body:** `{ "status": "RESOLVED", "reviewer_comment": "Verified against physical register" }`

### `POST /api/immigration/cases/:id/decision`
- **Access:** Reviewer or Admin Only
- **Request Body:** `{ "decision": "APPROVED", "notes": "All documents verified consistent." }`

---

## 6. Knowledge Base & Grounded Assistant

### `POST /api/knowledge/search`
- **Access:** Public
- **Request Body:** `{ "query": "scholarship income limit" }`
- **Response:** Scored matches citing official portals, source URLs, and verification dates.

### `POST /api/knowledge/assistant`
- **Access:** Public
- **Request Body:** `{ "question": "What documents are required for fresh Indian passport?" }`
- **Response:** Grounded synthesis citing `passportindia.gov.in`.

### `POST /api/knowledge/articles`
- **Access:** Admin Only (`requireRole('admin')`)
- **Request Body:** Official guideline metadata, source URL, portal hostname, summary, content, fee structure.

---

## 7. Checklists, Application Drafts, Reminders & Letters

- `GET /api/checklists/:serviceId`: Retrieve saved checklist or generate default.
- `POST /api/checklists/:serviceId`: Save checklist progress array.
- `POST /api/drafts`: Create or update application draft.
- `POST /api/letters/generate`: Generate formal Statement of Purpose or affidavit.
- `POST /api/reminders`: Schedule renewal or deadline reminder.
