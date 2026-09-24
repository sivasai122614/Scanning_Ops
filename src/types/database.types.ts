// ==============================================================================
// Complete TypeScript Definitions for Production Supabase Database Schema
// Matches PostgreSQL Schema: /supabase/migrations/20260924000003_complete_production_schema.sql
// ==============================================================================

export type RoleCode =
  | 'super_admin'
  | 'admin'
  | 'supervisor'
  | 'scanner_operator'
  | 'verification_operator'
  | 'coe_user'
  | 'viewer';

export type CenterType = 'EXAM_CENTER' | 'VALUATION_CENTER' | 'STORAGE_FACILITY' | 'COE_OFFICE';

export type ExamSessionStatus = 'open' | 'active' | 'scanning' | 'verification' | 'completed' | 'closed';

export type ScanningSessionStatus = 'open' | 'scanning' | 'completed' | 'closed';

export type UploadBatchStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

export type ScriptVerificationStatus = 'pending' | 'verified' | 'rejected' | 'exception_flagged';

export type ScriptStatus =
  | 'received'
  | 'uploaded'
  | 'verification_pending'
  | 'verified'
  | 'missing_pages'
  | 'missing_script'
  | 'damaged'
  | 'sent_to_coe'
  | 'completed';

export type PageUploadStatus = 'uploaded' | 'verified' | 'error' | 'replaced';

export type MissingScriptStatus =
  | 'reported'
  | 'under_investigation'
  | 'located'
  | 'confirmed_absent'
  | 'resolved'
  | 'closed';

export type DamageType =
  | 'torn_pages'
  | 'unreadable_barcode'
  | 'water_ink_damage'
  | 'missing_sheet'
  | 'misbound'
  | 'other';

export type DamagedScriptStatus =
  | 'reported'
  | 'under_review'
  | 'repaired'
  | 'rescanned'
  | 'resolved'
  | 'cancelled';

export type MovementType =
  | 'intake_to_scanning'
  | 'scanning_to_verification'
  | 'verification_to_coe'
  | 'coe_to_valuation'
  | 'valuation_to_record_room'
  | 'return_transfer';

export type AttendanceStatus = 'present' | 'absent' | 'malpractice' | 'unknown';

export type NotificationType = 'info' | 'alert' | 'warning' | 'action_required' | 'system';

// Entity Interfaces

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface Center {
  id: string;
  code: string;
  name: string;
  center_type: CenterType;
  address: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string; // References auth.users(id)
  full_name: string;
  email: string;
  employee_id: string | null;
  role_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined relations
  role?: Role;
}

export interface ExamSession {
  id: string;
  session_code: string;
  school_id: string | null; // Stored separately from class_id
  class_id: string | null;  // Stored separately from school_id
  class_code: string | null;
  exam_name: string;
  exam_date: string;
  subject_name: string;
  subject_code: string | null;
  shift: string | null;
  expected_script_count: number;
  status: ExamSessionStatus;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScanningSession {
  id: string;
  exam_session_id: string;
  center_id: string;
  scanner_user_id: string;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  total_received: number;
  total_scanned: number;
  total_verified: number;
  status: ScanningSessionStatus;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadBatch {
  id: string;
  scanning_session_id: string;
  uploaded_by: string;
  batch_number: string;
  file_count: number;
  script_count: number;
  page_count: number;
  status: UploadBatchStatus;
  started_at: string | null;
  completed_at: string | null;
  error_count: number;
  error_details: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Script {
  id: string;
  exam_session_id: string;
  center_id: string;
  school_id: string | null; // Stored separately from class_id
  class_id: string | null;  // Stored separately from school_id
  scanning_session_id: string | null;
  script_number: string;
  barcode: string;
  student_identifier: string;
  page_count: number;
  expected_pages: number;
  received_at: string;
  uploaded_at: string | null;
  verified_at: string | null;
  verification_status: ScriptVerificationStatus;
  script_status: ScriptStatus;
  current_location: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScriptPage {
  id: string;
  script_id: string;
  page_number: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  checksum: string | null;
  upload_status: PageUploadStatus;
  uploaded_at: string;
  created_at: string;
}

export interface ScriptVerification {
  id: string;
  script_id: string;
  verified_by: string;
  verification_status: ScriptVerificationStatus;
  page_count_found: number | null;
  expected_page_count: number | null;
  remarks: string | null;
  verified_at: string;
  created_at: string;
}

export interface MissingScript {
  id: string;
  exam_session_id: string;
  center_id: string;
  script_number: string | null;
  barcode: string | null;
  reason: string | null;
  status: MissingScriptStatus;
  reported_by: string;
  resolved_by: string | null;
  resolved_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface DamagedScript {
  id: string;
  script_id: string;
  damage_type: DamageType;
  description: string;
  reported_by: string;
  status: DamagedScriptStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScriptMovement {
  id: string;
  script_id: string;
  from_location: string;
  to_location: string;
  moved_by: string;
  movement_type: MovementType;
  remarks: string | null;
  moved_at: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  exam_session_id: string;
  center_id: string;
  student_identifier: string;
  attendance_status: AttendanceStatus;
  attendance_date: string;
  source_file: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: NotificationType;
  is_read: boolean;
  related_table: string | null;
  related_record_id: string | null;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: Record<string, unknown>;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}
