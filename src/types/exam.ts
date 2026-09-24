// ==============================================================================
// Exam Scanning & Script Verification Operational Types (Modules 1 - 8)
// Real operational interfaces for Examination and Scanning Staff
// Module 2: Session Management
// ==============================================================================

export type SessionType = 'FN' | 'AN' | 'FULL_DAY';
export type ExamType = 'Regular' | 'Supplementary' | 'Revaluation';

export type SessionStatus =
  | 'Draft'
  | 'Ready'
  | 'Scanning'
  | 'Verification'
  | 'Completed'
  | 'Archived';

export type SessionShift = 'Morning' | 'Afternoon' | 'FN' | 'AN' | 'Evening';

export interface SessionEntity {
  id: string;
  session_code: string; // Unique, e.g. "SES-20260924-0001" or "SEP2026_FN"
  exam_name: string;
  exam_code: string;
  exam_date: string; // YYYY-MM-DD
  subject: string;
  shift: string;
  session_type?: string;
  university?: string;
  exam_type?: string;
  expected_script_count: number;
  received_scripts: number;
  scanned_scripts: number;
  verified_scripts: number;
  status: SessionStatus;
  description?: string;
  notes?: string;
  created_by?: string;
  creator_name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionPayload {
  session_code?: string;
  exam_name: string;
  exam_code: string;
  exam_date: string;
  subject: string;
  shift: string;
  university?: string;
  exam_type?: string;
  expected_script_count: number;
  description?: string;
  notes?: string;
}

export interface UpdateSessionPayload {
  exam_name?: string;
  exam_code?: string;
  exam_date?: string;
  subject?: string;
  shift?: string;
  university?: string;
  exam_type?: string;
  expected_script_count?: number;
  description?: string;
  notes?: string;
}

// Legacy / Bridge compatibility interface for Module 1 dashboard & inward
export interface ExamSession {
  id: string;
  session_id: string;
  exam_date: string;
  session_type: SessionType;
  university: string;
  exam_type: ExamType;
  remarks?: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  created_at: string;
  created_by?: string;
}

export interface InwardSchedule {
  id: string;
  session_id: string;
  scheduled_id: string; // e.g. "SCH10245" or "1211"
  school_id?: string;   // e.g. "1211" - STRICT REQUIREMENT: Stored separately from class_id
  class_id: string;     // e.g. "1211" or "EEE-A" - STRICT REQUIREMENT: Stored separately from school_id
  university?: string;
  exam_type?: string;
  room_number: string;  // e.g. "A201"
  subject: string;      // e.g. "Power Systems"
  expected_scripts: number;
  number_of_bundles: number;
  received_by: string;
  received_time: string; // HH:MM AM/PM
  created_at: string;
  is_completed?: boolean;
  completed_at?: string;
}

export type ScanStatus = 'VALID' | 'DUPLICATE' | 'UNKNOWN' | 'DAMAGED' | 'MISSING';

export interface ScannedScript {
  id: string;
  inward_id?: string;
  scheduled_id: string;
  school_id?: string;   // Stored separately from class_id
  class_id: string;     // Stored separately from school_id
  university?: string;
  student_id: string;
  barcode?: string;
  room_number: string;
  subject: string;
  status: ScanStatus;
  scanned_at: string;
  scanned_by: string;
  synced_to_supabase?: boolean;
}

export interface OperationalMetrics {
  totalScheduled: number;
  expectedScripts: number;
  scannedScripts: number;
  missingScripts: number;
  duplicateScripts: number;
  unknownScripts: number;
  completionRate: number;
}
