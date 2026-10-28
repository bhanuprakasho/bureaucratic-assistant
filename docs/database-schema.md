# Database Schema & Entity-Relationship Specification

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ DOCUMENTS : "owns"
    USERS ||--o{ APPLICATION_DRAFTS : "creates"
    USERS ||--o{ USER_CHECKLISTS : "maintains"
    USERS ||--o{ SCAM_REPORTS : "submits"
    USERS ||--o{ IMMIGRATION_CASES : "initiates"
    USERS ||--o{ IMMIGRATION_CASES : "assigned_as_reviewer"
    USERS ||--o{ AUDIT_LOGS : "acts_in"
    USERS ||--o{ REMINDERS : "schedules"
    USERS ||--o{ LETTERS : "generates"
    
    IMMIGRATION_CASES ||--o{ CASE_DOCUMENTS : "contains"
    DOCUMENTS ||--o{ CASE_DOCUMENTS : "linked_to"
    
    IMMIGRATION_CASES ||--o{ CASE_FLAGS : "generates"
    IMMIGRATION_CASES ||--o{ AUDIT_LOGS : "logs_history"
    
    SERVICES ||--o{ ELIGIBILITY_RULES : "governed_by"

    USERS {
        INTEGER id PK
        TEXT username UK
        TEXT email UK
        TEXT password_hash
        TEXT full_name
        TEXT role
        DATETIME created_at
    }

    DOCUMENTS {
        INTEGER id PK
        INTEGER user_id FK
        TEXT original_name
        TEXT storage_filename
        TEXT storage_path
        TEXT mime_type
        INTEGER file_size
        TEXT document_type
        TEXT confidence
        TEXT extracted_fields
        TEXT raw_text
        INTEGER is_synthetic
        DATETIME created_at
    }

    APPLICATION_DRAFTS {
        INTEGER id PK
        INTEGER user_id FK
        TEXT service_id
        TEXT service_name
        TEXT form_data
        TEXT status
        DATETIME created_at
        DATETIME updated_at
    }

    USER_CHECKLISTS {
        INTEGER id PK
        INTEGER user_id FK
        TEXT service_id
        TEXT service_name
        TEXT items
        DATETIME updated_at
    }

    IMMIGRATION_CASES {
        INTEGER id PK
        TEXT case_number UK
        TEXT applicant_name
        TEXT applicant_email
        TEXT category
        TEXT status
        INTEGER creator_id FK
        INTEGER assigned_reviewer_id FK
        TEXT reviewer_decision
        TEXT reviewer_notes
        DATETIME decision_date
        DATETIME created_at
        DATETIME updated_at
    }

    CASE_DOCUMENTS {
        INTEGER id PK
        INTEGER case_id FK
        INTEGER document_id FK
        TEXT doc_role
        DATETIME created_at
    }

    CASE_FLAGS {
        INTEGER id PK
        INTEGER case_id FK
        TEXT flag_code
        TEXT severity
        TEXT title
        TEXT description
        TEXT evidence
        TEXT status
        TEXT reviewer_comment
        DATETIME created_at
    }

    AUDIT_LOGS {
        INTEGER id PK
        INTEGER case_id FK
        INTEGER user_id FK
        TEXT action
        TEXT details
        TEXT ip_address
        DATETIME created_at
    }

    REMINDERS {
        INTEGER id PK
        INTEGER user_id FK
        TEXT title
        TEXT service_id
        TEXT document_name
        DATE due_date
        TEXT status
        TEXT notification_type
        TEXT notes
        DATETIME created_at
    }

    LETTERS {
        INTEGER id PK
        INTEGER user_id FK
        TEXT title
        TEXT letter_type
        TEXT service_id
        TEXT recipient_office
        TEXT content
        TEXT facts_data
        DATETIME created_at
    }

    KNOWLEDGE_ARTICLES {
        INTEGER id PK
        TEXT slug UK
        TEXT title
        TEXT category
        TEXT jurisdiction
        TEXT source_url
        TEXT official_portal
        DATE effective_date
        DATE verification_date
        TEXT review_status
        TEXT summary
        TEXT content
        TEXT official_fee
        DATETIME created_at
        DATETIME updated_at
    }

    SERVICES {
        TEXT id PK
        TEXT name
        TEXT category
        TEXT description
        TEXT eligibility
        TEXT requiredDocuments
        TEXT steps
        TEXT importantNotes
    }

    ELIGIBILITY_RULES {
        INTEGER id PK
        TEXT scheme_id
        TEXT scheme_name
        INTEGER min_age
        INTEGER max_age
        INTEGER max_income
        INTEGER must_be_student
        TEXT allowed_categories
        TEXT required_docs
    }
```

## 2. Table Definitions & Constraints

### `users`
- Stores registered user identities, password hashes, and access roles.
- `role`: Constrained to `'citizen'`, `'reviewer'`, or `'admin'`.
- Passwords are salted and hashed with `bcryptjs` (10 rounds); plaintext passwords are never stored.

### `documents`
- Represents files uploaded to the private server vault.
- `storage_filename`: Server-generated unique name (`doc-<timestamp>-<random>.ext`), preventing path traversal and name collision.
- `user_id`: Foreign key enforcing data isolation.
- `extracted_fields`: JSON string containing extracted key-value pairs (e.g. Passport number, DOB, Name).

### `immigration_cases`
- Core screening dossiers.
- `status`: `'PENDING_REVIEW'`, `'UNDER_REVIEW'`, `'APPROVED'`, `'REJECTED'`, `'REQUIRES_MORE_INFO'`.
- `case_number`: Unique identifier formatted as `CASE-YYYY-XXXXXX`.

### `case_flags`
- Discrepancies and anomaly findings generated by automated cross-document screening.
- `severity`: `'LOW'`, `'MEDIUM'`, `'HIGH'`, `'CRITICAL'`.
- `status`: `'ACTIVE'`, `'DISMISSED'`, `'RESOLVED'`.

### `audit_logs`
- Append-only security audit log recording case creation, document linkage, screening runs, flag overrides, and reviewer decisions with actor ID, timestamp, and IP address.

### `user_checklists`
- Persists user document preparation progress per government service.
- Unique constraint on `(user_id, service_id)` ensures idempotent progress saving.

### `reminders`
- Renewal and deadline records evaluated periodically by `reminderScheduler.js`.
