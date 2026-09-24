# EXAM SCANNING & SCRIPT VERIFICATION MANAGEMENT SYSTEM
## Comprehensive Product Requirements Document (PRD) & Technical Architecture
**Document Version:** 1.0.0  
**Target Backend:** Supabase (PostgreSQL 15+, Supabase Auth, Row-Level Security, Edge Functions, Storage)  
**Target Frontend:** React 19 + TypeScript (Vite, Tailwind CSS, Vercel-ready)  
**System Classification:** Internal Enterprise Operations Application (Zero Self-Registration)

---

## 1. Product Overview
The **Exam Scanning & Script Verification Management System** is a secure, mission-critical enterprise valuation platform engineered for universities, state examination boards, and high-stakes examination bodies (e.g., Controller of Examinations / Valuation Directorates). 

The platform governs the physical-to-digital custody lifecycle of written examination answer scripts:
- Institutional intake and batch registration of physical answer booklets.
- Ingestion of high-throughput scanned images and index manifests.
- Multi-tier page integrity, booklet continuity, and roll number barcode verification.
- Anomaly containment (missing pages, torn or unreadable scans, duplicate barcodes, booklet mismatches).
- Formal inter-departmental custody transfer (Controller of Examinations, Spot Valuation Centers, Record Rooms).
- Operational monitoring, multi-axis throughput telemetry, and immutable audit trailing.

---

## 2. Problem Statement
Examinations bodies process tens of thousands to millions of handwritten answer booklets across multiple exam tiers and dates. Traditional manual verification workflows suffer from:
1. **Broken Chain of Custody:** Lack of deterministic physical-to-digital tracking leads to misplaced booklets, untracked handover between scanning vendors and valuation custodians, and vulnerability to tampering.
2. **Silent Scan Failures:** Multi-feed scanner errors, skipped pages, blank sheets, inverted pages, and unreadable barcodes often go undetected until evaluation has already commenced.
3. **Ghost & Duplicate Registrations:** Manual transcription causes duplicate script records or roll number collisions across different examination sessions.
4. **Disorganized Exception Resolution:** When a page or booklet is missing, departments rely on ad-hoc paper chits, resulting in untracked delays and risks to student grade release.
5. **Lack of Real-Time Operational Telemetry:** Leadership cannot ascertain scanning throughput, operator defect rates, pending queue backlogs, or valuation readiness without manual spreadsheet consolidation.

---

## 3. Goals
- **100% Chain-of-Custody Accountability:** Track every booklet and individual page from receipt to verification, exception clearance, and archival storage.
- **Zero Public Surface:** Strict internal enterprise perimeter; no self-registration; all users are provisioned, role-bound, and activated by verified administrators.
- **Automated Anomaly Interception:** Instant detection of page gaps (e.g., Pages 1, 2, 4 present, 3 missing), page count anomalies (expected vs. actual), barcode collisions, and duplicate pages.
- **Auditable Departmental Handover:** Multi-step dispatch, receipt, and return receipts with digital signature/operator acknowledgment.
- **High-Throughput Verification:** Ergonomic, keyboard-first, low-latency verification console for verification operators doing high-volume QA.
- **Granular Enterprise Audit Trail:** Immutable, cryptographically timestamped records for every state mutation, anomaly flag, user transition, and export action.

---

## 4. Non-Goals
- **Student Grade Evaluation / Marking Engine:** The system handles script intake, digital verification, and physical custody, NOT the grading or subjective rubric scoring of answers.
- **Public Candidate Portal:** Candidates will never access this system. Roll numbers, scripts, and logs remain strictly internal to authorized examination personnel.
- **Direct Hardware TWAIN/SANE Driver Scanning in Browser:** Scanners operate via dedicated industrial scanning stations exporting structured batches (TIFF/PDF/JPEG + CSV/JSON manifests) into the system storage.
- **Payment Processing / Student Fee Portals:** Fee collection or hall ticket generation belongs to the student information system (SIS), outside this operational boundary.

---

## 5. User Roles
The system enforces strict Role-Based Access Control (RBAC) across 7 primary operational personas:

| Role Code | Role Name | Primary Responsibility |
| :--- | :--- | :--- |
| `super_admin` | **Super Administrator** | Complete institutional authority. Manages system configurations, global permissions, database health, audit oversight, and role definitions. |
| `admin` | **Administrator** | Manages exam sessions, subjects, exam dates, user accounts (creation/activation), and assigns operational roles. |
| `supervisor` | **Valuation Supervisor** | Oversees batch allocation, queues, resolves verification exceptions, reviews departmental dispatches, and approves script releases. |
| `scanner_operator` | **Scanner Operator** | Ingests physical batches, uploads scan manifests/images, inspects initial ingest counts, and flags hardware-level scan errors. |
| `verification_operator` | **Verification Operator** | High-speed page-by-page QA, barcode/roll-number validation, page continuity check, and anomaly flagging. |
| `coe_user` | **COE / Exam Cell User** | Controller of Examinations personnel handling cross-departmental handovers, custody disputes, and missing script investigations. |
| `viewer` | **Auditor / Read-Only Viewer** | Authorized observers with read-only access to progress dashboards, operational reports, and immutable audit logs. |

---

## 6. Permission Model
Permissions are modeled as granular string actions assigned to roles via `role_permissions`:

```
users:create, users:read, users:update, users:activate, users:deactivate
sessions:create, sessions:read, sessions:update, sessions:close
subjects:create, subjects:read, subjects:update
batches:create, batches:read, batches:update, batches:receive
scripts:import, scripts:read, scripts:update, scripts:delete_draft
scripts:verify, scripts:flag_exception, scripts:reopen
pages:read, pages:verify, pages:flag_damaged
exceptions:create, exceptions:read, exceptions:resolve, exceptions:escalate
handovers:create, handovers:receive, handovers:return, handovers:read
reports:read, reports:export_excel, reports:export_pdf
audit:read, settings:read, settings:update
```

A user's effective permissions are evaluated via PostgreSQL RLS functions matching `auth.uid()` against `profiles` -> `roles` -> `role_permissions`.

---

## 7. Complete 8-Module Architecture

```
+---------------------------------------------------------------------------------------------------+
|                        EXAM SCANNING & SCRIPT VERIFICATION SYSTEM                                 |
+---------------------------------------------------------------------------------------------------+
| Module 1: Auth & User Mgmt       | Module 2: Exam & Session Mgmt    | Module 3: Receiving & Scanning|
| - Internal Admin Provisioning    | - Exam Sessions (Winter/Summer)  | - Batch Manifest Intake       |
| - Zero Public Signup             | - Programs & Course Mapping      | - Barcode & Roll No Ingestion |
| - Password Reset / Enforce Force | - Subject Registry               | - Multi-Page File Archival    |
| - Role & Profile Governance      | - Exam Dates & Session Status    | - Duplicate Collision Guard   |
+----------------------------------+----------------------------------+-------------------------------+
| Module 4: Script Verification    | Module 5: Exceptions & Handover  | Module 6: Dashboard & Telemetry|
| - Rapid Verification Queue       | - Discrepancy Registry           | - Live Pipeline Metrics       |
| - Page Continuity & Sequence QA  | - Missing Script/Page Isolation  | - Station Throughput Telemetry|
| - Roll No / Dummy No Reconcile   | - Inter-Dept Handover Manifests  | - Anomaly Resolution Funnels  |
| - Defect Tagging (Torn/Blotted)  | - Return & Re-verification Loop  | - Operator Productivity Stats |
+----------------------------------+----------------------------------+-------------------------------+
| Module 7: Reports & Export       | Module 8: Admin & Audit Oversight                                |
| - Tabular & Certified PDF Dockets| - Append-Only Immutable Audit Log                                |
| - Excel Operational Dispatches   | - Field-Level Diff Tracking (Pre/Post State)                     |
| - Missing Booklets Reports       | - Controlled Correction & Master Configuration Switches          |
+----------------------------------+------------------------------------------------------------------+
```

---

## 8. Detailed Module Requirements

### Module 1: Authentication & User Management
- **No Public Signup:** The Supabase Auth signup API is completely disabled for public callers (`enable_signup = false`).
- **Internal User Provisioning:** Only `super_admin` and `admin` can trigger user creation via a secure Supabase Edge Function (`create-user`) that leverages the Supabase Service Role to register auth credentials and bind profile metadata.
- **Account State Machine:** `ACTIVE`, `SUSPENDED`, `DEACTIVATED`, `PENDING_PASSWORD_CHANGE`.
- **First-Time Password Reset:** Auto-generated secure temporary password; user is prompted to set a new compliant password upon first login.
- **Session Protection:** Configurable inactivity timeout (default: 45 minutes of idle state triggers lock screen).

### Module 2: Examination & Session Management
- **Exam Session Lifecycle:** `DRAFT` -> `ACTIVE` -> `FROZEN` (no new subjects/batches) -> `COMPLETED` -> `ARCHIVED`.
- **Subject Master:** Subject Code, Subject Name, Degree/Program, Regulation Scheme, Expected Default Page Count (e.g., 32 pages or 40 pages), Barcode Pattern Regex.
- **Exam Date Scheduling:** Links Session + Subject + Date + Shift (Morning/Afternoon) + Center Code.
- **Status Guards:** Prevents deletion of any subject or exam date once batches or scripts have been associated.

### Module 3: Script Receiving & Scanning
- **Batch Intake Entity:** Physical bundle metadata (Box No, Bundle Tag, Exam Center Code, Received By, Script Expected Count, Scanning Station ID).
- **Manifest Import Engine:** Supports batch upload via CSV/JSON index paired with scanned bundle images in Supabase Storage.
- **Script Barcode Registration:** Ingests Barcode / Dummy Barcode / Roll Number mappings.
- **Page Assembly:** Attaches individual scanned page records (`script_pages`) with page numbers, scan resolution/aspect flags, and storage paths.
- **Pre-Verification Validation:** Automated collision test (identifies duplicate roll numbers within the same subject/session before human QA starts).

### Module 4: Script Verification
- **Ergonomic Verification Console:** Dual-pane layout: Left pane shows script metadata, page list with thumbnail statuses, keyboard shortcuts (`[V]` Valid, `[M]` Missing, `[D]` Damaged, `[N]` Next Script); Right pane shows high-resolution canvas with pan/zoom/rotate capabilities.
- **Continuity Verification:** Asserts exact numerical progression (Page 1 through N). If Page 3 is skipped, the script cannot be marked `VERIFIED`.
- **Page Status Markers:** `PAGE_OK`, `PAGE_BLANK`, `PAGE_ILLEGIBLE`, `PAGE_DAMAGED`, `PAGE_DUPLICATE`.
- **Script Final Status Decision:** `VERIFIED`, `HAS_EXCEPTIONS`, `REJECTED_SCAN_QUALITY`.

### Module 5: Exception & Department Handover
- **Exception Categories:** `MISSING_SCRIPT`, `MISSING_PAGE`, `DAMAGED_BOOKLET`, `ROLL_NUMBER_COLLISION`, `WRONG_SUBJECT_ATTACHED`, `BARCODE_UNREADABLE`.
- **Handover Workflow:** Handover docket generation (`handover_records` and `handover_items`) sent to external departments (e.g., "Controller of Examinations", "Evaluation Center #3", "Scanning Vendor Recovery").
- **Chain-of-Custody Signoff:** Dispatching officer, recipient badge number, transit dispatch timestamp, return acknowledgment timestamp, resolution notes.
- **Resolution Loop:** Once the COE finds the physical missing booklet or provides a re-scanned page, the exception is resolved with resolution notes and routed back into the verification queue.

### Module 6: Dashboard & Monitoring
- **Operational KPI Cards:** Total Active Sessions, Total Registered Scripts, Physical Received vs. Scanned, Verification Completion %, Open Critical Exceptions, Handover In-Transit Count.
- **Throughput Telemetry:** Hourly verification throughput per operator; scanner batch ingestion velocity.
- **Bottleneck Matrix:** Breakdown of exceptions by Subject and Center Code to identify scanning hardware defects or center-level logistics failures.
- **Zero Heavy Vanity Visuals:** High-density, fast-loading SVG sparklines and data tables tailored for operations managers.

### Module 7: Reports & Export
- **Operational Reports:**
  1. *Master Session Ingestion & Verification Summary*
  2. *Subject-wise Discrepancy & Missing Pages Docket*
  3. *Unresolved Exception & Missing Script Register*
  4. *Departmental Handover Custody Logbook*
  5. *Operator Productivity & Accuracy Audit*
- **Export Engines:**
  - Client-side streaming CSV / Excel workbook generation.
  - Printable, court/audit-admissible PDF dockets formatted with institutional header, signature blocks, and generation timestamps.

### Module 8: Administration, Audit & System Settings
- **Immutable Audit Log:** Append-only log table capturing Actor ID, IP/User-Agent, Action Type, Target Resource, Before-JSON, After-JSON, and Timestamp.
- **System Settings Registry:** Enforces organization-wide parameters: Default Page Tolerance, Max Batch Size, Inactivity Session Timeout, Storage Bucket Names, Barcode Regex Rules.
- **Data Correction Governance:** Any post-verification override on roll numbers or page counts requires Supervisor dual-authorization and generates a high-severity audit record.

---

## 9. End-to-End Workflows

```
[Admin] Creates Session -> Adds Subjects & Exam Dates
                              │
                              ▼
[Scanner Operator] Physical Batch Arrives at Ingest Desk
                              │
                              ▼
[Scanner Operator] Scans Bundle -> Imports Manifest + Images into Storage
                              │ (System detects duplicate barcodes or count mismatch)
                              ▼
[Verification Operator] Opens Script Verification Queue
                              │
         ┌────────────────────┴────────────────────┐
         │ (All Pages Valid & Present)             │ (Page Missing / Damaged / Mismatch)
         ▼                                         ▼
[Marked VERIFIED]                         [Marked HAS_EXCEPTIONS]
         │                                         │
         │                                         ▼
         │                                [Exception Auto-Generated in Module 5]
         │                                         │
         │                                         ▼
         │                                [Handover Docket to COE / Vendor]
         │                                         │
         │                                         ▼
         │                                [COE Returns Corrected Booklet / Scan]
         │                                         │
         │                                         ▼
         │                                [Resolved & Re-queued for QA]
         │                                         │
         └────────────────────┬────────────────────┘
                              ▼
[Master Verification Cleared] -> Final Session Report Generated -> Archive
```

---

## 10. Business Rules
1. **No Self-Registration:** Public sign-up is forbidden. Any user not pre-created by an Admin with an active profile cannot access the system.
2. **Deterministic Script Uniqueness:** A script is unique by `(exam_session_id, subject_id, roll_number)`. Duplicate insertions within the same subject are rejected at the database level via a unique constraint.
3. **Strict Page Count Enforcement:** If a subject requires 32 pages, any script with fewer or more pages triggers a `PAGE_COUNT_ANOMALY` exception requiring supervisor signoff.
4. **No Orphan Pages:** A page cannot exist without a valid parent `script_id`.
5. **No Verification Without Page Inspection:** A script cannot be marked `VERIFIED` unless every associated page has an explicit non-null page status and zero active unhandled exceptions.
6. **Immutable Historical Batches:** Once a batch is marked `COMPLETED` and all scripts are verified, batch metadata cannot be mutated without a Super Admin override.
7. **Departmental Handover Lock:** Scripts actively assigned to an open `department_handover` with status `DISPATCHED` are locked from editing in the normal verification queue until formal `RETURNED` status is acknowledged.
8. **Soft Deletions Only:** Core operational entities (scripts, batches, handovers) are never deleted via `DELETE` in production; they carry `is_deleted = true`, `deleted_at`, and `deleted_by` to maintain regulatory auditability.

---

## 11. Database ER-Style Architecture

```
auth.users (Supabase Auth Core)
    │ 1:1
    ▼
profiles (id = auth.users.id)
    │ M:1
    ▼
roles (id, code, name)
    │ M:N (via role_permissions)
    ▼
permissions (id, code, name)

exam_sessions (1) ────< (N) exam_dates (1) ────< (N) script_batches (1) ────< (N) scripts
       │                         │                                                    │ (1)
       │ (1)                     │ (N)                                                │
       ▼                         ▼                                                    ▼ (N)
   subjects ─────────────────────┘                                              script_pages
       │                                                                              │
       └───────────────────────────────────┬──────────────────────────────────────────┘
                                           │
                                           ▼
                                      exceptions (1) ───< (N) exception_resolutions
                                           │
                                           ▼ (Optional Handover link)
                              department_handovers (1) ───< (N) handover_items (links to scripts)
```

---

## 12. Final Recommended Supabase Tables (Normalized PostgreSQL)

### 1. `roles`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `code`: `VARCHAR(50) UNIQUE NOT NULL` (e.g., 'super_admin', 'admin', 'supervisor', 'scanner_operator', 'verification_operator', 'coe_user', 'viewer')
- `name`: `VARCHAR(100) NOT NULL`
- `description`: `TEXT`
- `is_system`: `BOOLEAN NOT NULL DEFAULT true`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 2. `permissions`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `code`: `VARCHAR(100) UNIQUE NOT NULL` (e.g., 'scripts:verify')
- `module`: `VARCHAR(50) NOT NULL`
- `description`: `TEXT`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 3. `role_permissions`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `role_id`: `UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE`
- `permission_id`: `UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- *Constraint:* `UNIQUE (role_id, permission_id)`

### 4. `profiles`
- `id`: `UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT`
- `email`: `VARCHAR(255) NOT NULL`
- `full_name`: `VARCHAR(150) NOT NULL`
- `role_id`: `UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT`
- `badge_number`: `VARCHAR(50)`
- `phone`: `VARCHAR(30)`
- `status`: `VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED'))`
- `must_change_password`: `BOOLEAN NOT NULL DEFAULT false`
- `created_by`: `UUID REFERENCES profiles(id)`
- `updated_by`: `UUID REFERENCES profiles(id)`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 5. `exam_sessions`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `session_code`: `VARCHAR(50) UNIQUE NOT NULL` (e.g., 'NOV-DEC-2026')
- `session_name`: `VARCHAR(150) NOT NULL`
- `academic_year`: `VARCHAR(20) NOT NULL`
- `start_date`: `DATE NOT NULL`
- `end_date`: `DATE NOT NULL`
- `status`: `VARCHAR(30) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'FROZEN', 'COMPLETED', 'ARCHIVED'))`
- `created_by`: `UUID NOT NULL REFERENCES profiles(id)`
- `updated_by`: `UUID REFERENCES profiles(id)`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 6. `subjects`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `session_id`: `UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE RESTRICT`
- `subject_code`: `VARCHAR(50) NOT NULL`
- `subject_name`: `VARCHAR(200) NOT NULL`
- `course_program`: `VARCHAR(100) NOT NULL`
- `expected_pages`: `INTEGER NOT NULL DEFAULT 32 CHECK (expected_pages > 0)`
- `barcode_regex`: `VARCHAR(100) DEFAULT '^[A-Z0-9]{8,16}$'`
- `is_active`: `BOOLEAN NOT NULL DEFAULT true`
- `created_by`: `UUID NOT NULL REFERENCES profiles(id)`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- *Constraint:* `UNIQUE (session_id, subject_code)`

### 7. `exam_dates`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `session_id`: `UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE RESTRICT`
- `subject_id`: `UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT`
- `exam_date`: `DATE NOT NULL`
- `session_slot`: `VARCHAR(20) NOT NULL CHECK (session_slot IN ('FORENOON', 'AFTERNOON', 'EVENING'))`
- `center_code`: `VARCHAR(50) NOT NULL`
- `center_name`: `VARCHAR(150)`
- `status`: `VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'CONCLUDED', 'CANCELLED'))`
- `created_by`: `UUID NOT NULL REFERENCES profiles(id)`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- *Constraint:* `UNIQUE (session_id, subject_id, exam_date, session_slot, center_code)`

### 8. `script_batches`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `batch_number`: `VARCHAR(50) UNIQUE NOT NULL`
- `session_id`: `UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE RESTRICT`
- `exam_date_id`: `UUID NOT NULL REFERENCES exam_dates(id) ON DELETE RESTRICT`
- `subject_id`: `UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT`
- `box_bundle_number`: `VARCHAR(50)`
- `declared_script_count`: `INTEGER NOT NULL CHECK (declared_script_count >= 0)`
- `scanned_script_count`: `INTEGER NOT NULL DEFAULT 0 CHECK (scanned_script_count >= 0)`
- `verified_script_count`: `INTEGER NOT NULL DEFAULT 0 CHECK (verified_script_count >= 0)`
- `status`: `VARCHAR(30) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'SCANNING_IN_PROGRESS', 'SCANNED', 'VERIFICATION_IN_PROGRESS', 'VERIFIED', 'EXCEPTION_HOLD', 'CLOSED'))`
- `received_by`: `UUID NOT NULL REFERENCES profiles(id)`
- `scanner_operator_id`: `UUID REFERENCES profiles(id)`
- `remarks`: `TEXT`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 9. `scripts`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `batch_id`: `UUID NOT NULL REFERENCES script_batches(id) ON DELETE RESTRICT`
- `session_id`: `UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE RESTRICT`
- `subject_id`: `UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT`
- `exam_date_id`: `UUID NOT NULL REFERENCES exam_dates(id) ON DELETE RESTRICT`
- `roll_number`: `VARCHAR(60) NOT NULL`
- `dummy_barcode`: `VARCHAR(80)`
- `sequence_in_batch`: `INTEGER NOT NULL`
- `expected_page_count`: `INTEGER NOT NULL`
- `actual_page_count`: `INTEGER NOT NULL DEFAULT 0`
- `status`: `VARCHAR(35) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_VERIFICATION', 'VERIFIED', 'HAS_EXCEPTIONS', 'SENT_TO_DEPT', 'REJECTED'))`
- `verification_operator_id`: `UUID REFERENCES profiles(id)`
- `verified_at`: `TIMESTAMPTZ`
- `is_flagged`: `BOOLEAN NOT NULL DEFAULT false`
- `flag_reason`: `VARCHAR(100)`
- `remarks`: `TEXT`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- *Constraint:* `UNIQUE (session_id, subject_id, roll_number)`

### 10. `script_pages`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `script_id`: `UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE`
- `page_number`: `INTEGER NOT NULL CHECK (page_number > 0)`
- `storage_path`: `TEXT NOT NULL`
- `file_hash`: `VARCHAR(64)`
- `page_status`: `VARCHAR(30) NOT NULL DEFAULT 'SCANNED' CHECK (page_status IN ('SCANNED', 'VALID', 'BLANK', 'DAMAGED', 'ILLEGIBLE', 'DUPLICATE', 'MISSING_REPLACEMENT'))`
- `is_missing`: `BOOLEAN NOT NULL DEFAULT false`
- `is_damaged`: `BOOLEAN NOT NULL DEFAULT false`
- `operator_remarks`: `TEXT`
- `verified_by`: `UUID REFERENCES profiles(id)`
- `verified_at`: `TIMESTAMPTZ`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- *Constraint:* `UNIQUE (script_id, page_number)`

### 11. `verification_records`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `script_id`: `UUID NOT NULL REFERENCES scripts(id) ON DELETE RESTRICT`
- `operator_id`: `UUID NOT NULL REFERENCES profiles(id)`
- `duration_seconds`: `INTEGER DEFAULT 0`
- `pages_checked`: `INTEGER NOT NULL`
- `initial_status`: `VARCHAR(35) NOT NULL`
- `final_status`: `VARCHAR(35) NOT NULL`
- `discrepancy_found`: `BOOLEAN NOT NULL DEFAULT false`
- `notes`: `TEXT`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 12. `exceptions`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `exception_code`: `VARCHAR(50) UNIQUE NOT NULL` (e.g., 'EXC-2026-000491')
- `session_id`: `UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE RESTRICT`
- `script_id`: `UUID REFERENCES scripts(id) ON DELETE SET NULL`
- `page_id`: `UUID REFERENCES script_pages(id) ON DELETE SET NULL`
- `batch_id`: `UUID NOT NULL REFERENCES script_batches(id) ON DELETE RESTRICT`
- `exception_type`: `VARCHAR(40) NOT NULL CHECK (exception_type IN ('MISSING_SCRIPT', 'MISSING_PAGE', 'DAMAGED_SCRIPT', 'DUPLICATE_BARCODE', 'PAGE_COUNT_MISMATCH', 'ILLEGIBLE_SCAN', 'SUBJECT_MISMATCH', 'OTHER'))`
- `severity`: `VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))`
- `status`: `VARCHAR(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'INVESTIGATING', 'DISPATCHED_TO_DEPT', 'RESOLVED', 'CLOSED_UNRESOLVED'))`
- `description`: `TEXT NOT NULL`
- `resolution_notes`: `TEXT`
- `reported_by`: `UUID NOT NULL REFERENCES profiles(id)`
- `resolved_by`: `UUID REFERENCES profiles(id)`
- `resolved_at`: `TIMESTAMPTZ`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 13. `department_handovers`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `docket_number`: `VARCHAR(50) UNIQUE NOT NULL` (e.g., 'HND-COE-2026-0012')
- `target_department`: `VARCHAR(100) NOT NULL` (e.g., 'Controller of Examinations', 'Confidential Valuation Unit')
- `recipient_officer_name`: `VARCHAR(150) NOT NULL`
- `recipient_badge_id`: `VARCHAR(50)`
- `dispatched_by`: `UUID NOT NULL REFERENCES profiles(id)`
- `dispatched_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `status`: `VARCHAR(30) NOT NULL DEFAULT 'DISPATCHED' CHECK (status IN ('DISPATCHED', 'RECEIVED_BY_DEPT', 'PARTIALLY_RETURNED', 'FULLY_RETURNED', 'CLOSED'))`
- `reason_for_transfer`: `TEXT NOT NULL`
- `return_received_by`: `UUID REFERENCES profiles(id)`
- `returned_at`: `TIMESTAMPTZ`
- `return_remarks`: `TEXT`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 14. `handover_items`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `handover_id`: `UUID NOT NULL REFERENCES department_handovers(id) ON DELETE CASCADE`
- `script_id`: `UUID NOT NULL REFERENCES scripts(id) ON DELETE RESTRICT`
- `exception_id`: `UUID REFERENCES exceptions(id) ON DELETE SET NULL`
- `item_status`: `VARCHAR(30) NOT NULL DEFAULT 'IN_TRANSIT' CHECK (item_status IN ('IN_TRANSIT', 'WITH_DEPARTMENT', 'RETURNED_RESOLVED', 'LOST_CONFIRMED'))`
- `item_remarks`: `TEXT`
- `returned_at`: `TIMESTAMPTZ`
- *Constraint:* `UNIQUE (handover_id, script_id)`

### 15. `audit_logs`
- `id`: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `actor_id`: `UUID REFERENCES profiles(id) ON DELETE SET NULL`
- `actor_email`: `VARCHAR(255)`
- `actor_role`: `VARCHAR(50)`
- `action`: `VARCHAR(80) NOT NULL` (e.g., 'USER_CREATED', 'SCRIPT_VERIFIED', 'EXCEPTION_FLAGGED')
- `entity_name`: `VARCHAR(60) NOT NULL`
- `entity_id`: `VARCHAR(100) NOT NULL`
- `old_values`: `JSONB`
- `new_values`: `JSONB`
- `ip_address`: `VARCHAR(45)`
- `user_agent`: `TEXT`
- `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

### 16. `system_settings`
- `key`: `VARCHAR(80) PRIMARY KEY`
- `value`: `JSONB NOT NULL`
- `category`: `VARCHAR(50) NOT NULL DEFAULT 'GENERAL'`
- `description`: `TEXT`
- `updated_by`: `UUID REFERENCES profiles(id)`
- `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`

---

## 13. Table Relationships & Indexes

### Foreign Key Cascades:
- Profiles referencing `auth.users`: `ON DELETE RESTRICT` (prevents dangling historical records).
- `script_pages` referencing `scripts`: `ON DELETE CASCADE` (pages follow script lifecycle).
- `scripts` referencing `script_batches`: `ON DELETE RESTRICT` (batches cannot be deleted while containing scripts).
- `handover_items` referencing `department_handovers`: `ON DELETE CASCADE`.

### Performance Indexes:
```sql
CREATE INDEX idx_profiles_role_id ON profiles(role_id);
CREATE INDEX idx_profiles_status ON profiles(status);

CREATE INDEX idx_subjects_session_id ON subjects(session_id);
CREATE INDEX idx_exam_dates_session_subject ON exam_dates(session_id, subject_id, exam_date);

CREATE INDEX idx_script_batches_session ON script_batches(session_id);
CREATE INDEX idx_script_batches_status ON script_batches(status);

CREATE INDEX idx_scripts_batch_id ON scripts(batch_id);
CREATE INDEX idx_scripts_status ON scripts(status);
CREATE INDEX idx_scripts_session_subject ON scripts(session_id, subject_id);
CREATE INDEX idx_scripts_roll_number ON scripts(roll_number);

CREATE INDEX idx_script_pages_script_id ON script_pages(script_id);
CREATE INDEX idx_script_pages_page_status ON script_pages(page_status);

CREATE INDEX idx_exceptions_script_id ON exceptions(script_id);
CREATE INDEX idx_exceptions_status ON exceptions(status);
CREATE INDEX idx_exceptions_batch_id ON exceptions(batch_id);

CREATE INDEX idx_handovers_status ON department_handovers(status);
CREATE INDEX idx_handover_items_handover_id ON handover_items(handover_id);
CREATE INDEX idx_handover_items_script_id ON handover_items(script_id);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_name, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

---

## 14. Row-Level Security (RLS) Strategy
PostgreSQL RLS is enabled on ALL 16 tables. Access is dictated by the verified caller's role mapped via a cached helper function: `get_user_role(auth.uid())`.

### Global Helper Functions (PostgreSQL):
```sql
CREATE OR REPLACE FUNCTION auth.get_user_role()
RETURNS VARCHAR AS $$
  SELECT r.code 
  FROM public.profiles p
  JOIN public.roles r ON p.role_id = r.id
  WHERE p.id = auth.uid() AND p.status = 'ACTIVE';
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auth.has_permission(perm_code VARCHAR)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.profiles p
    JOIN public.role_permissions rp ON p.role_id = rp.role_id
    JOIN public.permissions perm ON rp.permission_id = perm.id
    WHERE p.id = auth.uid() 
      AND p.status = 'ACTIVE' 
      AND perm.code = perm_code
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Table-by-Table Policy Enforcements:
1. **`profiles`:**
   - `SELECT`: All authenticated active users can view other active profiles (to display names of creators/verifiers).
   - `INSERT / UPDATE / DELETE`: Only `super_admin` and `admin` via Edge Function or explicit role check. Users may only update their own phone or UI preferences.
2. **`exam_sessions`, `subjects`, `exam_dates`:**
   - `SELECT`: Any authenticated active user.
   - `INSERT / UPDATE`: Only roles with `sessions:create` / `subjects:create` (`super_admin`, `admin`).
   - `DELETE`: Disallowed; only status change to `ARCHIVED` or `CANCELLED`.
3. **`script_batches`:**
   - `SELECT`: All authenticated operational roles.
   - `INSERT`: `scanner_operator`, `supervisor`, `admin`, `super_admin`.
   - `UPDATE`: `scanner_operator` (while scanning), `supervisor` (for state transitions).
4. **`scripts` & `script_pages`:**
   - `SELECT`: All authenticated operational roles.
   - `INSERT`: Scanner operators during batch ingest.
   - `UPDATE`: Verification operators (during active assignment), supervisors, admins.
5. **`exceptions`:**
   - `SELECT`: All operational roles.
   - `INSERT`: `verification_operator`, `scanner_operator`, `supervisor`.
   - `UPDATE`: `supervisor`, `coe_user`, `admin`.
6. **`department_handovers` & `handover_items`:**
   - `SELECT`: `coe_user`, `supervisor`, `admin`, `super_admin`.
   - `INSERT / UPDATE`: `coe_user`, `supervisor`, `admin`.
7. **`audit_logs`:**
   - `SELECT`: `super_admin`, `admin`, `viewer`.
   - `INSERT`: Automatically through PostgreSQL triggers or system edge functions. Never updatable or deletable by any role (`REVOKE UPDATE, DELETE ON audit_logs`).
8. **`system_settings`:**
   - `SELECT`: All authenticated users.
   - `UPDATE`: `super_admin` only.

---

## 15. Edge Function Strategy
Direct frontend-to-PostgreSQL communication with RLS handles 80% of standard reads and single-record updates. Supabase Edge Functions (Deno / TypeScript) are reserved strictly for high-privilege or bulk-transaction scenarios:

1. **`create-user` (Module 1):**
   - *Why Edge Function:* Calls `supabase.auth.admin.createUser()` with service-role token. Frontend never holds service-role secrets. Validates caller is `super_admin` or `admin`, generates secure random credential, creates profile, sets role, sends admin activation email.
2. **`batch-import-scripts` (Module 3):**
   - *Why Edge Function:* Ingests 500-2,000 script records from a CSV/JSON manifest in a single transactional database boundary. Performs atomic pre-flight validation (duplicate roll numbers, invalid subjects) before committing.
3. **`generate-report` (Module 7):**
   - *Why Edge Function:* Aggregates heavy cross-table data (100k+ rows) for certified PDF and Excel rendering, signs the generated document with an institutional hash, and caches the file in Supabase Storage.
4. **`bulk-exception-handover` (Module 5):**
   - *Why Edge Function:* Atomic state shift of 50+ scripts into a handover docket, generating sequential custody tracking codes and locking script verification queues in one ACID transaction.

---

## 16. API / Data-Access Strategy
- **Client Library:** `@supabase/supabase-js` instantiated as a typed singleton in the React client using standard `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- **Query Optimization:** Strict projection queries (no `SELECT *` on large tables like `scripts` and `pages`).
- **Server-Side Pagination:** Standard limit-offset or keyset cursor queries for tabular grids (default page size: 25, 50, 100).
- **PostgreSQL Views:** Materialized views or standard views for aggregated dashboard stats (`view_session_progress`, `view_operator_hourly_stats`) to eliminate heavy client-side joins.
- **Transactions:** High-integrity multi-table mutations are wrapped in database RPC functions (`SECURITY DEFINER`) or Edge Functions.

---

## 17. Authentication Architecture
- **Supabase Auth Provider:** Native email/password authentication.
- **Disabled Public Registration:** Supabase project configuration has "Enable Email Signups" turned OFF.
- **Admin-Controlled Lifecycle:**
  1. Admin navigates to User Management -> "Provision User".
  2. Input: Email, Full Name, Badge ID, Assigned Role.
  3. Edge Function creates the Supabase Auth user record and associated `profiles` row with `must_change_password = true`.
  4. User logs in with temporary password -> System detects `must_change_password` flag and forces modal redirect to update password before granting access to dashboard.
- **Token Management:** JWT contains custom claims (`app_metadata.role_code`) refreshed upon role modification.
- **Session Timeout:** Client-side inactivity listener automatically invalidates local session tokens after 45 minutes of user inactivity.

---

## 18. Audit Architecture
- **Automatic PostgreSQL Audit Triggers:** Triggers installed on `scripts`, `exceptions`, `script_batches`, and `department_handovers` record changes directly into `audit_logs` capturing:
  - `old_values` (JSONB)
  - `new_values` (JSONB)
  - `actor_id` (retrieved via `auth.uid()`)
  - `action` (`INSERT`, `UPDATE`, `DELETE`)
- **Application-Level Operational Events:** Explicit actions (e.g., `SCRIPT_MARKED_DAMAGED`, `HANDOVER_DISPATCHED`, `USER_DEACTIVATED`) invoke an `auditService.logEvent()` to record high-level semantic context.
- **Immutability:** RLS explicitly disallows any `UPDATE` or `DELETE` on the `audit_logs` table for all roles including `super_admin`.

---

## 19. File & Storage Architecture
- **Storage Bucket:** `exam-scripts` (Private bucket with signed URLs).
- **Bucket Folder Hierarchy:**
  `exam-scripts/{session_code}/{subject_code}/batch_{batch_number}/script_{roll_number}/page_{page_number}.jpg`
- **Access Control:** Storage RLS policies ensure:
  - Only authenticated users with `scripts:read` or `pages:read` can obtain signed URLs.
  - Upload is restricted to `scanner_operator`, `supervisor`, `admin`.
  - Direct public access via public URL is strictly disabled.
- **Image Optimization:** Industrial scanners upload high-res JPEGs (300 DPI, Grayscale/Color). Verification client utilizes compressed preview thumbnails (150 DPI) for instant list navigation, loading full resolution only on viewport zoom.

---

## 20. Import / Export Architecture
- **Import Formats:** CSV and JSON batch manifests containing:
  `Roll Number, Subject Code, Exam Date, Center Code, Declared Pages, Image File Names`.
- **Validation Pipeline:**
  1. *Header & Schema Check:* Asserts all mandatory columns are present.
  2. *Subject & Date Cross-Check:* Verifies subject code belongs to active session and date.
  3. *Uniqueness & Duplication Check:* Scans for duplicate roll numbers within the incoming file and against existing database records.
  4. *Atomic Ingestion:* Ingests batch and scripts inside a single database transaction.
- **Export Formats:**
  - **Excel (XLSX):** Multi-sheet workbooks for operational lists (Clean scripts, Exceptions, Handover manifests).
  - **PDF:** Formal institutional certificates and dockets formatted with university crest, barcode, summary tables, and signature lines.

---

## 21. Performance Architecture
- **Query Optimization:** Strict indexed lookups on all filterable dimensions (`session_id`, `status`, `subject_id`, `roll_number`).
- **Pagination Strategy:** Infinite scrolling or page-numbered tables with fixed `LIMIT 50 OFFSET X` and explicit count strategies.
- **Client-Side Virtualization:** Large tables (e.g., verifying 500 scripts in a queue) render via virtualized windowing (`@tanstack/react-virtual` or equivalent clean windowing) to keep DOM node count below 200.
- **Optimized Asset Loading:** Pre-fetching of the next 2 script page images while the operator verifies the current page to ensure sub-100ms transitions.
- **Database Connection Pooling:** Utilizes Supabase Supavisor transaction pooler on port 6543 to support concurrent verification operators.

---

## 22. Error-Handling Strategy
- **Standardized API Responses:** All RPC functions and Edge Functions return uniform envelopes:
  `{ success: true, data: ... }` or `{ success: false, error: { code, message, details } }`.
- **Frontend Boundary Protection:** React Error Boundaries around major operational workspaces (Verification Canvas, Batch Uploader) preventing full-app crash.
- **Network Resilience:** Offline/flaky connection notification banner with automatic retry mechanism for verification state commits.
- **Audit of Operational Errors:** Failed validation or unauthorized privilege attempts trigger high-priority warning entries in `audit_logs`.

---

## 23. Validation Strategy
- **Database Layer:** `CHECK` constraints (e.g., positive page counts, valid enum strings), `NOT NULL` constraints, and composite `UNIQUE` keys.
- **PostgreSQL Trigger Validation:** Prevents closing a batch if there are pending unresolved scripts in `IN_VERIFICATION`.
- **TypeScript / Zod Layer:** Strict schema validation in React client before network dispatch:
  - Roll number format validation against subject regex.
  - Required fields in batch intake and handover dockets.
  - Safe parsing of CSV manifests.

---

## 24. UI/UX Architecture
- **Design Philosophy:** Clean, distraction-free, desktop-first enterprise workstation.
- **Color Palette & Contrast:** Slate/Zinc neutral framework with high-contrast functional color-coding:
  - Emerald (`#059669`): Verified / Valid / Active
  - Amber (`#D97706`): In Progress / Pending Verification / Handover In-Transit
  - Rose (`#E11D48`): Exception / Missing Page / Damaged / Critical
  - Sky/Indigo (`#2563EB`): Primary Action / Session Active / Filter Badge
- **Typography:** Clear tabular monospaced numbers for roll numbers, page indices, barcodes, and counts (`font-mono`).
- **Layout Architecture:**
  - Collapsible slim sidebar navigation.
  - Top persistent status bar: Active Session selector, Current User Role badge, Operational Alerts bell.
  - Main operational viewport with breadcrumb routing and contextual actions header.

---

## 25. Navigation Structure (8-Module Layout)

```
[Exam Verification Enterprise System]
│
├── 📊 Dashboard (Module 6)
│   ├── Operational Overview
│   ├── Scanning & Ingest Velocity
│   └── Verification Pipeline Matrix
│
├── 📅 Sessions & Subjects (Module 2)
│   ├── Exam Sessions
│   ├── Subject Registry
│   └── Examination Date Schedules
│
├── 📥 Receiving & Scanning (Module 3)
│   ├── Physical Batch Intake
│   ├── Manifest & Image Ingestion
│   └── Batch Inventory & Tracking
│
├── 🔍 Script Verification (Module 4)
│   ├── Active Verification Queue
│   ├── Verification Canvas Workspace
│   └── Completed Verification Log
│
├── ⚠️ Exceptions & Handover (Module 5)
│   ├── Exception Registry (Missing/Damaged)
│   ├── Department Handover Dockets
│   └── Return & Reconciliation Queue
│
├── 📈 Reports & Analytics (Module 7)
│   ├── Session Summary Dockets
│   ├── Missing Script & Anomaly Reports
│   ├── Handover Custody Logbook
│   └── Operator Throughput Audit
│
├── 👥 User Management (Module 1)
│   ├── User Directory
│   ├── Provision User (Admin only)
│   └── Role & Permission Matrix
│
└── ⚙️ Administration & Audit (Module 8)
    ├── Master System Settings
    ├── Immutable Audit Trail
    └── Data Correction Overrides
```

---

## 26. Dashboard Requirements (Operational Focus)
The dashboard provides zero vanity visuals; it serves as the live Command Center:
- **Critical Alert Ticker:** Highlights any high-severity exceptions created within the last 60 minutes.
- **Session Progress Gauge:** Real-time completion percentage of the active exam session.
- **Batch Processing Funnel:** `Received` (Count) -> `Scanned` (Count) -> `In QA` (Count) -> `Verified` (Count) -> `Exceptions` (Count).
- **Subject-wise Completion Breakdown:** Tabular grid showing Subject Code, Exam Date, Total Booklets, % Verified, Open Exceptions, and Actions.
- **Live Verification Operator Leaderboard:** Displays active operators, scripts verified today, and average inspection duration per script.

---

## 27. Reporting Requirements
All reports support filtering by Session, Date Range, Subject, Center Code, and Exception Type:
1. **Certified Session Completion Report:** Official signed document certifying 100% verification clearance for evaluation readiness.
2. **Missing Script & Discrepancy Docket:** Granular listing of all missing booklets with hall ticket numbers, center names, and investigation status.
3. **Department Handover Chain-of-Custody Manifest:** Printable receipt accompanying physical booklets transferred to the Controller of Examinations.
4. **Daily Operator Verification Audit:** Detailed metrics on scripts verified, anomalies discovered, and average handling time per operator.

---

## 28. Security Checklist
- [x] Public self-registration disabled in Supabase project configuration.
- [x] RLS enabled and strictly tested on all tables.
- [x] No `service_role` key stored in client-side code or bundled assets.
- [x] All admin user provisioning routed through secure Edge Functions.
- [x] Passwords hashed using bcrypt/argon2 via Supabase Auth.
- [x] Storage bucket private; image retrieval governed via short-lived signed URLs.
- [x] Inactivity timeout auto-locks client after 45 minutes of idle state.
- [x] Immutable audit logs with restricted `UPDATE`/`DELETE` permissions.
- [x] Input sanitization and parameterization against SQL injection.
- [x] All mutations authenticated against active session tokens.

---

## 29. Scalability Considerations
- **Data Volume Projection:** 100,000 scripts × 32 pages = 3.2 million page records per semester.
- **Database Partitioning Strategy:** Partition `script_pages` and `audit_logs` by `session_id` or range of `created_at` (quarterly/annually) when scale exceeds 10M records.
- **Storage Tiering:** Move scanned page images of archived sessions (older than 2 years) to cold cloud storage classes (e.g., Supabase S3 glacier/cold tier).
- **Connection Optimization:** Connection pooling enabled for high concurrency during peak verification shifts (50+ simultaneous verifiers).

---

## 30. 7-Day Implementation Plan

| Timeline | Module Focus | Scope & Deliverables | Verification Checkpoint |
| :--- | :--- | :--- | :--- |
| **Day 1** | **PRD & Architecture Setup** | Finalize PRD, complete database schema scripts, establish Supabase connection, setup RLS foundations, implement base layout & routing. | Schema applied; RLS functions compiled; base navigation functional. |
| **Day 2** | **Module 1: Auth & User Mgmt** | Login, password management, profile model, admin user creation workflow, role & permission governance, zero public signup. | Admin can create and activate users; non-admins cannot create users; forced password change works. |
| **Day 3** | **Module 2: Exam & Session Mgmt** | Session CRUD, Subject master with expected page counts, Exam date/center scheduler, session lifecycle states. | Sessions and subjects configured with validation rules; dates locked to active session. |
| **Day 4** | **Module 3: Receiving & Scanning** | Batch intake, CSV/JSON manifest import, storage file association, roll number mapping, duplicate collision detection. | 500-script batch ingested with page references; duplicate roll numbers blocked. |
| **Day 5** | **Module 4 & 5: Verification & Exceptions** | Verification canvas with zoom/pan/keyboard shortcuts, page status checking, exception logging, handover dockets to COE. | Operator completes full script verification; missing page triggers exception & handover docket. |
| **Day 6** | **Module 6 & 7: Dashboard & Reports** | Operational KPIs, batch pipeline funnel, Excel export engine, printable PDF custody dockets, operator throughput view. | Dashboard updates in real time; PDF and Excel dockets export accurately. |
| **Day 7** | **Module 8: Admin, Audit & Hardening** | Immutable audit log viewer, master system settings, RLS security audit, load testing, production deployment on Vercel. | End-to-end rehearsal; zero RLS leaks; build passing clean. |

---

## Status Notice
**PRD & Technical Architecture complete.**  
*Execution is halted per instruction. Implementation will begin with Module 1 upon explicit user prompt.*
