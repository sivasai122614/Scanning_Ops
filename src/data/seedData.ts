// ==============================================================================
// Pre-seeded Operational Masters & Personas (Module 1 - Auth & RBAC)
// ==============================================================================

import { Role, Permission } from '../types/auth';

export const SYSTEM_ROLES: Role[] = [
  {
    id: 'role-01-super-admin',
    code: 'super_admin',
    name: 'Super Administrator',
    description: 'Complete institutional authority, configuration and security governance.',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-02-admin',
    code: 'admin',
    name: 'Administrator',
    description: 'Operations administrator managing sessions, subjects, and operational staff.',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-03-supervisor',
    code: 'supervisor',
    name: 'Valuation Supervisor',
    description: 'Supervises batch allocation, queues, and resolves verification exceptions.',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-04-scanner-operator',
    code: 'scanner_operator',
    name: 'Scanner Operator',
    description: 'Physical batch intake, scanner manifest upload, and image ingestion.',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-05-verification-operator',
    code: 'verification_operator',
    name: 'Verification Operator',
    description: 'High-speed booklet QA, barcode confirmation, and page verification.',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-06-coe-user',
    code: 'coe_user',
    name: 'COE / Exam Cell User',
    description: 'Exam cell officer managing custody transfers and physical dockets.',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-07-viewer',
    code: 'viewer',
    name: 'Auditor / Read-Only Viewer',
    description: 'Read-only observer for regulatory compliance and audit logs.',
    is_system: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

export const SYSTEM_PERMISSIONS: Permission[] = [
  // User Governance
  { id: 'p-01', code: 'users:create', module: 'User Governance', description: 'Provision new operational user accounts', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-02', code: 'users:read', module: 'User Governance', description: 'View staff registry, roles and profiles', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-03', code: 'users:update', module: 'User Governance', description: 'Update user profiles and details', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-04', code: 'users:activate', module: 'User Governance', description: 'Activate suspended or newly created accounts', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-05', code: 'users:deactivate', module: 'User Governance', description: 'Deactivate or suspend user accounts', created_at: '2026-01-01T00:00:00Z' },

  // Session & Subject
  { id: 'p-06', code: 'sessions:create', module: 'Session & Subject', description: 'Create new examination sessions', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-07', code: 'sessions:read', module: 'Session & Subject', description: 'Read examination sessions', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-08', code: 'sessions:update', module: 'Session & Subject', description: 'Update session configuration and status', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-09', code: 'sessions:close', module: 'Session & Subject', description: 'Freeze or close examination session', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-10', code: 'subjects:create', module: 'Session & Subject', description: 'Register examination subjects', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-11', code: 'subjects:read', module: 'Session & Subject', description: 'View examination subjects', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-12', code: 'subjects:update', module: 'Session & Subject', description: 'Update examination subject parameters', created_at: '2026-01-01T00:00:00Z' },

  // Batch & Ingestion
  { id: 'p-13', code: 'batches:create', module: 'Batch & Ingestion', description: 'Register physical batch intake', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-14', code: 'batches:read', module: 'Batch & Ingestion', description: 'View batch intake registry', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-15', code: 'batches:update', module: 'Batch & Ingestion', description: 'Update batch attributes and metadata', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-16', code: 'batches:receive', module: 'Batch & Ingestion', description: 'Sign off physical batch receipt', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-17', code: 'scripts:import', module: 'Batch & Ingestion', description: 'Import script manifests and scanned pages', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-18', code: 'scripts:delete_draft', module: 'Batch & Ingestion', description: 'Delete draft uncommitted batches', created_at: '2026-01-01T00:00:00Z' },

  // Verification
  { id: 'p-19', code: 'scripts:read', module: 'Verification', description: 'Read answer script records', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-20', code: 'scripts:update', module: 'Verification', description: 'Update script status and metadata', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-21', code: 'scripts:verify', module: 'Verification', description: 'Mark answer scripts as verified', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-22', code: 'scripts:flag_exception', module: 'Verification', description: 'Flag damaged or missing pages', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-23', code: 'scripts:reopen', module: 'Verification', description: 'Reopen verified scripts for re-inspection', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-24', code: 'pages:read', module: 'Verification', description: 'Read script page images', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-25', code: 'pages:verify', module: 'Verification', description: 'Verify individual page continuity', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-26', code: 'pages:flag_damaged', module: 'Verification', description: 'Flag torn or unreadable pages', created_at: '2026-01-01T00:00:00Z' },

  // Exceptions & Handover
  { id: 'p-27', code: 'exceptions:create', module: 'Exceptions & Handover', description: 'Create missing booklet or page discrepancy', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-28', code: 'exceptions:read', module: 'Exceptions & Handover', description: 'View exception registry', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-29', code: 'exceptions:resolve', module: 'Exceptions & Handover', description: 'Resolve exception with corrective action', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-30', code: 'exceptions:escalate', module: 'Exceptions & Handover', description: 'Escalate exception to COE', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-31', code: 'handovers:create', module: 'Exceptions & Handover', description: 'Create departmental handover docket', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-32', code: 'handovers:receive', module: 'Exceptions & Handover', description: 'Acknowledge receipt of physical booklets', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-33', code: 'handovers:return', module: 'Exceptions & Handover', description: 'Acknowledge return of physical booklets', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-34', code: 'handovers:read', module: 'Exceptions & Handover', description: 'View handover dockets', created_at: '2026-01-01T00:00:00Z' },

  // Reports & Oversight
  { id: 'p-35', code: 'reports:read', module: 'Reports & Oversight', description: 'View operational reports', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-36', code: 'reports:export_excel', module: 'Reports & Oversight', description: 'Export reports to Excel format', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-37', code: 'reports:export_pdf', module: 'Reports & Oversight', description: 'Generate certified PDF dockets', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-38', code: 'audit:read', module: 'Reports & Oversight', description: 'Inspect immutable audit trail', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-39', code: 'settings:read', module: 'Reports & Oversight', description: 'Read system settings', created_at: '2026-01-01T00:00:00Z' },
  { id: 'p-40', code: 'settings:update', module: 'Reports & Oversight', description: 'Modify system settings', created_at: '2026-01-01T00:00:00Z' },
];

export const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  super_admin: SYSTEM_PERMISSIONS.map(p => p.code),
  admin: SYSTEM_PERMISSIONS.filter(p => p.code !== 'settings:update').map(p => p.code),
  supervisor: [
    'users:read', 'sessions:read', 'subjects:read', 'batches:read', 'batches:update', 'batches:receive',
    'scripts:read', 'scripts:update', 'scripts:verify', 'scripts:flag_exception', 'scripts:reopen',
    'pages:read', 'pages:verify', 'pages:flag_damaged',
    'exceptions:create', 'exceptions:read', 'exceptions:resolve', 'exceptions:escalate',
    'handovers:create', 'handovers:receive', 'handovers:return', 'handovers:read',
    'reports:read', 'reports:export_excel', 'reports:export_pdf', 'audit:read'
  ],
  scanner_operator: [
    'sessions:read', 'subjects:read', 'batches:create', 'batches:read', 'batches:update',
    'scripts:import', 'scripts:read', 'pages:read', 'exceptions:create', 'exceptions:read'
  ],
  verification_operator: [
    'sessions:read', 'subjects:read', 'batches:read',
    'scripts:read', 'scripts:verify', 'scripts:flag_exception',
    'pages:read', 'pages:verify', 'pages:flag_damaged',
    'exceptions:create', 'exceptions:read'
  ],
  coe_user: [
    'sessions:read', 'subjects:read', 'batches:read', 'scripts:read',
    'exceptions:create', 'exceptions:read', 'exceptions:resolve',
    'handovers:create', 'handovers:receive', 'handovers:return', 'handovers:read',
    'reports:read', 'reports:export_excel', 'reports:export_pdf'
  ],
  viewer: [
    'users:read', 'sessions:read', 'subjects:read', 'batches:read', 'scripts:read',
    'pages:read', 'exceptions:read', 'handovers:read', 'reports:read', 'audit:read', 'settings:read'
  ],
};
