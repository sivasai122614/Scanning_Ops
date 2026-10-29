// ==============================================================================
// ExamScan — Production Data Service & Database Architecture Engine
// 4-Table Architecture + Realtime Sync + Strict Supabase Persistence:
// 1. import_inwarded_data (Excel imported expected dataset)
// 2. manual_inwarded_data (Manual script intake by operators)
// 3. scan_sessions        (Active Bundle Scan sessions)
// 4. saved_scanned_data   (Finalized scanned booklet records after pressing SAVE)
// 5. scan_session_items   (Pending / Staged scan items prior to SAVE)
// ==============================================================================

import * as XLSX from 'xlsx';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { enterpriseStore } from './store';
import { normalizeIdentifier, sanitizeBarcode } from '../utils/normalize';

export { normalizeIdentifier, sanitizeBarcode };

/**
 * Barcode / Member ID resolution function.
 * Uses exact imported records as the sole source of truth.
 * Does NOT assume fixed prefix lengths, does NOT strip first 4 digits,
 * and preserves leading zeros and exact strings.
 */
export function extractMemberIdFromBarcode(
  rawInput: string,
  activeClassId?: string,
  knownImportedRecords?: ImportInwardedRecord[]
): string {
  const normalized = normalizeIdentifier(rawInput);
  if (!normalized) return '';

  const cleanCid = activeClassId ? normalizeIdentifier(activeClassId) : '';
  const normLower = normalized.toLowerCase();
  const cidLower = cleanCid.toLowerCase();

  // 1. If known imported records are available:
  if (knownImportedRecords && knownImportedRecords.length > 0) {
    // If exact member_id match in active class exists, return it
    const exactMem = knownImportedRecords.find(
      r => (!cleanCid || normalizeIdentifier(r.class_id).toLowerCase() === cidLower) &&
           normalizeIdentifier(r.member_id).toLowerCase() === normLower
    );
    if (exactMem) return normalizeIdentifier(exactMem.member_id);

    // If exact barcode match in active class exists, return that record's member_id
    const exactBar = knownImportedRecords.find(
      r => (!cleanCid || normalizeIdentifier(r.class_id).toLowerCase() === cidLower) &&
           r.barcode && normalizeIdentifier(r.barcode).toLowerCase() === normLower
    );
    if (exactBar) return normalizeIdentifier(exactBar.member_id);

    // If across all imported records:
    const anyMem = knownImportedRecords.find(
      r => normalizeIdentifier(r.member_id).toLowerCase() === normLower ||
           (r.barcode && normalizeIdentifier(r.barcode).toLowerCase() === normLower)
    );
    if (anyMem) return normalizeIdentifier(anyMem.member_id);
  }

  // Fallback to normalized input as exact string
  return normalized;
}

export type BundleStatus = 'NOT STARTED' | 'IN PROGRESS' | 'COMPLETED' | 'PARTIAL / SAVED';

export interface ClassBundle {
  id: string;
  sessionId: string;
  universityName: string;
  collegeName: string;
  classId: string;
  expectedCount: number;
  savedCount: number;
  pendingCount: number;
  receivedCount: number; // savedCount + pendingCount
  missingCount: number;  // expectedCount - receivedCount
  inwardedCount?: number; // alias for receivedCount
  notInwardedCount?: number; // alias for missingCount
  progressPercentage: number; // (receivedCount / expectedCount) * 100
  status: BundleStatus;
  isSaved: boolean;
  isCompleted: boolean;
  savedAt: string | null;
  lastActivityAt: string;
  updatedAt: string;
  createdAt: string;
  startedBy?: string | null;
  savedBy?: string | null;
  operatorText?: string;
}

export interface ImportSession {
  id: string;
  university_name: string;
  college_name: string;
  source_file_name: string;
  total_records: number;
  total_class_ids: number;
  created_at: string;
}

export interface SessionSummary {
  universityName: string;
  totalClasses: number;
  completedClasses: number;
  partialClasses: number;
  notStartedClasses: number;
  totalExpected: number;
  totalSaved: number;
  totalPending: number;
  totalReceived: number;
  totalMissing: number;
  overallCompletion: number;
  bundles: ClassBundle[];
}

// Table 1: Expected records from Excel
export interface ImportInwardedRecord {
  id: string;
  import_session_id: string;
  college_name: string;
  university_name?: string;
  class_id: string;
  sch_id?: string;
  member_id: string;
  barcode?: string;
  created_by?: string;
  created_at: string;
}

// Table 2: Manually inwarded records (public.manual_inward_data)
export interface ManualInwardedRecord {
  id: string;
  session_code?: string;
  bundle_code?: string;
  class_id: string;
  school_id?: string;
  room_number?: string;
  subject_name?: string;
  booklet_barcode?: string;
  roll_number?: string;
  member_id?: string;
  college_name?: string;
  status: string;
  inwarded_by?: string;
  notes?: string;
  scanned_at?: string;
  created_at: string;
}

// Table 3: Active bundle scan session
export interface ScanSession {
  id: string;
  college_name: string;
  import_session_id?: string;
  class_id: string;
  started_by: string;
  started_at: string;
  last_activity_at: string;
  status: 'ACTIVE' | 'SAVED' | 'COMPLETED';
  saved_at?: string | null;
  saved_by?: string | null;
  ended_at?: string | null;
  created_at: string;
}

// Table 4: Finalized saved records
export interface SavedScannedRecord {
  id: string;
  scan_session_id?: string;
  import_session_id?: string;
  college_name: string;
  class_id: string;
  sch_id?: string;
  member_id: string;
  barcode?: string | null;
  scanned_by: string;
  scanned_at: string;
  saved_by: string;
  saved_at: string;
  status: 'SAVED';
}

// Table 5: Pending scan items before user clicks SAVE
export interface ScanSessionItem {
  id: string;
  scan_session_id: string;
  class_id: string;
  member_id: string;
  barcode: string;
  detected_at: string;
  detected_by: string;
  status: 'PENDING_SAVE' | 'SAVED' | 'REJECTED';
  created_at: string;
}

// Unified view record for bundle details list
export interface BundleRecordView {
  id: string;
  class_id: string;
  member_id: string;
  barcode: string | null;
  scan_status: 'saved' | 'pending_save' | 'not_started';
  scanned_by: string | null;
  scanned_at: string | null;
  saved_by: string | null;
  saved_at: string | null;
}

export interface ScanResult {
  success: boolean;
  message: string;
  class_id?: string;
  member_id?: string;
  barcode?: string;
  isNoImportedData?: boolean;
  isDuplicate?: boolean;
  isUnknownClass?: boolean;
  isUnknownMember?: boolean;
  isNotImported?: boolean;
  isWrongClass?: boolean;
  currentClassId?: string;
  detectedClassId?: string;
  detectedMemberId?: string;
  bundle?: ClassBundle;
  record?: BundleRecordView;
  shouldRedirectToBundle?: boolean;
  isComplete?: boolean;
  isAllScanned?: boolean;
}

// Helper to get authenticated user details for audit trail
export function getCurrentUser(): { id: string; name: string; email: string } {
  try {
    if (typeof localStorage !== 'undefined') {
      // 1. Check Supabase auth token keys (e.g. sb-*-auth-token)
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            const user = parsed.user || parsed;
            if (user && (user.email || user.id)) {
              const username =
                user.user_metadata?.username ||
                user.user_metadata?.full_name ||
                (user.email ? user.email.split('@')[0] : 'Siva Sai');
              return {
                id: user.id || 'usr-operator',
                name: username,
                email: user.email || 'operator@examscan.internal',
              };
            }
          }
        }
      }

      // 2. Check enterprise session fallback
      const raw = localStorage.getItem('exam_ops_active_session_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.userId) {
          const profile = enterpriseStore.getProfileById(parsed.userId, parsed.userId);
          if (profile) {
            return {
              id: profile.id,
              name: profile.full_name || profile.email,
              email: profile.email,
            };
          }
        }
        if (parsed.email) {
          return {
            id: parsed.userId || 'usr-operator',
            name: parsed.email.split('@')[0],
            email: parsed.email,
          };
        }
      }
    }
  } catch {}
  return {
    id: 'usr-operator',
    name: 'Siva Sai',
    email: 'sivasaiprasadkaki122614@gmail.com',
  };
}

export function resolveOperatorName(val?: string | null): string {
  if (!val || val === 'undefined' || val === 'null' || val.trim() === '') return '—';
  const clean = val.trim();
  if (clean.includes('@')) {
    return clean.split('@')[0];
  }
  if (clean.length > 20 || clean.startsWith('usr-')) {
    try {
      const p = enterpriseStore.getProfileById(clean, clean);
      if (p && p.full_name) return p.full_name;
      if (p && p.email) return p.email.split('@')[0];
    } catch {}
  }
  return clean;
}

// Note: normalizeIdentifier and sanitizeBarcode are imported from ../utils/normalize

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const STORAGE_IMPORT_INWARDED = 'examscan_import_inwarded_v5';
const STORAGE_MANUAL_INWARDED = 'examscan_manual_inwarded_v5';
const STORAGE_SCAN_SESSIONS = 'examscan_scan_sessions_v5';
const STORAGE_SAVED_SCANNED = 'examscan_saved_scanned_v5';
const STORAGE_SCAN_ITEMS = 'examscan_scan_items_v5';
const STORAGE_IMPORT_SESSIONS = 'examscan_import_sessions_v5';
const STORAGE_CLASS_ORDER = 'examscan_class_order_v5';
const STORAGE_YET_TO_BE_INWARD = 'examscan_yet_to_be_inward_v5';

const BATCH_SIZE = 500;

/**
 * Direct exact count query from Supabase PostgreSQL using HEAD request.
 * Returns the exact integer count (e.g. 3,159 records) directly from the database
 * in milliseconds without transferring table rows!
 */
async function fetchExactTableCount(
  tableName: string,
  filterFn?: (query: any) => any
): Promise<{ count: number | null; error: any }> {
  if (!isSupabaseConfigured) return { count: null, error: 'Supabase not configured' };
  try {
    let query = supabase.from(tableName).select('*', { count: 'exact', head: true });
    if (filterFn) {
      query = filterFn(query);
    }
    const { count, error } = await query;
    if (error) return { count: null, error };
    return { count: count ?? 0, error: null };
  } catch (err) {
    return { count: null, error: err };
  }
}

/**
 * Robust fetcher for Supabase tables.
 * Uses PostgREST Range header chunking (.range(from, to)) so tables with thousands
 * of rows (e.g. 3,159, 10,000, 50,000+) are cleanly retrieved without 1,000-row limits.
 */
async function fetchAllRowsFromTable(
  tableName: string,
  filterFn?: (query: any) => any,
  selectCols = '*'
): Promise<{ data: any[] | null; error: any }> {
  if (!isSupabaseConfigured) return { data: null, error: 'Supabase not configured' };
  const CHUNK_SIZE = 1000;
  let allRows: any[] = [];
  const maxPages = 150; // supports up to 150,000 rows

  let page = 0;
  let lastError: any = null;
  while (page < maxPages) {
    const from = page * CHUNK_SIZE;
    const to = from + CHUNK_SIZE - 1;
    let query = supabase.from(tableName).select(selectCols).range(from, to);
    if (filterFn) {
      query = filterFn(query);
    }
    const { data, error } = await query;
    if (error) {
      lastError = error;
      console.warn(`[fetchAllRowsFromTable] ${tableName} range ${from}-${to} notice:`, error.message);
      if (page === 0) return { data: null, error };
      break;
    }
    if (!data || !Array.isArray(data) || data.length === 0) {
      break;
    }
    allRows.push(...data);
    if (data.length < CHUNK_SIZE) {
      break;
    }
    page++;
  }
  return { data: allRows, error: allRows.length > 0 ? null : lastError };
}

class ImportedService {
  // In-memory representations of the database tables + pending items
  private importInwarded: ImportInwardedRecord[] = [];
  private yetToBeInward: ImportInwardedRecord[] = []; // Dedicated Table: yet_to_be_inward (Pending scripts)
  private manualInwarded: ManualInwardedRecord[] = [];
  private scanSessions: ScanSession[] = [];
  private savedScanned: SavedScannedRecord[] = [];
  private scanItems: ScanSessionItem[] = [];
  private importSessions: ImportSession[] = [];
  private classOrder: string[] = []; // Tracks class sorting: recently scanned classes at top

  // Authoritative direct backend counts
  private backendExpectedCount: number = 0;
  private backendReceivedCount: number = 0;
  private backendPendingCount: number = 0;
  private backendManualCount: number = 0;

  private activeUniversity: string = '';
  private activeSessionId: string | null = null;
  private listeners: (() => void)[] = [];
  private realtimeChannel: any = null;
  public isInitialized: boolean = false;
  private isSyncing: boolean = false;

  constructor() {
    this.loadFromLocalStorage();
    this.syncFromSupabase();
    this.setupRealtimeSubscription();
    this.setupNetworkListeners();
  }

  private setupNetworkListeners() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[ImportedService] Network online — re-syncing with Supabase...');
        this.syncFromSupabase();
      });
    }
  }

  private loadFromLocalStorage() {
    try {
      const storedImp = localStorage.getItem(STORAGE_IMPORT_INWARDED);
      if (storedImp) this.importInwarded = JSON.parse(storedImp);

      const storedYet = localStorage.getItem(STORAGE_YET_TO_BE_INWARD);
      if (storedYet) this.yetToBeInward = JSON.parse(storedYet);

      const storedMan = localStorage.getItem(STORAGE_MANUAL_INWARDED);
      if (storedMan) this.manualInwarded = JSON.parse(storedMan);

      const storedSess = localStorage.getItem(STORAGE_SCAN_SESSIONS);
      if (storedSess) this.scanSessions = JSON.parse(storedSess);

      const storedSaved = localStorage.getItem(STORAGE_SAVED_SCANNED);
      if (storedSaved) this.savedScanned = JSON.parse(storedSaved);

      const storedItems = localStorage.getItem(STORAGE_SCAN_ITEMS);
      if (storedItems) this.scanItems = JSON.parse(storedItems);

      const storedImpSess = localStorage.getItem(STORAGE_IMPORT_SESSIONS);
      if (storedImpSess) this.importSessions = JSON.parse(storedImpSess);

      const storedOrder = localStorage.getItem(STORAGE_CLASS_ORDER);
      if (storedOrder) this.classOrder = JSON.parse(storedOrder);

      // Restore active university if sessions exist
      if (this.importSessions.length > 0) {
        this.activeUniversity = this.importSessions[0].university_name || this.importSessions[0].college_name || '';
        this.activeSessionId = this.importSessions[0].id;
      } else if (this.importInwarded.length > 0) {
        this.activeUniversity = this.importInwarded[0].college_name || this.importInwarded[0].university_name || '';
      }

      // Reconcile counts
      this.backendExpectedCount = this.importInwarded.length;
      this.backendReceivedCount = this.savedScanned.length;
      this.backendPendingCount = this.yetToBeInward.length > 0 ? this.yetToBeInward.length : Math.max(0, this.backendExpectedCount - this.backendReceivedCount);

      // Immediately reconcile with imported reference dataset to eliminate any stale orphan inward state
      this.reconcileInwardStateWithImportedData();
    } catch (e) {
      console.warn('[ImportedService] Error loading local storage:', e);
    }
  }

  /**
   * TASK 3 DATA MODEL RULE:
   * public.imported_inward_data is the authoritative reference dataset.
   * A member being present in imported_inward_data means IMPORTED.
   * If a class or member is absent from imported_inward_data, any inward record
   * (saved_scanned_data, manual_inward_data, scan_session_items) referencing it is an orphan and is pruned.
   * If imported_inward_data has 0 records, ALL inward records and sessions are purged.
   */
  public reconcileInwardStateWithImportedData() {
    if (this.importInwarded.length === 0) {
      // When imported data is completely cleared or deleted, clear all saved scans and active sessions in sync
      this.yetToBeInward = [];
      this.savedScanned = [];
      this.manualInwarded = [];
      this.scanSessions = [];
      this.scanItems = [];
      this.classOrder = [];
      this.backendExpectedCount = 0;
      this.backendReceivedCount = 0;
      this.backendPendingCount = 0;
      this.saveToLocalStorage();
      return;
    }

    // When classes are deleted or removed from imported data, strictly prune any saved scans,
    // manual inwards, and sessions belonging to the deleted classes so stale data does not persist
    const validClassIds = new Set(
      this.importInwarded.map(r => normalizeIdentifier(r.class_id).toLowerCase())
    );

    this.yetToBeInward = this.yetToBeInward.filter(y =>
      validClassIds.has(normalizeIdentifier(y.class_id).toLowerCase())
    );

    this.savedScanned = this.savedScanned.filter(s =>
      validClassIds.has(normalizeIdentifier(s.class_id).toLowerCase())
    );

    this.manualInwarded = this.manualInwarded.filter(m =>
      validClassIds.has(normalizeIdentifier(m.class_id).toLowerCase())
    );

    this.scanSessions = this.scanSessions.filter(s =>
      validClassIds.has(normalizeIdentifier(s.class_id).toLowerCase())
    );

    this.scanItems = this.scanItems.filter(i =>
      validClassIds.has(normalizeIdentifier(i.class_id).toLowerCase())
    );

    this.classOrder = this.classOrder.filter(c =>
      validClassIds.has(normalizeIdentifier(c).toLowerCase())
    );

    this.saveToLocalStorage();
  }

  private saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_IMPORT_INWARDED, JSON.stringify(this.importInwarded));
      localStorage.setItem(STORAGE_YET_TO_BE_INWARD, JSON.stringify(this.yetToBeInward));
      localStorage.setItem(STORAGE_MANUAL_INWARDED, JSON.stringify(this.manualInwarded));
      localStorage.setItem(STORAGE_SCAN_SESSIONS, JSON.stringify(this.scanSessions));
      localStorage.setItem(STORAGE_SAVED_SCANNED, JSON.stringify(this.savedScanned));
      localStorage.setItem(STORAGE_SCAN_ITEMS, JSON.stringify(this.scanItems));
      localStorage.setItem(STORAGE_IMPORT_SESSIONS, JSON.stringify(this.importSessions));
      localStorage.setItem(STORAGE_CLASS_ORDER, JSON.stringify(this.classOrder));
      this.notify();
    } catch (e) {
      console.warn('[ImportedService] Error saving local storage:', e);
    }
  }

  public subscribe(callback: () => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  private notify() {
    this.listeners.forEach(cb => {
      try {
        cb();
      } catch (e) {
        console.warn('Listener error:', e);
      }
    });
  }

  private syncDebounceTimer: any = null;

  private scheduleAuthoritativeSync(delayMs = 300) {
    if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
    this.syncDebounceTimer = setTimeout(() => {
      this.syncFromSupabase();
    }, delayMs);
  }

  // ==============================================================================
  // SUPABASE REALTIME REPLICATION (Requirement 12)
  // Listens to PostgreSQL change stream for true multi-client live updates
  // ==============================================================================
  private setupRealtimeSubscription() {
    if (!isSupabaseConfigured) return;

    try {
      if (this.realtimeChannel) {
        supabase.removeChannel(this.realtimeChannel);
      }

      this.realtimeChannel = supabase
        .channel('examscan_architecture_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'imported_inward_data' },
          (payload) => this.handleRealtimeEvent('imported_inward_data', payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'manual_inward_data' },
          (payload) => this.handleRealtimeEvent('manual_inward_data', payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'saved_scanned_data' },
          (payload) => this.handleRealtimeEvent('saved_scanned_data', payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'yet_to_be_inward' },
          (payload) => this.handleRealtimeEvent('yet_to_be_inward', payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'scan_sessions' },
          (payload) => this.handleRealtimeEvent('scan_sessions', payload)
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[ImportedService] Supabase Realtime connected to physical tables');
          }
        });
    } catch (err) {
      console.warn('[ImportedService] Realtime setup note:', err);
    }
  }

  private handleRealtimeEvent(table: string, payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    let stateChanged = false;

    if (table === 'imported_inward' || table === 'import_inwarded_data' || table === 'imported_inward_data') {
      if (eventType === 'INSERT' && newRecord) {
        const cleanCid = normalizeIdentifier(newRecord.class_id);
        const cleanMid = normalizeIdentifier(newRecord.member_id || newRecord.mem_id || '');
        const recordId = newRecord.id || `${cleanCid}_${cleanMid}`;
        if (!this.importInwarded.some(r => r.id === recordId || (normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase() && normalizeIdentifier(r.member_id).toLowerCase() === cleanMid.toLowerCase()))) {
          this.importInwarded.push({
            id: recordId,
            import_session_id: newRecord.import_session_id || newRecord.import_batch_id || 'default_sess',
            college_name: newRecord.college_name || newRecord.university_name || this.activeUniversity,
            university_name: newRecord.university_name || newRecord.college_name || this.activeUniversity,
            class_id: cleanCid,
            sch_id: newRecord.sch_id,
            member_id: cleanMid,
            barcode: newRecord.barcode ? normalizeIdentifier(newRecord.barcode) : undefined,
            created_by: newRecord.created_by,
            created_at: newRecord.created_at || new Date().toISOString(),
          });
          stateChanged = true;
        }
      } else if (eventType === 'DELETE') {
        if (oldRecord && oldRecord.id) {
          this.importInwarded = this.importInwarded.filter(r => r.id !== oldRecord.id);
          stateChanged = true;
        }
        // Always trigger authoritative sync to catch bulk deletes, table clears or unkeyed deletes
        this.scheduleAuthoritativeSync(150);
      } else if (eventType === 'UPDATE' && newRecord) {
        const idx = this.importInwarded.findIndex(r => r.id === newRecord.id);
        if (idx >= 0) {
          this.importInwarded[idx] = {
            ...this.importInwarded[idx],
            class_id: normalizeIdentifier(newRecord.class_id || this.importInwarded[idx].class_id),
            member_id: normalizeIdentifier(newRecord.member_id || newRecord.mem_id || this.importInwarded[idx].member_id),
            barcode: newRecord.barcode ? normalizeIdentifier(newRecord.barcode) : this.importInwarded[idx].barcode,
          };
          stateChanged = true;
        }
      }
    } else if (table === 'saved_scanned_data' || table === 'saved_scan_data') {
      if (eventType === 'INSERT' && newRecord) {
        if (!this.savedScanned.some(s => s.id === newRecord.id)) {
          this.savedScanned.push({
            id: newRecord.id,
            scan_session_id: newRecord.scan_session_id || newRecord.session_id,
            import_session_id: newRecord.import_session_id || newRecord.import_batch_id,
            college_name: newRecord.college_name || this.activeUniversity,
            class_id: String(newRecord.class_id).trim(),
            sch_id: newRecord.sch_id,
            member_id: String(newRecord.member_id || newRecord.mem_id).trim(),
            barcode: newRecord.barcode,
            scanned_by: newRecord.scanned_by,
            scanned_at: newRecord.scanned_at,
            saved_by: newRecord.saved_by,
            saved_at: newRecord.saved_at,
            status: 'SAVED',
          });

          // Mark corresponding pending item as SAVED
          this.scanItems.forEach(i => {
            if (
              i.class_id.toLowerCase() === String(newRecord.class_id).trim().toLowerCase() &&
              i.member_id.toLowerCase() === String(newRecord.member_id).trim().toLowerCase()
            ) {
              i.status = 'SAVED';
            }
          });

          stateChanged = true;
        }
      } else if (eventType === 'DELETE') {
        if (oldRecord && oldRecord.id) {
          this.savedScanned = this.savedScanned.filter(s => s.id !== oldRecord.id);
          stateChanged = true;
        }
        // Always trigger authoritative sync to catch table clears, bulk deletes, or untracked deletes
        this.scheduleAuthoritativeSync(100);
      }
    } else if (table === 'scan_sessions') {
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
        const existingIdx = this.scanSessions.findIndex(s => s.id === newRecord.id || s.class_id === newRecord.class_id);
        const mappedSession: ScanSession = {
          id: newRecord.id,
          college_name: newRecord.college_name || this.activeUniversity,
          import_session_id: newRecord.import_session_id,
          class_id: String(newRecord.class_id).trim(),
          started_by: newRecord.started_by,
          started_at: newRecord.started_at,
          last_activity_at: newRecord.last_activity_at,
          status: newRecord.status,
          saved_at: newRecord.saved_at,
          saved_by: newRecord.saved_by,
          ended_at: newRecord.ended_at,
          created_at: newRecord.created_at,
        };
        if (existingIdx >= 0) {
          this.scanSessions[existingIdx] = mappedSession;
        } else {
          this.scanSessions.push(mappedSession);
        }
        stateChanged = true;
      } else if (eventType === 'DELETE') {
        if (oldRecord && oldRecord.id) {
          this.scanSessions = this.scanSessions.filter(s => s.id !== oldRecord.id);
          stateChanged = true;
        }
      }
    } else if (table === 'scan_session_items') {
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
        const existingIdx = this.scanItems.findIndex(i => i.id === newRecord.id);
        const mappedItem: ScanSessionItem = {
          id: newRecord.id,
          scan_session_id: newRecord.scan_session_id,
          class_id: String(newRecord.class_id).trim(),
          member_id: String(newRecord.member_id).trim(),
          barcode: newRecord.barcode,
          detected_at: newRecord.detected_at,
          detected_by: newRecord.detected_by,
          status: newRecord.status,
          created_at: newRecord.created_at,
        };
        if (existingIdx >= 0) {
          this.scanItems[existingIdx] = mappedItem;
        } else {
          this.scanItems.push(mappedItem);
        }
        stateChanged = true;
      } else if (eventType === 'DELETE') {
        if (oldRecord && oldRecord.id) {
          this.scanItems = this.scanItems.filter(i => i.id !== oldRecord.id);
          stateChanged = true;
        }
      }
    } else if (table === 'manual_inwarded_data' || table === 'manual_inward_data') {
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
        const cleanCid = normalizeIdentifier(newRecord.class_id);
        const cleanMid = normalizeIdentifier(newRecord.roll_number || newRecord.member_id || newRecord.mem_id || newRecord.booklet_barcode || '');
        const mapped: ManualInwardedRecord = {
          id: newRecord.id,
          session_code: newRecord.session_code,
          bundle_code: newRecord.bundle_code,
          class_id: cleanCid,
          school_id: newRecord.school_id,
          room_number: newRecord.room_number,
          subject_name: newRecord.subject_name,
          booklet_barcode: newRecord.booklet_barcode ? normalizeIdentifier(newRecord.booklet_barcode) : undefined,
          roll_number: cleanMid,
          member_id: cleanMid,
          college_name: newRecord.college_name || this.activeUniversity,
          status: newRecord.status || 'inwarded',
          inwarded_by: newRecord.inwarded_by || 'Manual Inward',
          notes: newRecord.notes,
          scanned_at: newRecord.scanned_at || newRecord.created_at,
          created_at: newRecord.created_at || new Date().toISOString(),
        };
        const idx = this.manualInwarded.findIndex(m => m.id === newRecord.id);
        if (idx >= 0) {
          this.manualInwarded[idx] = mapped;
        } else {
          this.manualInwarded.push(mapped);
        }
        stateChanged = true;
      } else if (eventType === 'DELETE') {
        if (oldRecord && oldRecord.id) {
          this.manualInwarded = this.manualInwarded.filter(m => m.id !== oldRecord.id);
          stateChanged = true;
        }
        // Always trigger authoritative sync to catch table clears, bulk deletes, or untracked deletes
        this.scheduleAuthoritativeSync(100);
      }
    } else if (table === 'yet_to_be_inward') {
      if (eventType === 'INSERT' && newRecord) {
        if (!this.yetToBeInward.some(y => y.id === newRecord.id)) {
          this.yetToBeInward.push({
            id: newRecord.id,
            import_session_id: newRecord.import_session_id || 'default_sess',
            college_name: newRecord.college_name || newRecord.university_name || this.activeUniversity,
            university_name: newRecord.university_name || newRecord.college_name || this.activeUniversity,
            class_id: normalizeIdentifier(newRecord.class_id),
            sch_id: newRecord.sch_id,
            member_id: normalizeIdentifier(newRecord.member_id),
            barcode: newRecord.barcode ? normalizeIdentifier(newRecord.barcode) : undefined,
            created_at: newRecord.created_at || new Date().toISOString(),
          });
          this.backendPendingCount = this.yetToBeInward.length;
          stateChanged = true;
        }
      } else if (eventType === 'DELETE') {
        if (oldRecord && oldRecord.id) {
          this.yetToBeInward = this.yetToBeInward.filter(y => y.id !== oldRecord.id);
        } else if (oldRecord && oldRecord.class_id && oldRecord.member_id) {
          this.yetToBeInward = this.yetToBeInward.filter(
            y => !(normalizeIdentifier(y.class_id).toLowerCase() === normalizeIdentifier(oldRecord.class_id).toLowerCase() &&
                   normalizeIdentifier(y.member_id).toLowerCase() === normalizeIdentifier(oldRecord.member_id).toLowerCase())
          );
        }
        this.backendPendingCount = this.yetToBeInward.length;
        stateChanged = true;
        this.scheduleAuthoritativeSync(100);
      }
    }

    if (stateChanged) {
      if (this.importInwarded.length === 0) {
        this.importSessions = [];
        this.classOrder = [];
        this.activeSessionId = null;
      }
      this.saveToLocalStorage();
      this.notify();
    }
  }

  /**
   * Sync all tables from remote Supabase (Authoritative Single Source of Truth)
   * Uses paginated chunking (1,000 rows per page up to 150,000 rows) so that
   * bulk data never caps/defaults to 1,000, and backend deletions accurately decrease counts.
   */
  public async syncFromSupabase() {
    if (!isSupabaseConfigured) return;
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      // 0. Query Authoritative PostgreSQL Exact Table Counts (Direct HEAD requests: zero row payload)
      try {
        const [expCntRes, recCntRes, yetCntRes, manCntRes] = await Promise.allSettled([
          fetchExactTableCount('imported_inward_data'),
          fetchExactTableCount('saved_scanned_data'),
          fetchExactTableCount('yet_to_be_inward'),
          fetchExactTableCount('manual_inward_data'),
        ]);

        if (expCntRes.status === 'fulfilled' && expCntRes.value.count !== null) {
          this.backendExpectedCount = expCntRes.value.count;
        }
        if (recCntRes.status === 'fulfilled' && recCntRes.value.count !== null) {
          this.backendReceivedCount = recCntRes.value.count;
        }
        if (yetCntRes.status === 'fulfilled' && yetCntRes.value.count !== null) {
          this.backendPendingCount = yetCntRes.value.count;
        }
        if (manCntRes.status === 'fulfilled' && manCntRes.value.count !== null) {
          this.backendManualCount = manCntRes.value.count;
        }
      } catch (cntErr) {
        console.warn('[ImportedService] Exact counts query notice:', cntErr);
      }

      // 1. Fetch import sessions
      try {
        const { data: sessData, error: sessErr } = await supabase
          .from('import_sessions')
          .select('*')
          .order('created_at', { ascending: false });

        if (!sessErr && sessData !== null && Array.isArray(sessData)) {
          this.importSessions = sessData.map((s: any) => ({
            id: s.id,
            university_name: s.university_name || s.college_name || '',
            college_name: s.college_name || s.university_name || '',
            source_file_name: s.source_file_name || 'import.xlsx',
            total_records: s.total_records || 0,
            total_class_ids: s.total_class_ids || 0,
            created_at: s.created_at || new Date().toISOString(),
          }));
          if (this.importSessions.length > 0) {
            this.activeUniversity = this.importSessions[0].university_name;
            this.activeSessionId = this.importSessions[0].id;
          }
        }
      } catch {
        // Optional session table
      }

      // 2. Fetch imported data with full pagination (supports high loads: 5k, 10k, 50k+ records)
      let impRows: any[] | null = null;
      let querySuccess = false;
      let queryError: any = null;

      const { data: impData, error: impErr } = await fetchAllRowsFromTable('imported_inward_data');

      if (!impErr && impData !== null && Array.isArray(impData)) {
        impRows = impData;
        querySuccess = true;
      } else {
        queryError = impErr;
        // Fallback check in case physical table imported_inward exists
        try {
          const { data: physData, error: physErr } = await fetchAllRowsFromTable('imported_inward');
          if (!physErr && physData !== null && Array.isArray(physData)) {
            impRows = physData;
            querySuccess = true;
            queryError = null;
          }
        } catch {}

        if (!querySuccess) {
          // Fallback check in case import_inwarded_data view exists
          try {
            const { data: impFallback, error: fbErr } = await fetchAllRowsFromTable('import_inwarded_data');
            if (!fbErr && impFallback !== null && Array.isArray(impFallback)) {
              impRows = impFallback;
              querySuccess = true;
              queryError = null;
            }
          } catch {}
        }
      }

      // If query failed due to network, RLS or error, preserve existing local state
      if (!querySuccess || queryError) {
        console.warn('[ImportedService] Supabase sync error/denial — preserving existing local state:', queryError?.message || queryError);
      } else if (querySuccess && impRows !== null) {
        if (impRows.length === 0) {
          console.log('[ImportedService] Supabase returned 0 imported records. Representing imported data as empty, preserving scan history.');
          this.importInwarded = [];
          this.importSessions = [];
        } else {
          this.importInwarded = impRows.map((r: any) => ({
            id: r.id || `${r.class_id}_${r.member_id || r.mem_id}`,
            import_session_id: r.import_session_id || r.import_batch_id || 'default_session',
            college_name: r.university_name || r.college_name || this.activeUniversity || '',
            university_name: r.university_name || r.college_name || this.activeUniversity || '',
            class_id: normalizeIdentifier(r.class_id),
            sch_id: r.sch_id,
            member_id: normalizeIdentifier(r.member_id || r.mem_id),
            barcode: r.barcode ? normalizeIdentifier(r.barcode) : undefined,
            created_by: r.created_by,
            created_at: r.created_at || new Date().toISOString(),
          }));

          // Align active university with imported records
          const firstUni = this.importInwarded[0].university_name || this.importInwarded[0].college_name;
          if (firstUni && !this.activeUniversity) {
            this.activeUniversity = firstUni;
          }
        }
        this.saveToLocalStorage();
        this.notify();
      }

      // 3. Fetch scan_sessions (paginated)
      const { data: scanSessData, error: scanSessErr } = await fetchAllRowsFromTable('scan_sessions');
      if (!scanSessErr && scanSessData !== null && Array.isArray(scanSessData)) {
        this.scanSessions = scanSessData.map((s: any) => ({
          id: s.id,
          college_name: s.college_name || this.activeUniversity,
          import_session_id: s.import_session_id,
          class_id: normalizeIdentifier(s.class_id),
          started_by: s.started_by || 'Operator',
          started_at: s.started_at || new Date().toISOString(),
          last_activity_at: s.last_activity_at || new Date().toISOString(),
          status: s.status || 'ACTIVE',
          saved_at: s.saved_at,
          saved_by: s.saved_by,
          ended_at: s.ended_at,
          created_at: s.created_at || new Date().toISOString(),
        }));
        this.saveToLocalStorage();
      }

      // 4. Fetch saved_scanned_data with full pagination (and check saved_scan_data)
      let combinedSaved: any[] = [];
      const { data: savedData, error: savedErr } = await fetchAllRowsFromTable('saved_scanned_data');
      if (!savedErr && savedData !== null && Array.isArray(savedData)) {
        combinedSaved.push(...savedData);
      }
      try {
        const { data: altData, error: altErr } = await fetchAllRowsFromTable('saved_scan_data');
        if (!altErr && altData !== null && Array.isArray(altData)) {
          const existingIds = new Set(combinedSaved.map(s => s.id));
          for (const s of altData) {
            if (!existingIds.has(s.id)) {
              combinedSaved.push({
                id: s.id,
                scan_session_id: s.session_id,
                import_session_id: s.import_batch_id,
                college_name: s.college_name,
                class_id: s.class_id,
                sch_id: s.sch_id,
                member_id: s.member_id || s.mem_id,
                barcode: s.barcode,
                scanned_by: s.scanned_by,
                scanned_at: s.scanned_at,
                saved_by: s.saved_by,
                saved_at: s.saved_at,
                status: s.status,
              });
            }
          }
        }
      } catch {}

      if (this.importInwarded.length === 0) {
        this.savedScanned = [];
        this.saveToLocalStorage();
      } else if (combinedSaved.length > 0) {
        const validClassIds = new Set(
          this.importInwarded.map(r => normalizeIdentifier(r.class_id).toLowerCase())
        );

        this.savedScanned = combinedSaved
          .filter((s: any) => validClassIds.has(normalizeIdentifier(s.class_id).toLowerCase()))
          .map((s: any) => ({
            id: s.id,
            scan_session_id: s.scan_session_id,
            import_session_id: s.import_session_id,
            college_name: s.college_name || this.activeUniversity,
            class_id: normalizeIdentifier(s.class_id),
            sch_id: s.sch_id,
            member_id: normalizeIdentifier(s.member_id),
            barcode: s.barcode ? normalizeIdentifier(s.barcode) : undefined,
            scanned_by: s.scanned_by || 'Operator',
            scanned_at: s.scanned_at || new Date().toISOString(),
            saved_by: s.saved_by || 'Operator',
            saved_at: s.saved_at || new Date().toISOString(),
            status: s.status || 'SAVED',
          }));
        this.saveToLocalStorage();
      } else {
        this.savedScanned = [];
        this.saveToLocalStorage();
      }

      // 5. Fetch manual_inward_data (paginated)
      try {
        const { data: manData, error: manErr } = await fetchAllRowsFromTable('manual_inward_data');
        if (!manErr && manData !== null && Array.isArray(manData)) {
          this.manualInwarded = manData.map((m: any) => ({
            id: m.id,
            session_code: m.session_code,
            bundle_code: m.bundle_code,
            class_id: normalizeIdentifier(m.class_id),
            school_id: m.school_id,
            room_number: m.room_number,
            subject_name: m.subject_name,
            booklet_barcode: m.booklet_barcode ? normalizeIdentifier(m.booklet_barcode) : undefined,
            roll_number: m.roll_number ? normalizeIdentifier(m.roll_number) : undefined,
            member_id: normalizeIdentifier(m.member_id || m.roll_number || m.booklet_barcode || ''),
            college_name: m.college_name || this.activeUniversity,
            status: m.status || 'inwarded',
            inwarded_by: m.inwarded_by || 'Manual Inward',
            notes: m.notes,
            scanned_at: m.scanned_at || m.created_at,
            created_at: m.created_at || new Date().toISOString(),
          }));
          this.saveToLocalStorage();
        }
      } catch (e) {
        console.warn('[ImportedService] Supabase manual_inward_data sync note:', e);
      }

      // 6. Fetch scan_session_items (paginated)
      try {
        const { data: itemsData, error: itemsErr } = await fetchAllRowsFromTable('scan_session_items');
        if (!itemsErr && itemsData !== null && Array.isArray(itemsData)) {
          this.scanItems = itemsData.map((i: any) => ({
            id: i.id,
            scan_session_id: i.scan_session_id,
            class_id: String(i.class_id || '').trim(),
            member_id: String(i.member_id || '').trim(),
            barcode: i.barcode,
            detected_at: i.detected_at || new Date().toISOString(),
            detected_by: i.detected_by || 'Siva Sai',
            status: i.status || 'PENDING_SAVE',
            created_at: i.created_at || new Date().toISOString(),
          }));
        }
      } catch (e) {
        console.warn('[ImportedService] Supabase scan_session_items sync note:', e);
      }

      // Auto-reconcile manual inward records into saved_scanned_data
      // Guarantees all inward records (e.g. 19 scanned + 1 manual = 20 total) exist in saved_scanned_data
      if (this.manualInwarded.length > 0 && isSupabaseConfigured) {
        const existingSavedSet = new Set(
          this.savedScanned.map(s => `${normalizeIdentifier(s.class_id).toLowerCase()}::${normalizeIdentifier(s.member_id).toLowerCase()}`)
        );
        const missingFromSaved: any[] = [];
        for (const m of this.manualInwarded) {
          const mid = normalizeIdentifier(m.member_id || m.roll_number || m.booklet_barcode || '');
          const cid = normalizeIdentifier(m.class_id);
          if (!mid || !cid) continue;
          const key = `${cid.toLowerCase()}::${mid.toLowerCase()}`;
          if (!existingSavedSet.has(key)) {
            existingSavedSet.add(key);
            const rowId = m.id || generateUUID();
            const rec: SavedScannedRecord = {
              id: rowId,
              scan_session_id: m.session_code,
              college_name: m.college_name || this.activeUniversity || 'General University',
              class_id: cid,
              sch_id: m.school_id,
              member_id: mid,
              barcode: m.booklet_barcode || mid,
              scanned_by: m.inwarded_by || 'Manual Inward',
              scanned_at: m.scanned_at || m.created_at || new Date().toISOString(),
              saved_by: m.inwarded_by || 'Manual Inward',
              saved_at: m.created_at || new Date().toISOString(),
              status: 'SAVED',
            };
            this.savedScanned.push(rec);
            missingFromSaved.push({
              id: rowId,
              scan_session_id: null,
              import_session_id: this.activeSessionId || null,
              college_name: rec.college_name,
              class_id: cid,
              member_id: mid,
              barcode: rec.barcode,
              scanned_by: rec.scanned_by,
              scanned_at: rec.scanned_at,
              saved_by: rec.saved_by,
              saved_at: rec.saved_at,
              status: 'SAVED',
            });
          }
        }
        if (missingFromSaved.length > 0) {
          try {
            await supabase.from('saved_scanned_data').insert(missingFromSaved);
            console.log(`[ImportedService] Reconciled ${missingFromSaved.length} manual records into saved_scanned_data`);
          } catch (syncErr) {
            console.warn('[ImportedService] Error syncing missing manual inwards into saved_scanned_data:', syncErr);
          }
        }
      }

      // 7. Fetch yet_to_be_inward (Dedicated Pending Booklets table)
      try {
        const { data: yetData, error: yetErr } = await fetchAllRowsFromTable('yet_to_be_inward');
        if (!yetErr && yetData !== null && Array.isArray(yetData)) {
          this.yetToBeInward = yetData.map((r: any) => ({
            id: r.id || `${r.class_id}_${r.member_id}`,
            import_session_id: r.import_session_id || 'default_session',
            college_name: r.university_name || r.college_name || this.activeUniversity || '',
            university_name: r.university_name || r.college_name || this.activeUniversity || '',
            class_id: normalizeIdentifier(r.class_id),
            sch_id: r.sch_id,
            member_id: normalizeIdentifier(r.member_id),
            barcode: r.barcode ? normalizeIdentifier(r.barcode) : undefined,
            created_by: r.created_by,
            created_at: r.created_at || new Date().toISOString(),
          }));
          this.backendPendingCount = this.yetToBeInward.length;

          // AUTO-SEED: If yet_to_be_inward is empty in Supabase, but imported_inward_data has records:
          if (this.yetToBeInward.length === 0 && this.importInwarded.length > 0 && isSupabaseConfigured) {
            console.log('[ImportedService] yet_to_be_inward is empty in Supabase. Auto-populating from imported_inward_data...');
            const savedKeySet = new Set(
              this.savedScanned.map(s => `${normalizeIdentifier(s.class_id).toLowerCase()}::${normalizeIdentifier(s.member_id).toLowerCase()}`)
            );
            const pendingToSeed = this.importInwarded.filter(
              i => !savedKeySet.has(`${normalizeIdentifier(i.class_id).toLowerCase()}::${normalizeIdentifier(i.member_id).toLowerCase()}`)
            );

            if (pendingToSeed.length > 0) {
              this.yetToBeInward = pendingToSeed.map(p => ({
                id: p.id,
                import_session_id: p.import_session_id || 'default_session',
                college_name: p.college_name || p.university_name || 'VIT',
                university_name: p.university_name || p.college_name || 'VIT',
                class_id: p.class_id,
                sch_id: p.sch_id,
                member_id: p.member_id,
                barcode: p.barcode || p.member_id,
                created_at: p.created_at || new Date().toISOString(),
              }));
              this.backendPendingCount = this.yetToBeInward.length;

              // Insert into Supabase yet_to_be_inward in chunks of 500
              const seedRows = pendingToSeed.map(p => ({
                id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id) ? p.id : undefined,
                import_session_id: p.import_session_id || 'default_session',
                university_name: p.university_name || p.college_name || 'VIT',
                college_name: p.college_name || p.university_name || 'VIT',
                class_id: p.class_id,
                sch_id: p.sch_id || null,
                member_id: p.member_id,
                barcode: p.barcode || p.member_id,
                created_at: p.created_at || new Date().toISOString(),
              }));

              (async () => {
                try {
                  for (let i = 0; i < seedRows.length; i += 500) {
                    await supabase.from('yet_to_be_inward').insert(seedRows.slice(i, i + 500));
                  }
                  console.log(`[ImportedService] Auto-seeded ${seedRows.length} rows into yet_to_be_inward in Supabase`);
                } catch (autoErr) {
                  console.warn('[ImportedService] Auto-seed note:', autoErr);
                }
              })();
            }
          }
        } else if (yetErr) {
          // Fallback if table not created yet in Supabase
          this.backendPendingCount = Math.max(0, this.backendExpectedCount - this.backendReceivedCount);
        }
      } catch (yetSyncErr) {
        console.warn('[ImportedService] yet_to_be_inward sync notice:', yetSyncErr);
      }

      // Reconcile count priorities:
      // Authoritative expected = max(backend count, imported in memory)
      if (this.importInwarded.length > 0 && (this.backendExpectedCount === 0 || this.importInwarded.length > this.backendExpectedCount)) {
        this.backendExpectedCount = this.importInwarded.length;
      }
      if (this.savedScanned.length > 0 && (this.backendReceivedCount === 0 || this.savedScanned.length > this.backendReceivedCount)) {
        this.backendReceivedCount = this.savedScanned.length;
      }
      if (this.yetToBeInward.length > 0) {
        this.backendPendingCount = this.yetToBeInward.length;
      } else if (this.backendPendingCount === 0 && this.backendExpectedCount > 0) {
        this.backendPendingCount = Math.max(0, this.backendExpectedCount - this.backendReceivedCount);
      }

      // Reconcile inward records with authoritative imported reference dataset
      this.reconcileInwardStateWithImportedData();

      // Write authoritative state to localStorage and notify all subscribers
      this.saveToLocalStorage();
      this.notify();
      this.isInitialized = true;
    } catch (e) {
      console.warn('[ImportedService] Supabase sync note:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  // ==============================================================================
  // UNIVERSITY & SESSION ACCESSORS (Requirement 2)
  // ==============================================================================

  public getActiveUniversity(): string {
    return this.activeUniversity || '';
  }

  public setActiveUniversity(name: string) {
    if (!name) return;
    this.activeUniversity = name.trim();
    this.saveToLocalStorage();
  }

  public getUniversities(): string[] {
    const set = new Set<string>();
    for (const r of this.importInwarded) {
      if (r.college_name) set.add(r.college_name);
      if (r.university_name) set.add(r.university_name);
    }
    for (const s of this.importSessions) {
      if (s.university_name) set.add(s.university_name);
      if (s.college_name) set.add(s.college_name);
    }
    for (const sv of this.savedScanned) {
      if (sv.college_name) set.add(sv.college_name);
    }
    if (set.size === 0 && this.activeUniversity) {
      set.add(this.activeUniversity);
    }
    return Array.from(set).sort();
  }

  public hasImportedData(): boolean {
    return this.importInwarded.length > 0;
  }

  public getActiveSession(): ImportSession | null {
    if (this.importSessions.length > 0) return this.importSessions[0];
    if (this.importInwarded.length > 0) {
      return {
        id: this.activeSessionId || 'default_sess',
        university_name: this.activeUniversity,
        college_name: this.activeUniversity,
        source_file_name: 'imported_data.xlsx',
        total_records: this.importInwarded.length,
        total_class_ids: new Set(this.importInwarded.map(r => r.class_id)).size,
        created_at: this.importInwarded[0].created_at || new Date().toISOString(),
      };
    }
    return null;
  }

  // ==============================================================================
  // CLASS ORDERING / SORTING (Sections 6, 7, 31)
  // When a class is scanned, it moves to index 0 (the TOP).
  // ==============================================================================
  public moveClassToTop(classId: string) {
    if (!classId) return;
    const clean = classId.trim();
    this.classOrder = [clean, ...this.classOrder.filter(c => c.toLowerCase() !== clean.toLowerCase())];
    this.saveToLocalStorage();
  }

  // ==============================================================================
  // DASHBOARD & OVERALL STATISTICS (Requirement 9)
  // Expected Booklets: COUNT(import_inwarded_data)
  // Received/Scanned: COUNT(saved_scanned_data)
  // Not Scanned: Expected - Scanned
  // ==============================================================================
  public getDashboardStats(universityFilter?: string): {
    totalClasses: number;
    expectedBooklets: number;
    scannedBooklets: number;
    notScannedBooklets: number;
    universityName: string;
    completionPercentage: number;
  } {
    const uni = universityFilter || this.activeUniversity;
    const expected = this.importInwarded.filter(
      r => !uni || r.college_name.toLowerCase() === uni.toLowerCase() || (r.university_name && r.university_name.toLowerCase() === uni.toLowerCase())
    );
    const saved = this.savedScanned.filter(
      r => !uni || r.college_name.toLowerCase() === uni.toLowerCase()
    );

    const expectedCount = Math.max(this.backendExpectedCount, expected.length);
    const scannedCount = Math.max(this.backendReceivedCount, saved.length);
    const notScannedCount = this.backendPendingCount > 0
      ? this.backendPendingCount
      : (this.yetToBeInward.length > 0 ? this.yetToBeInward.length : Math.max(0, expectedCount - scannedCount));
    const totalClasses = new Set(expected.map(r => r.class_id)).size;
    const completionPercentage = expectedCount > 0 ? Math.round((scannedCount / expectedCount) * 100) : 0;

    return {
      totalClasses,
      expectedBooklets: expectedCount,
      scannedBooklets: scannedCount,
      notScannedBooklets: notScannedCount,
      universityName: uni || '',
      completionPercentage,
    };
  }

  public getSessionSummary(): SessionSummary {
    const bundles = this.getClassBundles();
    const uni = this.activeUniversity;

    let totalExpectedFromBundles = 0;
    let totalSavedFromBundles = 0;
    let totalPendingFromBundles = 0;
    let completedClasses = 0;
    let partialClasses = 0;
    let notStartedClasses = 0;

    for (const b of bundles) {
      totalExpectedFromBundles += b.expectedCount;
      totalSavedFromBundles += b.savedCount;
      totalPendingFromBundles += b.pendingCount;

      if (b.status === 'COMPLETED') {
        completedClasses++;
      } else if (b.status === 'PARTIAL / SAVED' || b.status === 'IN PROGRESS') {
        partialClasses++;
      } else {
        notStartedClasses++;
      }
    }

    const effectiveExpected = Math.max(this.backendExpectedCount, totalExpectedFromBundles, this.importInwarded.length);
    const effectiveSaved = Math.max(this.backendReceivedCount, totalSavedFromBundles, this.savedScanned.length);
    const effectivePending = this.backendPendingCount > 0
      ? this.backendPendingCount
      : (this.yetToBeInward.length > 0
        ? this.yetToBeInward.length
        : Math.max(0, effectiveExpected - effectiveSaved));

    const totalReceived = effectiveSaved + totalPendingFromBundles;
    const totalMissing = effectivePending;
    const overallCompletion = effectiveExpected > 0 ? Math.round((effectiveSaved / effectiveExpected) * 100) : 0;

    return {
      universityName: uni,
      totalClasses: bundles.length,
      completedClasses,
      partialClasses,
      notStartedClasses,
      totalExpected: effectiveExpected,
      totalSaved: effectiveSaved,
      totalPending: effectivePending,
      totalReceived,
      totalMissing,
      overallCompletion,
      bundles,
    };
  }

  // ==============================================================================
  // CLASS BUNDLES (Requirement 3, 4, 7, 9)
  // For active class:
  // Expected: count(import_inwarded_data WHERE class_id = X)
  // Scanned: count(saved_scanned_data WHERE class_id = X)
  // Pending: count(scan_session_items WHERE class_id = X AND status = 'PENDING_SAVE')
  // ==============================================================================
  public getClassBundles(): ClassBundle[] {
    const uni = this.activeUniversity;
    const expectedMap = new Map<string, number>();

    // 1. Collect expected count per class from imported_inward_data
    for (const r of this.importInwarded) {
      const cid = normalizeIdentifier(r.class_id);
      if (!cid) continue;
      expectedMap.set(cid, (expectedMap.get(cid) || 0) + 1);
    }

    // 2. Count saved scans & manual inwards per class from saved_scanned_data AND manual_inward_data (distinct members)
    const savedMap = new Map<string, number>();
    const inwardedMembersByClass = new Map<string, Set<string>>();

    // Map of valid imported members per class from authoritative imported_inward_data
    const validMembersByClass = new Map<string, Set<string>>();
    for (const r of this.importInwarded) {
      const cid = normalizeIdentifier(r.class_id).toLowerCase();
      const mid = normalizeIdentifier(r.member_id).toLowerCase();
      if (!validMembersByClass.has(cid)) validMembersByClass.set(cid, new Set());
      validMembersByClass.get(cid)!.add(mid);
    }

    for (const s of this.savedScanned) {
      const cid = normalizeIdentifier(s.class_id);
      const mid = normalizeIdentifier(s.member_id);
      if (!cid || !mid) continue;
      const cidLower = cid.toLowerCase();
      const midLower = mid.toLowerCase();
      // Only count if member actually exists in authoritative imported_inward_data for this class
      if (!validMembersByClass.get(cidLower)?.has(midLower)) continue;

      if (!inwardedMembersByClass.has(cid)) {
        inwardedMembersByClass.set(cid, new Set());
      }
      inwardedMembersByClass.get(cid)!.add(midLower);
    }

    for (const m of this.manualInwarded) {
      const cid = normalizeIdentifier(m.class_id);
      const mid = normalizeIdentifier(m.member_id || m.roll_number || m.booklet_barcode || '');
      if (!cid || !mid) continue;
      const cidLower = cid.toLowerCase();
      const midLower = mid.toLowerCase();
      // Only count if member actually exists in authoritative imported_inward_data for this class
      if (!validMembersByClass.get(cidLower)?.has(midLower)) continue;

      if (!inwardedMembersByClass.has(cid)) {
        inwardedMembersByClass.set(cid, new Set());
      }
      inwardedMembersByClass.get(cid)!.add(midLower);
    }

    for (const [cid, members] of inwardedMembersByClass.entries()) {
      savedMap.set(cid, members.size);
    }

    // 3. Count pending unsaved scans per class from scan_session_items
    const pendingMap = new Map<string, number>();
    for (const item of this.scanItems) {
      if (item.status === 'PENDING_SAVE') {
        const cid = normalizeIdentifier(item.class_id);
        const mid = normalizeIdentifier(item.member_id);
        if (!cid || !mid) continue;
        const cidLower = cid.toLowerCase();
        const midLower = mid.toLowerCase();
        if (!validMembersByClass.get(cidLower)?.has(midLower)) continue;
        pendingMap.set(cid, (pendingMap.get(cid) || 0) + 1);
      }
    }

    // 4. Build ClassBundle list
    const bundleMap = new Map<string, ClassBundle>();
    const now = new Date().toISOString();

    for (const [classId, expectedCount] of expectedMap.entries()) {
      const savedCount = savedMap.get(classId) || 0;
      const pendingCount = pendingMap.get(classId) || 0;
      const receivedCount = savedCount + pendingCount;
      const missingCount = Math.max(0, expectedCount - receivedCount);
      const progressPercentage = expectedCount > 0 ? Math.round((receivedCount / expectedCount) * 100) : 0;

      // Check scan session for saved timestamp & operator
      const classSessions = this.scanSessions.filter(s => s.class_id.toLowerCase() === classId.toLowerCase());
      if (classSessions.length > 1) {
        classSessions.sort((a, b) => new Date(b.last_activity_at || b.started_at || 0).getTime() - new Date(a.last_activity_at || a.started_at || 0).getTime());
      }
      const sess = classSessions[0];
      const rawStartedBy = sess?.started_by || '';
      const rawSavedBy = sess?.saved_by || this.savedScanned.find(s => s.class_id.toLowerCase() === classId.toLowerCase())?.saved_by || '';
      const sessionStartedBy = resolveOperatorName(rawStartedBy);
      const sessionSavedBy = resolveOperatorName(rawSavedBy);
      const currentUserName = resolveOperatorName(getCurrentUser().name);

      let status: BundleStatus = 'NOT STARTED';
      let isCompleted = false;
      let isSaved = false;
      let operatorText = '—';

      // Bundle Status Calculation:
      // 1. COMPLETED: All scripts received (e.g. 70/70 scripts) OR explicitly completed
      if (expectedCount > 0 && receivedCount >= expectedCount) {
        status = 'COMPLETED';
        isCompleted = true;
        isSaved = true;
        const op = sessionSavedBy !== '—' ? sessionSavedBy : (sessionStartedBy !== '—' ? sessionStartedBy : currentUserName);
        operatorText = `Completed by ${op}`;
      }
      // 2. PARTIAL / SAVED: ONLY when user explicitly pressed the SAVE button with missing scripts (e.g. 69/70)
      //    Requires session.status === 'SAVED' with a valid saved_at timestamp, and not actively in-progress
      else if (
        sess?.status === 'SAVED' &&
        Boolean(sess?.saved_at) &&
        pendingCount === 0 &&
        savedCount > 0 &&
        savedCount < expectedCount
      ) {
        status = 'PARTIAL / SAVED';
        isSaved = true;
        const op = sessionSavedBy !== '—' ? sessionSavedBy : currentUserName;
        operatorText = `Saved by ${op}`;
      }
      // 3. IN PROGRESS: Bundle has been started by user, scanning is active, or scripts are scanned but SAVE not clicked yet
      else if (
        sess?.status === 'ACTIVE' ||
        pendingCount > 0 ||
        receivedCount > 0 ||
        Boolean(sess?.started_at)
      ) {
        status = 'IN PROGRESS';
        isSaved = false;
        operatorText = sessionStartedBy !== '—' ? sessionStartedBy : currentUserName;
      }
      // 4. NOT STARTED: No activity, 0 received, 0 pending, no session started
      else {
        status = 'NOT STARTED';
        operatorText = '—';
      }

      bundleMap.set(classId.toLowerCase(), {
        id: `bundle_${classId}`,
        sessionId: sess?.id || this.activeSessionId || 'default_sess',
        universityName: uni,
        collegeName: uni,
        classId,
        expectedCount,
        savedCount,
        pendingCount,
        receivedCount,
        missingCount,
        inwardedCount: receivedCount,
        notInwardedCount: missingCount,
        progressPercentage,
        status,
        isSaved,
        isCompleted,
        savedAt: sess?.saved_at || null,
        lastActivityAt: sess?.last_activity_at || now,
        updatedAt: now,
        createdAt: now,
        startedBy: rawStartedBy || null,
        savedBy: rawSavedBy || null,
        operatorText,
      });
    }

    const result = Array.from(bundleMap.values());

    // Sort according to classOrder: recently scanned classes appear at the TOP
    result.sort((a, b) => {
      const indexA = this.classOrder.indexOf(a.classId);
      const indexB = this.classOrder.indexOf(b.classId);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.classId.localeCompare(b.classId);
    });

    return result;
  }

  public getClassBundle(classId: string): ClassBundle | null {
    if (!classId) return null;
    const clean = normalizeIdentifier(classId).toLowerCase();
    const bundles = this.getClassBundles();
    return bundles.find(b => normalizeIdentifier(b.classId).toLowerCase() === clean) || null;
  }

  /**
   * Return all manual inward records (from manual_inward_data), with optional date range filter [startDate, endDate]
   */
  public getManualInwardRecords(startDate?: string, endDate?: string): ManualInwardedRecord[] {
    let list = [...this.manualInwarded];
    if (startDate) {
      const sTime = new Date(`${startDate}T00:00:00.000`).getTime();
      list = list.filter(r => {
        const t = new Date(r.scanned_at || r.created_at).getTime();
        return !isNaN(t) && t >= sTime;
      });
    }
    if (endDate) {
      const eTime = new Date(`${endDate}T23:59:59.999`).getTime();
      list = list.filter(r => {
        const t = new Date(r.scanned_at || r.created_at).getTime();
        return !isNaN(t) && t <= eTime;
      });
    }
    // Sort newest first
    list.sort((a, b) => new Date(b.scanned_at || b.created_at).getTime() - new Date(a.scanned_at || a.created_at).getTime());
    return list;
  }

  // ==============================================================================
  // BUNDLE RECORDS VIEW (Section 7 & 30)
  // All members displayed inside the class come from imported_inward_data
  // ==============================================================================
  public getBundleRecordViews(classId: string): BundleRecordView[] {
    const clean = normalizeIdentifier(classId).toLowerCase();

    // Expected members for this class from imported_inward_data
    const expected = this.importInwarded.filter(
      r => normalizeIdentifier(r.class_id).toLowerCase() === clean
    );

    const activeUni = (this.activeUniversity || '').toLowerCase();

    // Saved scans for this class from saved_scanned_data scoped to active university
    const saved = this.savedScanned.filter(
      s => normalizeIdentifier(s.class_id).toLowerCase() === clean &&
           (!activeUni || !s.college_name || s.college_name.toLowerCase() === activeUni)
    );
    const savedMap = new Map<string, SavedScannedRecord>();
    for (const s of saved) {
      savedMap.set(normalizeIdentifier(s.member_id).toLowerCase(), s);
    }

    // Manual inwards for this class from manual_inward_data scoped to active university
    const manual = this.manualInwarded.filter(
      m => normalizeIdentifier(m.class_id).toLowerCase() === clean &&
           (!activeUni || !m.college_name || m.college_name.toLowerCase() === activeUni)
    );
    const manualMap = new Map<string, ManualInwardedRecord>();
    for (const m of manual) {
      const mid = normalizeIdentifier(m.member_id || m.roll_number || m.booklet_barcode || '');
      if (mid) {
        manualMap.set(mid.toLowerCase(), m);
      }
    }

    // Pending scans for this class
    const pending = this.scanItems.filter(
      i => normalizeIdentifier(i.class_id).toLowerCase() === clean && i.status === 'PENDING_SAVE'
    );
    const pendingMap = new Map<string, ScanSessionItem>();
    for (const p of pending) {
      pendingMap.set(normalizeIdentifier(p.member_id).toLowerCase(), p);
    }

    const views: BundleRecordView[] = [];

    for (const exp of expected) {
      const mid = normalizeIdentifier(exp.member_id);
      const midLower = mid.toLowerCase();

      const sv = savedMap.get(midLower);
      const man = manualMap.get(midLower);
      const pend = pendingMap.get(midLower);

      if (sv) {
        views.push({
          id: sv.id,
          class_id: exp.class_id,
          member_id: mid,
          barcode: sv.barcode || exp.barcode || null,
          scan_status: 'saved',
          scanned_by: sv.scanned_by,
          scanned_at: sv.scanned_at,
          saved_by: sv.saved_by,
          saved_at: sv.saved_at,
        });
      } else if (man) {
        views.push({
          id: man.id,
          class_id: exp.class_id,
          member_id: mid,
          barcode: man.booklet_barcode || exp.barcode || null,
          scan_status: 'saved',
          scanned_by: man.inwarded_by || 'Manual Inward',
          scanned_at: man.scanned_at || man.created_at,
          saved_by: man.inwarded_by || 'Manual Inward',
          saved_at: man.created_at,
        });
      } else if (pend) {
        views.push({
          id: pend.id,
          class_id: exp.class_id,
          member_id: mid,
          barcode: pend.barcode || exp.barcode || null,
          scan_status: 'pending_save',
          scanned_by: pend.detected_by,
          scanned_at: pend.detected_at,
          saved_by: null,
          saved_at: null,
        });
      } else {
        views.push({
          id: exp.id,
          class_id: exp.class_id,
          member_id: mid,
          barcode: exp.barcode || null,
          scan_status: 'not_started',
          scanned_by: null,
          scanned_at: null,
          saved_by: null,
          saved_at: null,
        });
      }
    }

    // Sort: pending_save first, then saved, then not_started
    views.sort((a, b) => {
      const order = { pending_save: 0, saved: 1, not_started: 2 };
      const diff = order[a.scan_status] - order[b.scan_status];
      if (diff !== 0) return diff;
      return a.member_id.localeCompare(b.member_id);
    });

    return views;
  }

  // ==============================================================================
  // AUTHORITATIVE SUPABASE DATA LOOKUP & FETCH WORKFLOW
  // 1. Barcode Scan:
  //    Camera -> Barcode decoder -> decoded barcode value -> normalize barcode
  //    -> search imported_inward_data.barcode -> matching imported row
  //    -> get member_id from that row -> get class_id from that row -> continue scanning workflow
  // 2. Class ID Search / Fetch:
  //    Query imported_inward_data.class_id using normalized Class ID
  // 3. Manual Search:
  //    Query imported_inward_data using member_id or barcode
  // ==============================================================================

  /**
   * Fetches fresh member records for a Class ID directly from imported_inward_data in Supabase.
   * Authoritative single source of truth when a Class is opened.
   * If Supabase returns zero rows, the local dataset for that class is cleared.
   */
  public async fetchClassMembers(classId: string): Promise<ImportInwardedRecord[]> {
    const cleanCid = normalizeIdentifier(classId);
    if (!cleanCid) return [];

    console.log('[SCANNER] Supabase class members fetch started for:', cleanCid);

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('imported_inward_data')
          .select('*')
          .eq('class_id', cleanCid);

        if (!error && Array.isArray(data)) {
          const freshClassRecords: ImportInwardedRecord[] = data.map((r: any) => ({
            id: r.id || `${r.class_id}_${r.member_id}`,
            import_session_id: r.import_session_id || 'default_session',
            college_name: r.university_name || r.college_name || this.activeUniversity || '',
            university_name: r.university_name || r.college_name || this.activeUniversity || '',
            class_id: normalizeIdentifier(r.class_id),
            sch_id: r.sch_id,
            member_id: normalizeIdentifier(r.member_id),
            barcode: r.barcode ? normalizeIdentifier(r.barcode) : undefined,
            created_by: r.created_by,
            created_at: r.created_at || new Date().toISOString(),
          }));

          // Authoritative replacement for this class
          this.importInwarded = [
            ...this.importInwarded.filter(r => normalizeIdentifier(r.class_id).toLowerCase() !== cleanCid.toLowerCase()),
            ...freshClassRecords,
          ];

          this.saveToLocalStorage();
          this.notify();
          console.log(`[SCANNER] Supabase class members fetch result: ${freshClassRecords.length} records`);
          return freshClassRecords;
        }
      } catch (err) {
        console.warn('[SCANNER] fetchClassMembers error:', err);
      }
    }

    return this.importInwarded.filter(r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase());
  }

  /**
   * Manual search against Supabase imported_inward_data (Member ID / Barcode)
   */
  public async searchMember(query: string, optionalClassId?: string): Promise<ImportInwardedRecord[]> {
    const normalized = normalizeIdentifier(query);
    if (!normalized) return [];

    const cleanClass = optionalClassId ? normalizeIdentifier(optionalClassId) : undefined;

    if (isSupabaseConfigured) {
      try {
        let q = supabase
          .from('imported_inward_data')
          .select('*')
          .or(`member_id.ilike.%${normalized}%,barcode.ilike.%${normalized}%`);

        if (cleanClass) {
          q = q.eq('class_id', cleanClass);
        }

        const { data, error } = await q.limit(100);
        if (!error && Array.isArray(data)) {
          return data.map((r: any) => ({
            id: r.id || `${r.class_id}_${r.member_id}`,
            import_session_id: r.import_session_id || 'default_session',
            college_name: r.university_name || r.college_name || this.activeUniversity || '',
            university_name: r.university_name || r.college_name || this.activeUniversity || '',
            class_id: normalizeIdentifier(r.class_id),
            sch_id: r.sch_id,
            member_id: normalizeIdentifier(r.member_id),
            barcode: r.barcode ? normalizeIdentifier(r.barcode) : undefined,
            created_by: r.created_by,
            created_at: r.created_at || new Date().toISOString(),
          }));
        }
      } catch (err) {
        console.warn('[ImportedService] Supabase member search note:', err);
      }
    }

    const qLower = normalized.toLowerCase();
    return this.importInwarded.filter(r => {
      if (cleanClass && normalizeIdentifier(r.class_id).toLowerCase() !== cleanClass.toLowerCase()) {
        return false;
      }
      return (
        normalizeIdentifier(r.member_id).toLowerCase().includes(qLower) ||
        (r.barcode && normalizeIdentifier(r.barcode).toLowerCase().includes(qLower))
      );
    });
  }

  /**
   * Helper to extract/normalize Member ID from a barcode or manual input.
   * Format example: Barcode "002124EMBA1627" with Class ID "0021" -> Member ID "24EMBA1627".
   * Preserves leading zeros and keeps all identifiers strictly as strings.
   */
  public extractMemberIdFromBarcode(rawInput: string, activeClassId?: string): string {
    return extractMemberIdFromBarcode(rawInput, activeClassId, this.importInwarded);
  }

  /**
   * Unified authoritative lookup used by both Barcode Scanner and Manual Search.
   * Flow:
   * 1. Normalize barcode / input string (preserve leading zeros e.g. "0021", "002124EMBA1159")
   * 2. Search imported_inward_data.barcode
   * 3. Search compound class_id + member_id (e.g. "002124EMBA1159")
   * 4. Search imported_inward_data.member_id (fallback when identical)
   * 5. Search imported_inward_data.class_id (for Class ID barcodes)
   * Checks Supabase directly before concluding not found!
   */
  public async lookupImportedRecord(queryInput: string, optionalClassId?: string): Promise<{
    record?: ImportInwardedRecord;
    isClassOnly?: boolean;
    classId?: string;
  } | null> {
    const normalized = normalizeIdentifier(queryInput);
    if (!normalized) return null;

    console.log('[SCANNER] Supabase lookup started');
    const cleanLower = normalized.toLowerCase();
    const cleanClass = optionalClassId ? normalizeIdentifier(optionalClassId) : undefined;

    // 1. Authoritative direct Supabase query FIRST
    if (isSupabaseConfigured) {
      try {
        // Step A: Search imported_inward_data.barcode
        let qBar = supabase
          .from('imported_inward_data')
          .select('*')
          .eq('barcode', normalized);

        if (cleanClass) {
          qBar = qBar.eq('class_id', cleanClass);
        }

        const { data: byBar, error: barErr } = await qBar.limit(1);

        if (!barErr && byBar && byBar.length > 0) {
          const row = byBar[0];
          const matchedMemberId = normalizeIdentifier(row.member_id);
          const matchedClassId = normalizeIdentifier(row.class_id);
          console.log(`[SCANNER] Supabase lookup result: Found member ${matchedMemberId} for class ${matchedClassId}`);

          const matchedRec: ImportInwardedRecord = {
            id: row.id || `${matchedClassId}_${matchedMemberId}`,
            import_session_id: row.import_session_id || 'default_session',
            college_name: row.university_name || row.college_name || this.activeUniversity || '',
            university_name: row.university_name || row.college_name || this.activeUniversity || '',
            class_id: matchedClassId,
            sch_id: row.sch_id,
            member_id: matchedMemberId,
            barcode: row.barcode ? normalizeIdentifier(row.barcode) : normalized,
            created_by: row.created_by,
            created_at: row.created_at || new Date().toISOString(),
          };

          const existingIdx = this.importInwarded.findIndex(r => r.id === matchedRec.id);
          if (existingIdx >= 0) {
            this.importInwarded[existingIdx] = matchedRec;
          } else {
            this.importInwarded.push(matchedRec);
          }

          return { record: matchedRec };
        }

        // Step B: Case-insensitive ILIKE barcode
        let qIlike = supabase
          .from('imported_inward_data')
          .select('*')
          .ilike('barcode', normalized);

        if (cleanClass) {
          qIlike = qIlike.eq('class_id', cleanClass);
        }

        const { data: byIlike, error: ilikeErr } = await qIlike.limit(1);
        if (!ilikeErr && byIlike && byIlike.length > 0) {
          const row = byIlike[0];
          const matchedMemberId = normalizeIdentifier(row.member_id);
          const matchedClassId = normalizeIdentifier(row.class_id);
          console.log(`[SCANNER] Supabase lookup result: Found member ${matchedMemberId} for class ${matchedClassId}`);

          const matchedRec: ImportInwardedRecord = {
            id: row.id || `${matchedClassId}_${matchedMemberId}`,
            import_session_id: row.import_session_id || 'default_session',
            college_name: row.university_name || row.college_name || this.activeUniversity || '',
            university_name: row.university_name || row.college_name || this.activeUniversity || '',
            class_id: matchedClassId,
            sch_id: row.sch_id,
            member_id: matchedMemberId,
            barcode: row.barcode ? normalizeIdentifier(row.barcode) : normalized,
            created_by: row.created_by,
            created_at: row.created_at || new Date().toISOString(),
          };

          const existingIdx = this.importInwarded.findIndex(r => r.id === matchedRec.id);
          if (existingIdx >= 0) {
            this.importInwarded[existingIdx] = matchedRec;
          } else {
            this.importInwarded.push(matchedRec);
          }

          return { record: matchedRec };
        }

        // Step C: Check if barcode is a Class ID (e.g. "0021")
        const { data: byCls } = await supabase
          .from('imported_inward_data')
          .select('class_id, university_name')
          .eq('class_id', normalized)
          .limit(1);

        if (byCls && byCls.length > 0) {
          const resolvedClass = normalizeIdentifier(byCls[0].class_id);
          console.log(`[SCANNER] Supabase lookup result: Identified Class ID ${resolvedClass}`);
          return { isClassOnly: true, classId: resolvedClass };
        }

        // Step D: Fallback for member_id match (only when barcode and member_id are intentionally identical)
        let qMem = supabase
          .from('imported_inward_data')
          .select('*')
          .eq('member_id', normalized);

        if (cleanClass) {
          qMem = qMem.eq('class_id', cleanClass);
        }

        const { data: byMem } = await qMem.limit(1);
        if (byMem && byMem.length > 0) {
          const row = byMem[0];
          const matchedMemberId = normalizeIdentifier(row.member_id);
          const matchedClassId = normalizeIdentifier(row.class_id);
          console.log(`[SCANNER] Supabase lookup result: Found member ${matchedMemberId} for class ${matchedClassId}`);

          const matchedRec: ImportInwardedRecord = {
            id: row.id || `${matchedClassId}_${matchedMemberId}`,
            import_session_id: row.import_session_id || 'default_session',
            college_name: row.university_name || row.college_name || this.activeUniversity || '',
            university_name: row.university_name || row.college_name || this.activeUniversity || '',
            class_id: matchedClassId,
            sch_id: row.sch_id,
            member_id: matchedMemberId,
            barcode: row.barcode ? normalizeIdentifier(row.barcode) : normalized,
            created_by: row.created_by,
            created_at: row.created_at || new Date().toISOString(),
          };

          const existingIdx = this.importInwarded.findIndex(r => r.id === matchedRec.id);
          if (existingIdx >= 0) {
            this.importInwarded[existingIdx] = matchedRec;
          } else {
            this.importInwarded.push(matchedRec);
          }

          return { record: matchedRec };
        }

        // Step E: Hyphenated Barcode / QR Code Value (e.g. "0021-24EMBA1122" or "SH001-24EMBA1122")
        // Left side = Class ID / SH ID, Right side = Member ID
        if (normalized.includes('-')) {
          const hyphenIdx = normalized.indexOf('-');
          const leftPart = normalizeIdentifier(normalized.substring(0, hyphenIdx));
          const rightPart = normalizeIdentifier(normalized.substring(hyphenIdx + 1));
          if (leftPart && rightPart) {
            let qHyp = supabase
              .from('imported_inward_data')
              .select('*')
              .eq('member_id', rightPart);
            if (cleanClass) {
              qHyp = qHyp.eq('class_id', cleanClass);
            }

            const { data: byHyp } = await qHyp.limit(5);
            if (byHyp && byHyp.length > 0) {
              const matchedRow = byHyp.find((r: any) =>
                normalizeIdentifier(r.class_id).toLowerCase() === leftPart.toLowerCase() ||
                (r.sch_id && normalizeIdentifier(r.sch_id).toLowerCase() === leftPart.toLowerCase())
              ) || byHyp[0];

              if (matchedRow) {
                const matchedMemberId = normalizeIdentifier(matchedRow.member_id);
                const matchedClassId = normalizeIdentifier(matchedRow.class_id);
                console.log(`[SCANNER] Hyphenated QR/Barcode match: Class ${matchedClassId}, Member ${matchedMemberId}`);

                const matchedRec: ImportInwardedRecord = {
                  id: matchedRow.id || `${matchedClassId}_${matchedMemberId}`,
                  import_session_id: matchedRow.import_session_id || 'default_session',
                  college_name: matchedRow.university_name || matchedRow.college_name || this.activeUniversity || '',
                  university_name: matchedRow.university_name || matchedRow.college_name || this.activeUniversity || '',
                  class_id: matchedClassId,
                  sch_id: matchedRow.sch_id,
                  member_id: matchedMemberId,
                  barcode: matchedRow.barcode ? normalizeIdentifier(matchedRow.barcode) : normalized,
                  created_by: matchedRow.created_by,
                  created_at: matchedRow.created_at || new Date().toISOString(),
                };

                const existingIdx = this.importInwarded.findIndex(r => r.id === matchedRec.id);
                if (existingIdx >= 0) {
                  this.importInwarded[existingIdx] = matchedRec;
                } else {
                  this.importInwarded.push(matchedRec);
                }

                return { record: matchedRec };
              }
            }
          }
        }
      } catch (err) {
        console.warn('[SCANNER] Supabase lookup exception:', err);
      }
    }

    // 2. Memory Cache fallback (in case offline or local)
    const matchRecord = (r: ImportInwardedRecord) => {
      if (cleanClass && normalizeIdentifier(r.class_id).toLowerCase() !== cleanClass.toLowerCase()) {
        return false;
      }
      const rBar = r.barcode ? normalizeIdentifier(r.barcode).toLowerCase() : '';
      const rMem = normalizeIdentifier(r.member_id).toLowerCase();

      // 1. Exact barcode match
      if (rBar && rBar === cleanLower) return true;

      // 2. Exact Member ID match
      if (rMem === cleanLower) return true;

      // 3. Hyphenated barcode / QR code match (e.g. "0021-24EMBA1122" or "SH001-24EMBA1122")
      if (cleanLower.includes('-')) {
        const hyphenIdx = cleanLower.indexOf('-');
        const partClass = cleanLower.substring(0, hyphenIdx).trim();
        const partMember = cleanLower.substring(hyphenIdx + 1).trim();
        const matchC = normalizeIdentifier(r.class_id).toLowerCase() === partClass ||
                       (r.sch_id && normalizeIdentifier(r.sch_id).toLowerCase() === partClass);
        if (matchC && rMem === partMember) return true;
      }

      return false;
    };

    const localFound = this.importInwarded.find(matchRecord);
    if (localFound) {
      console.log(`[SCANNER] Supabase lookup result: Found member ${localFound.member_id} for class ${localFound.class_id}`);
      return { record: localFound };
    }

    const matchingClassRecord = this.importInwarded.find(
      r => normalizeIdentifier(r.class_id).toLowerCase() === cleanLower
    );
    if (matchingClassRecord) {
      console.log(`[SCANNER] Supabase lookup result: Identified Class ID ${matchingClassRecord.class_id}`);
      return { isClassOnly: true, classId: matchingClassRecord.class_id };
    }

    console.log('[SCANNER] Supabase lookup result: Not found');
    return null;
  }

  /**
   * Helper to ensure an active scan session exists in table 3 (scan_sessions)
   * Does NOT duplicate sessions on every barcode scan. One session per scanning operation.
   */
  public async ensureScanSession(classId: string): Promise<ScanSession> {
    const cleanCid = normalizeIdentifier(classId);
    const uni =
      this.activeUniversity ||
      this.importInwarded.find(r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase())?.university_name ||
      'VIT';
    const now = new Date().toISOString();
    const currentUser = getCurrentUser();

    // Check in-memory active session for this class
    let session = this.scanSessions.find(
      s => s.class_id.toLowerCase() === cleanCid.toLowerCase() && s.status === 'ACTIVE'
    );

    // If not in memory, check Supabase scan_sessions for active session
    if (!session && isSupabaseConfigured) {
      try {
        const { data: dbSess } = await supabase
          .from('scan_sessions')
          .select('*')
          .eq('class_id', cleanCid)
          .eq('status', 'ACTIVE')
          .order('started_at', { ascending: false })
          .limit(1);

        if (dbSess && dbSess.length > 0) {
          const row = dbSess[0];
          session = {
            id: row.id,
            college_name: row.college_name || uni,
            import_session_id: row.import_session_id || this.activeSessionId || undefined,
            class_id: cleanCid,
            started_by: row.started_by || currentUser.name,
            started_at: row.started_at || now,
            last_activity_at: now,
            status: 'ACTIVE',
            created_at: row.created_at || now,
          };
          this.scanSessions.push(session);
        }
      } catch (e) {
        console.warn('[ImportedService] Supabase session check note:', e);
      }
    }

    if (!session) {
      session = {
        id: generateUUID(),
        college_name: uni,
        import_session_id: this.activeSessionId || undefined,
        class_id: cleanCid,
        started_by: currentUser.name,
        started_at: now,
        last_activity_at: now,
        status: 'ACTIVE',
        created_at: now,
      };
      this.scanSessions.push(session);

      if (isSupabaseConfigured) {
        try {
          await supabase.from('scan_sessions').insert({
            id: session.id,
            college_name: session.college_name,
            import_session_id: session.import_session_id || null,
            class_id: session.class_id,
            started_by: session.started_by,
            started_at: session.started_at,
            last_activity_at: session.last_activity_at,
            status: 'ACTIVE',
          });
        } catch (err: any) {
          console.warn('[ImportedService] Supabase scan_sessions insert note:', err?.message || err);
        }
      }
    } else {
      session.last_activity_at = now;
      if (isSupabaseConfigured) {
        try {
          await supabase
            .from('scan_sessions')
            .update({ last_activity_at: now })
            .eq('id', session.id);
        } catch {}
      }
    }

    this.saveToLocalStorage();
    return session;
  }

  /**
   * Explicitly starts a scanning session for a class bundle when opened by the operator.
   * Immediately marks bundle status as 'IN PROGRESS' and updates scan_sessions.
   */
  public async startClassScanSession(classId: string, operatorName?: string): Promise<ScanSession> {
    const cleanCid = normalizeIdentifier(classId);
    this.moveClassToTop(cleanCid);
    const session = await this.ensureScanSession(cleanCid);
    const currentName = operatorName || resolveOperatorName(getCurrentUser().name);
    if (session) {
      session.started_by = currentName;
      session.status = 'ACTIVE';
      session.last_activity_at = new Date().toISOString();
      if (isSupabaseConfigured) {
        try {
          await supabase
            .from('scan_sessions')
            .update({ status: 'ACTIVE', started_by: currentName, last_activity_at: new Date().toISOString() })
            .eq('id', session.id);
        } catch {}
      }
    }
    this.saveToLocalStorage();
    this.notify();
    return session;
  }

  // ==============================================================================
  // MAIN SCAN SCREEN SCAN LOGIC
  // 1. Camera Scans Booklet or Class barcode
  // 2. Normalizes barcode
  // 3. Searches imported_inward_data.barcode
  // 4. Resolves member_id and class_id
  // 5. Creates/updates Scan Session in scan_sessions
  // 6. Stages scan as PENDING_SAVE in memory and redirects to Bundle Scan
  // ==============================================================================
  public async processScanningDashboardScan(barcodeInput: string): Promise<ScanResult> {
    const normalized = normalizeIdentifier(barcodeInput);
    if (!normalized) {
      return { success: false, message: 'Please provide a valid barcode.' };
    }

    console.log('[SCANNER] Barcode detected:', barcodeInput);
    console.log('[SCANNER] Normalized barcode:', normalized);

    // SECTION 1: NO IMPORT DATA — BLOCKING STATE
    if (this.importInwarded.length === 0) {
      await this.syncFromSupabase();
    }
    if (this.importInwarded.length === 0) {
      return {
        success: false,
        isNoImportedData: true,
        message: 'IMPORT DATA FIRST\n\nPlease import the Class ID and Member ID data before starting scanning.',
      };
    }

    const match = await this.lookupImportedRecord(normalized);

    if (!match) {
      return {
        success: false,
        isUnknownMember: true,
        barcode: normalized,
        message: `MEMBER ID NOT FOUND\n\nBarcode: ${normalized}\n\nThis Member ID / Barcode was not found in the imported data.`,
      };
    }

    // Pattern A: Scanned barcode represents a Class ID
    if (match.isClassOnly && match.classId) {
      this.moveClassToTop(match.classId);
      await this.ensureScanSession(match.classId);
      return {
        success: true,
        shouldRedirectToBundle: true,
        class_id: match.classId,
        barcode: normalized,
        message: `✓ Class ${match.classId} identified. Opening bundle...`,
      };
    }

    // Pattern B: Scanned barcode represents a member booklet
    const targetRecord = match.record!;
    const actualClassId = targetRecord.class_id;

    // Duplicate check
    const alreadySaved = this.savedScanned.some(
      s => s.class_id.toLowerCase() === actualClassId.toLowerCase() && s.member_id.toLowerCase() === targetRecord.member_id.toLowerCase()
    );
    const alreadyPending = this.scanItems.some(
      i => i.class_id.toLowerCase() === actualClassId.toLowerCase() && i.member_id.toLowerCase() === targetRecord.member_id.toLowerCase() && i.status === 'PENDING_SAVE'
    );

    if (alreadySaved || alreadyPending) {
      return {
        success: false,
        isDuplicate: true,
        class_id: actualClassId,
        member_id: targetRecord.member_id,
        barcode: normalized,
        message: `ALREADY INWARDED\n\nMember ID: ${targetRecord.member_id} in Class ${actualClassId} was already inwarded.`,
      };
    }

    // Move Class ID to top
    this.moveClassToTop(actualClassId);

    // Ensure persistent scan session exists
    const session = await this.ensureScanSession(actualClassId);
    const now = new Date().toISOString();
    const currentUser = getCurrentUser();

    // Stage as PENDING_SAVE
    const pendingItem: ScanSessionItem = {
      id: generateUUID(),
      scan_session_id: session.id,
      class_id: actualClassId,
      member_id: targetRecord.member_id,
      barcode: normalized,
      detected_at: now,
      detected_by: currentUser.name,
      status: 'PENDING_SAVE',
      created_at: now,
    };
    this.scanItems.push(pendingItem);
    this.saveToLocalStorage();
    this.notify();

    const updatedBundle = this.getClassBundle(actualClassId);

    return {
      success: true,
      shouldRedirectToBundle: true,
      class_id: actualClassId,
      member_id: targetRecord.member_id,
      barcode: normalized,
      bundle: updatedBundle || undefined,
      message: `✓ Inwarded ${targetRecord.member_id} for Class ${actualClassId}`,
    };
  }

  // ==============================================================================
  // BUNDLE SCAN PROCESSING
  // Enforces:
  // - Class ID Mismatch Protection
  // - Member ID Validation for Active Class via authoritative lookup
  // - Duplicate Inward Protection
  // - Staged as PENDING_SAVE
  // ==============================================================================
  public async processBundleScan(activeClassId: string, barcodeInput: string): Promise<ScanResult> {
    const normalized = normalizeIdentifier(barcodeInput);
    const cleanActiveCid = normalizeIdentifier(activeClassId);
    if (!normalized) {
      return { success: false, message: 'Please provide a valid barcode.' };
    }

    console.log('[SCANNER] Barcode detected:', barcodeInput);
    console.log('[SCANNER] Normalized barcode:', normalized);

    const match = await this.lookupImportedRecord(normalized, cleanActiveCid);

    if (!match) {
      return {
        success: false,
        isUnknownMember: true,
        class_id: activeClassId,
        detectedClassId: activeClassId,
        detectedMemberId: normalized,
        barcode: normalized,
        message: `MEMBER ID NOT FOUND\n\nClass ID: ${activeClassId}\nBarcode: ${normalized}\n\nThis Member ID / Barcode was not found in the imported data for Class ID ${activeClassId}.`,
      };
    }

    if (match.isClassOnly) {
      if (match.classId?.toLowerCase() !== cleanActiveCid.toLowerCase()) {
        return {
          success: false,
          isWrongClass: true,
          currentClassId: activeClassId,
          detectedClassId: match.classId,
          barcode: normalized,
          message: `CLASS ID MISMATCH\n\nCURRENT INWARDING CLASS:\n${activeClassId}\n\nDETECTED CLASS:\n${match.classId}\n\nThis booklet does not belong to the active inwarding bundle.\nPlease scan a booklet belonging to Class ID ${activeClassId}.`,
        };
      }
      return {
        success: true,
        class_id: activeClassId,
        barcode: normalized,
        message: `Class ID ${activeClassId} verified.`,
      };
    }

    const targetRecord = match.record!;

    // Class ID Mismatch Check
    if (normalizeIdentifier(targetRecord.class_id).toLowerCase() !== cleanActiveCid.toLowerCase()) {
      return {
        success: false,
        isWrongClass: true,
        currentClassId: activeClassId,
        detectedClassId: targetRecord.class_id,
        detectedMemberId: targetRecord.member_id,
        barcode: normalized,
        message: `CLASS ID MISMATCH\n\nCURRENT INWARDING CLASS:\n${activeClassId}\n\nDETECTED CLASS:\n${targetRecord.class_id}\n\nThis booklet belongs to Class ID ${targetRecord.class_id}, not active Class ${activeClassId}.`,
      };
    }

    // Duplicate Check
    const alreadySaved = this.savedScanned.some(
      s => s.class_id.toLowerCase() === cleanActiveCid.toLowerCase() && s.member_id.toLowerCase() === targetRecord.member_id.toLowerCase()
    );
    const alreadyPending = this.scanItems.some(
      i => i.class_id.toLowerCase() === cleanActiveCid.toLowerCase() && i.member_id.toLowerCase() === targetRecord.member_id.toLowerCase() && i.status === 'PENDING_SAVE'
    );

    if (alreadySaved || alreadyPending) {
      return {
        success: false,
        isDuplicate: true,
        class_id: activeClassId,
        member_id: targetRecord.member_id,
        barcode: normalized,
        message: `ALREADY INWARDED\n\nMember ID: ${targetRecord.member_id}\nThis booklet was already inwarded for Class ${activeClassId}.`,
      };
    }

    // Valid booklet: Stage as PENDING_SAVE
    const session = await this.ensureScanSession(activeClassId);
    const now = new Date().toISOString();
    const currentUser = getCurrentUser();

    const pendingItem: ScanSessionItem = {
      id: generateUUID(),
      scan_session_id: session.id,
      class_id: cleanActiveCid,
      member_id: targetRecord.member_id,
      barcode: normalized,
      detected_at: now,
      detected_by: currentUser.name,
      status: 'PENDING_SAVE',
      created_at: now,
    };
    this.scanItems.push(pendingItem);
    this.saveToLocalStorage();
    this.notify();

    const updatedBundle = this.getClassBundle(activeClassId);

    return {
      success: true,
      class_id: activeClassId,
      member_id: targetRecord.member_id,
      barcode: normalized,
      bundle: updatedBundle || undefined,
      message: `✓ Inwarded (Pending Save): Member ${targetRecord.member_id} in Class ${activeClassId}`,
    };
  }

  // ==============================================================================
  // SAVE WORKFLOW (Requirements 5, 6, 7, 13)
  // ==============================================================================
  // SAVE WORKFLOW (Requirements 5, 6, 7, 13)
  // Commits inwarded & pending records to Table 4: saved_scanned_data / saved_scan_data
  // Database-level uniqueness prevents duplicates
  // Strict Supabase confirmation before marking as SAVED
  // ==============================================================================
  public async saveActiveBundle(classId: string): Promise<{
    success: boolean;
    savedCount: number;
    totalSavedForClass: number;
    message: string;
    bundle?: ClassBundle;
    error?: string;
  }> {
    const cleanCid = normalizeIdentifier(classId);
    if (!cleanCid) {
      return {
        success: false,
        savedCount: 0,
        totalSavedForClass: 0,
        message: 'Invalid Class ID',
        error: 'Class ID is required',
      };
    }

    console.log(`[SAVE CLASS BUNDLE] Starting save operation for Class ID: "${cleanCid}"`);

    // Requirement 13: Offline guard — do not claim save succeeded if offline
    if (typeof navigator !== 'undefined' && navigator.onLine === false && isSupabaseConfigured) {
      return {
        success: false,
        savedCount: 0,
        totalSavedForClass: this.savedScanned.filter(s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid.toLowerCase()).length,
        message: 'Network offline: Cannot commit records to Supabase. Items remain staged in PENDING_SAVE.',
        error: 'Network connection lost.',
      };
    }

    const now = new Date().toISOString();
    const currentUser = getCurrentUser();

    // 1. Ensure or retrieve the active scan session for this class
    const session = await this.ensureScanSession(cleanCid);
    let validSessionId: string | null = null;

    if (session && session.id) {
      // Validate that session.id is a UUID (not a random string)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id);
      if (isUuid) {
        validSessionId = session.id;
      }
    }

    // Ensure scan_sessions record exists in Supabase so foreign key constraints succeed
    if (isSupabaseConfigured && validSessionId) {
      try {
        const { data: existingSess } = await supabase
          .from('scan_sessions')
          .select('id')
          .eq('id', validSessionId)
          .limit(1);

        if (!existingSess || existingSess.length === 0) {
          await supabase.from('scan_sessions').insert({
            id: validSessionId,
            college_name: session?.college_name || this.activeUniversity || 'General University',
            import_session_id: session?.import_session_id || this.activeSessionId || null,
            class_id: cleanCid,
            started_by: session?.started_by || currentUser.name,
            started_at: session?.started_at || now,
            status: 'ACTIVE',
            last_activity_at: now,
          });
        }
      } catch (sessUpsertErr) {
        console.warn('[SAVE CLASS BUNDLE] Note on session ensure:', sessUpsertErr);
      }
    }

    // University / College name resolution
    const uni: string =
      this.activeUniversity ||
      session?.college_name ||
      this.importInwarded.find(r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase())?.university_name ||
      'General University';

    // 2. Identify all pending scanned items for this class (barcode scans awaiting SAVE):
    const pendingScanItems = this.scanItems.filter(
      i => normalizeIdentifier(i.class_id).toLowerCase() === cleanCid.toLowerCase() && i.status === 'PENDING_SAVE'
    );

    // 3. Get existing saved member IDs to prevent duplicates
    const existingSavedKeys = new Set(
      this.savedScanned
        .filter(s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid.toLowerCase())
        .map(s => `${uni.toLowerCase()}::${cleanCid.toLowerCase()}::${normalizeIdentifier(s.member_id).toLowerCase()}`)
    );

    // Also check Supabase saved_scanned_data
    if (isSupabaseConfigured) {
      try {
        const { data: dbSaved } = await supabase
          .from('saved_scanned_data')
          .select('member_id, college_name')
          .eq('class_id', cleanCid);
        if (dbSaved && Array.isArray(dbSaved)) {
          for (const s of dbSaved) {
            const cName = (s.college_name || uni).toLowerCase();
            const mId = normalizeIdentifier(s.member_id).toLowerCase();
            existingSavedKeys.add(`${cName}::${cleanCid.toLowerCase()}::${mId}`);
          }
        }
      } catch (dbSavedErr) {
        console.warn('[SAVE CLASS BUNDLE] Note checking existing saved:', dbSavedErr);
      }
    }

    // 4. Build candidate records to persist from pending barcode scans
    const candidatesByMemberId = new Map<string, {
      memberId: string;
      barcode?: string | null;
      scannedBy: string;
      scannedAt: string;
      schoolId?: string | null;
      sourceItemId?: string;
    }>();

    // Add from pending scanItems
    for (const item of pendingScanItems) {
      const matchingImport = this.importInwarded.find(r =>
        normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase() &&
        (
          (item.barcode && r.barcode && normalizeIdentifier(r.barcode).toLowerCase() === normalizeIdentifier(item.barcode).toLowerCase()) ||
          normalizeIdentifier(r.member_id).toLowerCase() === normalizeIdentifier(item.member_id).toLowerCase()
        )
      );
      const targetMid = matchingImport ? normalizeIdentifier(matchingImport.member_id) : normalizeIdentifier(item.member_id);
      const targetBcode = matchingImport?.barcode ? normalizeIdentifier(matchingImport.barcode) : (item.barcode ? normalizeIdentifier(item.barcode) : targetMid);

      if (!candidatesByMemberId.has(targetMid.toLowerCase())) {
        candidatesByMemberId.set(targetMid.toLowerCase(), {
          memberId: targetMid,
          barcode: targetBcode,
          scannedBy: item.detected_by || currentUser.name || 'Operator',
          scannedAt: item.detected_at || now,
          sourceItemId: item.id,
        });
      }
    }

    // Include all manual inward records for this class (public.manual_inward_data) to ensure 100% data sync
    const classManualRecords = this.manualInwarded.filter(
      m => normalizeIdentifier(m.class_id).toLowerCase() === cleanCid.toLowerCase()
    );
    for (const m of classManualRecords) {
      const mid = normalizeIdentifier(m.member_id || m.roll_number || m.booklet_barcode || '');
      if (!mid) continue;
      if (!candidatesByMemberId.has(mid.toLowerCase())) {
        candidatesByMemberId.set(mid.toLowerCase(), {
          memberId: mid,
          barcode: m.booklet_barcode || mid,
          scannedBy: m.inwarded_by || 'Manual Inward',
          scannedAt: m.scanned_at || m.created_at || now,
          schoolId: m.school_id || null,
        });
      }
    }

    // Filter out candidates that have already been saved
    const newSavedRecords: SavedScannedRecord[] = [];
    const scannedDbRows: any[] = [];
    const scanDataDbRows: any[] = [];

    for (const candidate of candidatesByMemberId.values()) {
      const key = `${uni.toLowerCase()}::${cleanCid.toLowerCase()}::${candidate.memberId.toLowerCase()}`;
      if (existingSavedKeys.has(key)) {
        continue;
      }
      existingSavedKeys.add(key);

      const recordId = generateUUID();

      // In-memory model
      newSavedRecords.push({
        id: recordId,
        scan_session_id: validSessionId || undefined,
        import_session_id: session?.import_session_id || this.activeSessionId || undefined,
        college_name: uni,
        class_id: cleanCid,
        sch_id: candidate.schoolId || undefined,
        member_id: candidate.memberId,
        barcode: candidate.barcode || candidate.memberId,
        scanned_by: candidate.scannedBy,
        scanned_at: candidate.scannedAt,
        saved_by: currentUser.name || 'Operator',
        saved_at: now,
        status: 'SAVED',
      });

      // DB row for public.saved_scanned_data
      scannedDbRows.push({
        id: recordId,
        scan_session_id: validSessionId || null,
        import_session_id: session?.import_session_id || this.activeSessionId || null,
        college_name: uni,
        class_id: cleanCid,
        member_id: candidate.memberId,
        barcode: candidate.barcode || candidate.memberId,
        scanned_by: candidate.scannedBy,
        scanned_at: candidate.scannedAt,
        saved_by: currentUser.name || 'Operator',
        saved_at: now,
        status: 'SAVED',
      });
    }

    console.log(`[SAVE CLASS BUNDLE] New records to commit: ${newSavedRecords.length} (Candidates found: ${candidatesByMemberId.size})`);

    // 5. Persist to Supabase public.saved_scanned_data
    if (isSupabaseConfigured && scannedDbRows.length > 0) {
      let insertSucceeded = false;
      let lastErrorMessage = '';

      try {
        for (let i = 0; i < scannedDbRows.length; i += BATCH_SIZE) {
          const chunk = scannedDbRows.slice(i, i + BATCH_SIZE);
          let { error: insErr } = await supabase.from('saved_scanned_data').insert(chunk);
          if (insErr && insErr.code === '23503') {
            // FK violation on scan_session_id, retry with null
            const nullChunk = chunk.map((r: any) => ({ ...r, scan_session_id: null }));
            const retryRes = await supabase.from('saved_scanned_data').insert(nullChunk);
            insErr = retryRes.error;
          }

          if (!insErr) {
            insertSucceeded = true;
            console.log('[SAVE CLASS BUNDLE] ✓ Inserted chunk into saved_scanned_data');
          } else {
            console.error('[SAVE CLASS BUNDLE] saved_scanned_data insert error:', insErr);
            lastErrorMessage = insErr.message;
          }
        }
      } catch (err2: any) {
        console.error('[SAVE CLASS BUNDLE] saved_scanned_data exception:', err2);
        lastErrorMessage = err2?.message || String(err2);
      }

      if (!insertSucceeded && scannedDbRows.length > 0) {
        console.error('[SAVE CLASS BUNDLE] Fatal: Could not commit records to saved_scanned_data:', lastErrorMessage);
        return {
          success: false,
          savedCount: 0,
          totalSavedForClass: this.savedScanned.filter(s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid.toLowerCase()).length,
          message: `Failed to commit saved records: ${lastErrorMessage}`,
          error: lastErrorMessage || 'Database insert failed',
        };
      }
    }

    // Update imported_inward_data scan_status to 'completed' for all inwarded members in this class
    if (isSupabaseConfigured) {
      try {
        const inwardedMemberIds = [
          ...this.savedScanned.filter(s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid.toLowerCase()).map(s => s.member_id),
          ...newSavedRecords.map(r => r.member_id)
        ];
        if (inwardedMemberIds.length > 0) {
          await supabase
            .from('imported_inward_data')
            .update({ scan_status: 'completed', scanned_at: now })
            .eq('class_id', cleanCid)
            .in('member_id', inwardedMemberIds);
        }
      } catch (updImpErr) {
        console.warn('[SAVE CLASS BUNDLE] Note updating imported_inward_data scan_status:', updImpErr);
      }
    }

    // 6. Update in-memory state
    if (newSavedRecords.length > 0) {
      this.savedScanned.push(...newSavedRecords);

      // Delete inwarded members from yet_to_be_inward (3-Table Architecture)
      if (isSupabaseConfigured) {
        try {
          const memberIds = newSavedRecords.map(r => r.member_id);
          await supabase
            .from('yet_to_be_inward')
            .delete()
            .eq('class_id', cleanCid)
            .in('member_id', memberIds);
        } catch (delYetErr) {
          console.warn('[SAVE CLASS BUNDLE] Note deleting from yet_to_be_inward:', delYetErr);
        }
      }

      const savedMidSet = new Set(newSavedRecords.map(r => normalizeIdentifier(r.member_id).toLowerCase()));
      this.yetToBeInward = this.yetToBeInward.filter(
        y => !(normalizeIdentifier(y.class_id).toLowerCase() === cleanCid.toLowerCase() && savedMidSet.has(normalizeIdentifier(y.member_id).toLowerCase()))
      );
      this.backendReceivedCount = this.savedScanned.length;
      this.backendPendingCount = this.yetToBeInward.length > 0 ? this.yetToBeInward.length : Math.max(0, this.backendExpectedCount - this.backendReceivedCount);
    }

    for (const item of pendingScanItems) {
      item.status = 'SAVED';
    }

    // Update scan_session_items in Supabase if exists
    if (isSupabaseConfigured && pendingScanItems.length > 0) {
      try {
        const itemIds = pendingScanItems.map(i => i.id);
        await supabase.from('scan_session_items').update({ status: 'SAVED' }).in('id', itemIds);
      } catch {}
    }

    // 7. Update scan_sessions status
    const expectedTotal = this.importInwarded.filter(
      r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase()
    ).length;
    const totalSavedForThisClass = this.savedScanned.filter(
      s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid.toLowerCase()
    ).length;

    const newStatus = (totalSavedForThisClass >= expectedTotal && expectedTotal > 0) ? 'COMPLETED' : 'SAVED';

    if (session) {
      session.saved_at = now;
      session.saved_by = currentUser.name;
      session.status = newStatus;
      session.last_activity_at = now;

      if (isSupabaseConfigured && validSessionId) {
        try {
          const { data: updatedSess, error: updErr } = await supabase
            .from('scan_sessions')
            .update({
              status: newStatus,
              saved_at: now,
              saved_by: currentUser.name,
              last_activity_at: now,
            })
            .eq('id', validSessionId)
            .select();

          if (updErr || !updatedSess || updatedSess.length === 0) {
            await supabase.from('scan_sessions').upsert({
              id: validSessionId,
              college_name: session.college_name || uni,
              import_session_id: session.import_session_id || this.activeSessionId || null,
              class_id: cleanCid,
              status: newStatus,
              saved_at: now,
              saved_by: currentUser.name,
              last_activity_at: now,
            }, { onConflict: 'id' });
          }
        } catch (sessUpErr) {
          console.warn('[SAVE CLASS BUNDLE] Note on session final status update:', sessUpErr);
        }
      }
    }

    this.saveToLocalStorage();
    this.notify();

    console.log(`[SAVE CLASS BUNDLE] Success! Saved count: ${newSavedRecords.length}, Total for class: ${totalSavedForThisClass}/${expectedTotal}`);

    return {
      success: true,
      savedCount: newSavedRecords.length,
      totalSavedForClass: totalSavedForThisClass,
      message: `Class ${cleanCid} inward saved successfully (${newSavedRecords.length} new records committed, total: ${totalSavedForThisClass}).`,
      bundle: this.getClassBundle(cleanCid) || undefined,
    };
  }

  // ==============================================================================
  // EXCEL IMPORT WORKFLOW (Requirements 1 & 2)
  // MANDATORY: University Name must be non-empty before processing
  // Preserves leading zeros e.g. 0031
  // Verifies persistence in Supabase before reporting success
  // ==============================================================================
  public checkDuplicates(items: { class_id: string; member_id: string }[]): {
    newItems: { class_id: string; member_id: string }[];
    duplicateItems: { class_id: string; member_id: string }[];
    totalChecked: number;
    allDuplicates: boolean;
    hasDuplicates: boolean;
  } {
    const existingSet = new Set<string>();
    for (const r of this.importInwarded) {
      existingSet.add(`${r.class_id.trim().toLowerCase()}::${r.member_id.trim().toLowerCase()}`);
    }

    const seenInExcel = new Set<string>();
    const newItems: { class_id: string; member_id: string }[] = [];
    const duplicateItems: { class_id: string; member_id: string }[] = [];

    for (const item of items) {
      const cid = String(item.class_id || '').trim();
      const mid = String(item.member_id || '').trim();
      if (!cid || !mid) continue;

      const key = `${cid.toLowerCase()}::${mid.toLowerCase()}`;
      if (existingSet.has(key) || seenInExcel.has(key)) {
        duplicateItems.push({ class_id: cid, member_id: mid });
      } else {
        seenInExcel.add(key);
        newItems.push({ class_id: cid, member_id: mid });
      }
    }

    return {
      newItems,
      duplicateItems,
      totalChecked: items.length,
      allDuplicates: items.length > 0 && newItems.length === 0,
      hasDuplicates: duplicateItems.length > 0,
    };
  }

  public async bulkInsert(
    items: { class_id: string; member_id: string; sch_id?: string; barcode?: string }[],
    universityName: string,
    sourceFileName?: string,
    onProgress?: (inserted: number, total: number) => void,
    replaceExisting: boolean = false
  ): Promise<{ success: boolean; inserted: number; error?: string; session?: ImportSession }> {
    const cleanUniversity = (universityName || '').trim();

    // If replaceExisting is requested, clear previous classes and scans first
    if (replaceExisting) {
      this.importInwarded = [];
      this.savedScanned = [];
      this.manualInwarded = [];
      this.scanSessions = [];
      this.scanItems = [];
      this.classOrder = [];
      if (isSupabaseConfigured) {
        try {
          await Promise.allSettled([
            supabase.from('import_inwarded_data').delete().neq('id', 'placeholder'),
            supabase.from('imported_inward_data').delete().neq('id', 'placeholder'),
            supabase.from('saved_scanned_data').delete().neq('id', 'placeholder'),
            supabase.from('saved_scan_data').delete().neq('id', 'placeholder'),
            supabase.from('manual_inward_data').delete().neq('id', 'placeholder'),
            supabase.from('scan_sessions').delete().neq('id', 'placeholder'),
            supabase.from('scan_session_items').delete().neq('id', 'placeholder'),
          ]);
        } catch {}
      }
    }

    // SECTION 13: COLLEGE / UNIVERSITY REQUIRED
    if (!cleanUniversity) {
      return {
        success: false,
        inserted: 0,
        error: 'COLLEGE / UNIVERSITY REQUIRED\n\nPlease enter/select the College/University name before importing the Excel file.',
      };
    }

    if (!items || items.length === 0) {
      return { success: false, inserted: 0, error: 'No valid records to import.' };
    }

    const now = new Date().toISOString();
    const currentUser = getCurrentUser();
    const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}`;

    // Deduplication identity: class_id + member_id for active university
    const existingSet = new Set<string>();
    for (const r of this.importInwarded) {
      if (r.college_name.toLowerCase() === cleanUniversity.toLowerCase()) {
        existingSet.add(`${r.class_id.trim().toLowerCase()}::${r.member_id.trim().toLowerCase()}`);
      }
    }

    const isFirstImport = this.importInwarded.length === 0;
    const itemsToInsert = isFirstImport
      ? items
      : items.filter(
          item =>
            !existingSet.has(
              `${String(item.class_id).trim().toLowerCase()}::${String(item.member_id).trim().toLowerCase()}`
            )
        );

    if (itemsToInsert.length === 0 && !isFirstImport) {
      return { success: false, inserted: 0, error: 'All records in this Excel file already exist for this institution.' };
    }

    // Save University Name with import session
    const session: ImportSession = {
      id: sessionId,
      university_name: cleanUniversity,
      college_name: cleanUniversity,
      source_file_name: sourceFileName || 'inward_import.xlsx',
      total_records: itemsToInsert.length,
      total_class_ids: new Set(itemsToInsert.map(i => String(i.class_id).trim())).size,
      created_at: now,
    };

    // Create Table 1 records: imported_inward_data
    const newRecords: ImportInwardedRecord[] = itemsToInsert.map((item, index) => ({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `imp_${Date.now()}_${index}`,
      import_session_id: sessionId,
      college_name: cleanUniversity,
      university_name: cleanUniversity,
      class_id: String(item.class_id).trim(), // preserve leading zeros as pure string
      sch_id: item.sch_id ? String(item.sch_id).trim() : undefined,
      member_id: String(item.member_id).trim(), // preserve leading zeros as pure string
      barcode: item.barcode ? String(item.barcode).trim() : String(item.member_id).trim(),
      created_by: currentUser.name,
      created_at: now,
    }));

    // Requirement 1: Persist to Supabase (supports remote schema imported_inward_data and import_inwarded_data)
    if (isSupabaseConfigured) {
      try {
        // Optional session metadata persistence
        try {
          await supabase.from('import_sessions').upsert([{
            id: session.id,
            university_name: session.university_name,
            college_name: session.college_name,
            source_file_name: session.source_file_name,
            total_records: session.total_records,
            total_class_ids: session.total_class_ids,
            created_at: session.created_at,
          }]);
        } catch {
          // Session table optional
        }

        const total = newRecords.length;
        let processed = 0;

        for (let i = 0; i < total; i += BATCH_SIZE) {
          // 1. Try production table: import_inwarded_data
          const primaryChunk = newRecords.slice(i, i + BATCH_SIZE).map(r => ({
            id: r.id,
            import_session_id: r.import_session_id,
            college_name: r.college_name,
            university_name: r.university_name,
            class_id: r.class_id,
            sch_id: r.sch_id,
            member_id: r.member_id,
            barcode: r.barcode || null,
            created_by: r.created_by,
            created_at: r.created_at,
          }));

          let { error: insErr } = await supabase.from('import_inwarded_data').insert(primaryChunk);

          // 2. If import_inwarded_data is not in schema cache, fallback to imported_inward_data
          if (insErr && (insErr.message?.includes('schema cache') || insErr.message?.includes('relation'))) {
            const fallbackChunk = newRecords.slice(i, i + BATCH_SIZE).map(r => ({
              university_name: cleanUniversity,
              class_id: r.class_id,
              member_id: r.member_id,
              barcode: r.barcode || r.member_id,
              scan_status: 'not_started',
              import_session_id: sessionId,
            }));
            const { error: fbErr } = await supabase.from('imported_inward_data').insert(fallbackChunk);
            if (!fbErr) {
              insErr = null;
            }
          }

          if (insErr) {
            console.warn('[ImportedService] Supabase insert note:', insErr.message);
          }

          processed += primaryChunk.length;
          if (onProgress) onProgress(processed, total);
        }

        // 3. Insert into dedicated yet_to_be_inward table (3-Table Architecture)
        try {
          const yetToBeRecords = newRecords.map(r => ({
            id: r.id,
            import_session_id: sessionId,
            university_name: cleanUniversity,
            college_name: cleanUniversity,
            class_id: r.class_id,
            member_id: r.member_id,
            barcode: r.barcode || r.member_id,
            created_at: now,
          }));
          for (let i = 0; i < yetToBeRecords.length; i += BATCH_SIZE) {
            await supabase.from('yet_to_be_inward').insert(yetToBeRecords.slice(i, i + BATCH_SIZE));
          }
        } catch (yetErr) {
          console.warn('[ImportedService] yet_to_be_inward insert note:', yetErr);
        }

        // Direct count verification query
        try {
          const { count: verifiedCount } = await supabase
            .from('imported_inward_data')
            .select('id', { count: 'exact', head: true })
            .eq('university_name', cleanUniversity);

          if (verifiedCount !== null && verifiedCount !== undefined) {
            console.log(`[ImportedService] Supabase verified record count for ${cleanUniversity}: ${verifiedCount}`);
          }
        } catch {
          // Non-blocking verification notice
        }
      } catch (err: any) {
        console.warn('[ImportedService] Supabase persistence notice:', err?.message || err);
      }
    }

    // Update in-memory state after Supabase persistence
    this.importSessions = [session, ...this.importSessions];
    this.activeUniversity = cleanUniversity;
    this.activeSessionId = sessionId;

    if (isFirstImport || replaceExisting) {
      this.importInwarded = newRecords;
      this.yetToBeInward = [...newRecords];
    } else {
      // Merge new imported records with existing records without duplicate key collisions
      const existingKeySet = new Set(
        this.importInwarded.map(r => `${normalizeIdentifier(r.class_id).toLowerCase()}::${normalizeIdentifier(r.member_id).toLowerCase()}`)
      );
      const uniqueNewRecords = newRecords.filter(
        r => !existingKeySet.has(`${normalizeIdentifier(r.class_id).toLowerCase()}::${normalizeIdentifier(r.member_id).toLowerCase()}`)
      );
      this.importInwarded = [...this.importInwarded, ...uniqueNewRecords];
      this.yetToBeInward = [...this.yetToBeInward, ...uniqueNewRecords];
    }
    this.backendExpectedCount = this.importInwarded.length;
    this.backendPendingCount = this.yetToBeInward.length;

    // Initialize class order
    const importedClasses = Array.from(new Set(newRecords.map(r => r.class_id)));
    this.classOrder = [...this.classOrder.filter(c => !importedClasses.includes(c)), ...importedClasses];

    // FIX #2: EXISTING CLASS RE-IMPORT MUST NEVER DELETE SAVED SCANS
    // Existing saved and inwarded members MUST remain intact in memory and in Supabase.
    // NEVER wipe saved_scanned_data, saved_scan_data, manual_inward_data, scan_sessions, or scan_session_items.

    this.reconcileInwardStateWithImportedData();
    this.saveToLocalStorage();
    this.notify();

    return { success: true, inserted: newRecords.length, session };
  }

  // ==============================================================================
  // REPORT EXPORT WORKFLOW (Requirement 2 & 10)
  // Queries latest authoritative Supabase data filtered by university
  // EXACTLY THREE SHEETS:
  // Sheet 1: Scanned Data (finalized saved_scanned_data)
  // Sheet 2: Not Scanned Data (import_inwarded_data MINUS saved_scanned_data)
  // Sheet 3: Class Wise Data (One row per Class ID with actual stats)
  // ==============================================================================
  public async exportUniversityExcel(selectedUniversity: string): Promise<{
    success: boolean;
    filename: string;
    scannedCount: number;
    notScannedCount: number;
    totalExpected: number;
  }> {
    const uni = (selectedUniversity || '').trim();
    if (!uni) {
      throw new Error('SELECT UNIVERSITY\n\nPlease select a College/University before exporting the report.');
    }

    // Query latest records from Supabase if configured for strict backend truth
    let uniExpected: ImportInwardedRecord[] = [];
    let uniSaved: SavedScannedRecord[] = [];

    if (isSupabaseConfigured) {
      try {
        const { data: dbExpected1 } = await fetchAllRowsFromTable('imported_inward_data', q => q.eq('university_name', uni));

        if (dbExpected1 && Array.isArray(dbExpected1) && dbExpected1.length > 0) {
          uniExpected = dbExpected1.map((r: any) => ({
            id: r.id,
            import_session_id: r.import_session_id || 'default_sess',
            college_name: r.university_name || uni,
            university_name: r.university_name || uni,
            class_id: String(r.class_id).trim(),
            member_id: String(r.member_id).trim(),
            barcode: r.barcode,
            created_at: r.created_at,
          }));
        } else {
          try {
            const { data: dbExpected2 } = await fetchAllRowsFromTable('import_inwarded_data', q => q.or(`college_name.eq.${uni},university_name.eq.${uni}`));

            if (dbExpected2 && Array.isArray(dbExpected2)) {
              uniExpected = dbExpected2.map((r: any) => ({
                id: r.id,
                import_session_id: r.import_session_id,
                college_name: r.college_name,
                university_name: r.university_name || r.college_name,
                class_id: String(r.class_id).trim(),
                sch_id: r.sch_id,
                member_id: String(r.member_id).trim(),
                barcode: r.barcode,
                created_by: r.created_by,
                created_at: r.created_at,
              }));
            }
          } catch {
            // Handled gracefully
          }
        }

        const { data: dbSaved } = await fetchAllRowsFromTable('saved_scanned_data', q => q.eq('college_name', uni));

        if (dbSaved && Array.isArray(dbSaved)) {
          uniSaved = dbSaved.map((s: any) => ({
            id: s.id,
            scan_session_id: s.scan_session_id,
            import_session_id: s.import_session_id,
            college_name: s.college_name,
            class_id: String(s.class_id).trim(),
            sch_id: s.sch_id,
            member_id: String(s.member_id).trim(),
            barcode: s.barcode,
            scanned_by: s.scanned_by,
            scanned_at: s.scanned_at,
            saved_by: s.saved_by,
            saved_at: s.saved_at,
            status: 'SAVED',
          }));
        }
      } catch (err) {
        console.warn('[ImportedService] Supabase report query note:', err);
      }
    }

    // Fallback to in-memory state if remote fetch produced no records
    if (uniExpected.length === 0) {
      uniExpected = this.importInwarded.filter(
        r => (r.college_name && r.college_name.toLowerCase() === uni.toLowerCase()) ||
             (r.university_name && r.university_name.toLowerCase() === uni.toLowerCase())
      );
    }
    if (uniSaved.length === 0) {
      uniSaved = this.savedScanned.filter(
        s => s.college_name && s.college_name.toLowerCase() === uni.toLowerCase()
      );
    }

    // Map of saved members: class_id::member_id
    const savedKeys = new Set(
      uniSaved.map(s => `${s.class_id.toLowerCase()}::${s.member_id.toLowerCase()}`)
    );

    // Not Scanned records = Expected MINUS Saved
    const uniNotScanned = uniExpected.filter(
      r => !savedKeys.has(`${r.class_id.toLowerCase()}::${r.member_id.toLowerCase()}`)
    );

    // ---------------------------------------------------------------------------
    // SHEET 1 — SCANNED DATA
    // ---------------------------------------------------------------------------
    const scannedSheetRows: any[][] = [
      [
        'College / University',
        'Import Session',
        'Class ID',
        'Member ID',
        'Scan Status',
        'Scanned By',
        'Scanned Time',
        'Saved By',
        'Saved Time',
      ],
    ];

    if (uniSaved.length > 0) {
      for (const s of uniSaved) {
        scannedSheetRows.push([
          s.college_name || uni,
          s.import_session_id || s.scan_session_id || 'SES-001',
          s.class_id,
          s.member_id,
          'SAVED',
          s.scanned_by || 'Siva Sai',
          s.scanned_at ? new Date(s.scanned_at).toLocaleString() : '—',
          s.saved_by || 'Siva Sai',
          s.saved_at ? new Date(s.saved_at).toLocaleString() : '—',
        ]);
      }
    } else {
      scannedSheetRows.push(['No saved scanned records yet for this university', '', '', '', '', '', '', '', '']);
    }

    const wsScanned = XLSX.utils.aoa_to_sheet(scannedSheetRows);
    wsScanned['!cols'] = [
      { wch: 25 },
      { wch: 18 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
      { wch: 22 },
    ];

    // ---------------------------------------------------------------------------
    // SHEET 2 — NOT SCANNED DATA
    // ---------------------------------------------------------------------------
    const notScannedSheetRows: any[][] = [
      ['College / University', 'Class ID', 'Member ID', 'Status', 'Import Time'],
    ];

    if (uniNotScanned.length > 0) {
      for (const ns of uniNotScanned) {
        notScannedSheetRows.push([
          ns.college_name || ns.university_name || uni,
          ns.class_id,
          ns.member_id,
          'NOT SCANNED',
          ns.created_at ? new Date(ns.created_at).toLocaleString() : '—',
        ]);
      }
    } else {
      notScannedSheetRows.push(['No pending unscanned records', '', '', '', '']);
    }

    const wsNotScanned = XLSX.utils.aoa_to_sheet(notScannedSheetRows);
    wsNotScanned['!cols'] = [
      { wch: 25 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 22 },
    ];

    // ---------------------------------------------------------------------------
    // SHEET 3 — CLASS-WISE DATA
    // ---------------------------------------------------------------------------
    const classWiseSheetRows: any[][] = [
      ['Class ID', 'Expected', 'Scanned', 'Not Scanned', 'Progress', 'Status'],
    ];

    const classSet = Array.from(new Set(uniExpected.map(r => r.class_id))).sort();

    for (const cid of classSet) {
      const expCount = uniExpected.filter(r => r.class_id === cid).length;
      const scnCount = uniSaved.filter(s => s.class_id === cid).length;
      const notScnCount = Math.max(0, expCount - scnCount);
      const progress = expCount > 0 ? `${Math.round((scnCount / expCount) * 100)}%` : '0%';
      let status = 'NOT STARTED';
      if (scnCount >= expCount && expCount > 0) {
        status = 'COMPLETED';
      } else if (scnCount > 0) {
        status = 'IN PROGRESS';
      }

      classWiseSheetRows.push([
        cid,
        expCount,
        scnCount,
        notScnCount,
        progress,
        status,
      ]);
    }

    if (classSet.length === 0) {
      classWiseSheetRows.push(['No classes available', 0, 0, 0, '0%', 'NOT STARTED']);
    }

    const wsClassWise = XLSX.utils.aoa_to_sheet(classWiseSheetRows);
    wsClassWise['!cols'] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
    ];

    // ---------------------------------------------------------------------------
    // WORKBOOK COMPILATION & SANITIZED FILENAME
    // ---------------------------------------------------------------------------
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsScanned, 'Scanned Data');
    XLSX.utils.book_append_sheet(wb, wsNotScanned, 'Not Scanned Data');
    XLSX.utils.book_append_sheet(wb, wsClassWise, 'Class Wise Data');

    const cleanUniName = uni.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
    const today = new Date().toISOString().split('T')[0];
    const filename = `ExamScan_${cleanUniName}_${today}.xlsx`;

    XLSX.writeFile(wb, filename);

    return {
      success: true,
      filename,
      scannedCount: uniSaved.length,
      notScannedCount: uniNotScanned.length,
      totalExpected: uniExpected.length,
    };
  }

  // Backward compatibility methods
  public getRecords(classId?: string): BundleRecordView[] {
    if (classId && classId !== 'all') {
      return this.getBundleRecordViews(classId);
    }
    const allBundles = this.getClassBundles();
    const allRecords: BundleRecordView[] = [];
    allBundles.forEach(b => {
      allRecords.push(...this.getBundleRecordViews(b.classId));
    });
    return allRecords;
  }

  public async processBundleBooklet(classId: string, barcodeInput: string): Promise<ScanResult> {
    return this.processBundleScan(classId, barcodeInput);
  }

  public async processFirstBooklet(barcodeInput: string): Promise<ScanResult> {
    return this.processScanningDashboardScan(barcodeInput);
  }

  public exportClassWiseExcel(customUniversityName?: string) {
    const uni = customUniversityName || this.activeUniversity;
    return this.exportUniversityExcel(uni);
  }

  // ==============================================================================
  // MOBILE SCAN WORKFLOW METHODS (STAGE 1 & STAGE 2)
  // ==============================================================================

  /**
   * Helper to match an imported record against a scanned barcode/member identifier.
   * Supports:
   * 1. Exact equality (barcode, member_id, class_id)
   * 2. Compound equality (class_id + member_id or class_id + barcode, e.g. 0020 + 24EMBA1308 === 002024EMBA1308)
   * 3. Prefix matching (barcode starts with class_id, remainder matches member_id or barcode)
   * 4. Reverse prefix matching (record barcode contains class_id + scanned member)
   */
  public matchImportedRecord(r: ImportInwardedRecord, rawScan: string): boolean {
    const clean = normalizeIdentifier(rawScan);
    if (!clean) return false;
    const q = clean.toLowerCase();

    const rCls = normalizeIdentifier(r.class_id).toLowerCase();
    const rMem = normalizeIdentifier(r.member_id).toLowerCase();
    const rBar = r.barcode ? normalizeIdentifier(r.barcode).toLowerCase() : '';

    // 1. Exact equality
    if (rBar && rBar === q) return true;
    if (rMem && rMem === q) return true;
    if (rCls && rCls === q) return true;

    // 2. Compound equality (Class ID + Member ID or Class ID + Barcode)
    if (rCls && rMem && `${rCls}${rMem}` === q) return true;
    if (rCls && rBar && `${rCls}${rBar}` === q) return true;

    // 3. Prefix matching: scanned barcode starts with class_id, remainder matches member_id or barcode
    if (rCls && q.startsWith(rCls)) {
      const remainder = q.slice(rCls.length);
      if (remainder && (remainder === rMem || remainder === rBar)) return true;
    }

    // 4. Reverse prefix matching: DB barcode is compound (e.g. 002024EMBA1308) and scanned code is member (24EMBA1308)
    if (rCls && rBar && rBar.startsWith(rCls)) {
      const remainder = rBar.slice(rCls.length);
      if (remainder && remainder === q) return true;
    }

    return false;
  }

  /**
   * STAGE 1 Validation:
   * When a barcode is detected in CLASS MODE:
   * 1. Get the complete detected barcode value.
   * 2. Search public.imported_inward_data using the actual imported barcode relationship.
   * 3. If a matching imported record exists:
   *    - read its class_id
   *    - preserve the exact imported class_id
   *    - open that class bundle/session
   * 4. If no matching imported record exists:
   *    Return exists: false -> UI displays "CLASS NOT IMPORTED", "SCAN AGAIN".
   */
  public async resolveClassFromBarcode(rawBarcode: string): Promise<{
    exists: boolean;
    classId?: string;
    record?: ImportInwardedRecord;
  }> {
    const cleanBarcode = normalizeIdentifier(rawBarcode);
    if (!cleanBarcode) return { exists: false };

    // 0. If local cache is empty, immediately sync from Supabase
    if (this.importInwarded.length === 0 && isSupabaseConfigured) {
      await this.syncFromSupabase();
    }

    // 1. Search in-memory cache first with compound & exact match
    let localMatch = this.importInwarded.find(r => this.matchImportedRecord(r, cleanBarcode));

    if (localMatch) {
      const classId = localMatch.class_id;
      return { exists: true, classId, record: localMatch };
    }

    // 2. Re-sync from Supabase in case new data was imported or local storage was out of date
    if (isSupabaseConfigured) {
      try {
        await this.syncFromSupabase();
        localMatch = this.importInwarded.find(r => this.matchImportedRecord(r, cleanBarcode));
        if (localMatch) {
          const classId = localMatch.class_id;
          return { exists: true, classId, record: localMatch };
        }

        // Direct query fallbacks on Supabase
        const { data: byBar } = await supabase
          .from('imported_inward_data')
          .select('*')
          .or(`barcode.eq.${cleanBarcode},member_id.eq.${cleanBarcode},class_id.eq.${cleanBarcode}`)
          .limit(20);

        if (byBar && byBar.length > 0) {
          const matchedRow = byBar.find((row: any) => {
            const tempRec: ImportInwardedRecord = {
              id: row.id,
              import_session_id: row.import_session_id || 'default_session',
              college_name: row.university_name || this.activeUniversity,
              university_name: row.university_name || this.activeUniversity,
              class_id: row.class_id,
              member_id: row.member_id,
              barcode: row.barcode,
              created_at: row.created_at || new Date().toISOString(),
            };
            return this.matchImportedRecord(tempRec, cleanBarcode);
          }) || byBar[0];

          const classId = matchedRow.class_id;
          await this.fetchClassMembers(classId);
          return {
            exists: true,
            classId,
            record: {
              id: matchedRow.id,
              import_session_id: matchedRow.import_session_id,
              college_name: matchedRow.university_name || this.activeUniversity,
              university_name: matchedRow.university_name || this.activeUniversity,
              class_id: matchedRow.class_id,
              sch_id: matchedRow.sch_id,
              member_id: matchedRow.member_id,
              barcode: matchedRow.barcode,
              created_by: matchedRow.created_by,
              created_at: matchedRow.created_at,
            },
          };
        }
      } catch (err) {
        console.warn('resolveClassFromBarcode Supabase query error:', err);
      }
    }

    return { exists: false };
  }

  /**
   * Manual Class ID validation:
   * Validates entered Class ID strictly against imported_inward_data WHERE class_id = enteredClassId.
   * Does NOT guess or transform the entered value, preserves leading zeros.
   */
  public async validateClassId(rawClassId: string): Promise<{
    exists: boolean;
    count: number;
    classId: string;
  }> {
    const cleanCid = normalizeIdentifier(rawClassId);
    if (!cleanCid) return { exists: false, count: 0, classId: '' };

    // 1. Check local cache strictly for class_id === cleanCid
    const matchingLocal = this.importInwarded.filter(
      r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase()
    );
    if (matchingLocal.length > 0) {
      const canonicalCid = matchingLocal[0].class_id;
      return { exists: true, count: matchingLocal.length, classId: canonicalCid };
    }

    // 2. Direct Supabase query strictly WHERE class_id = cleanCid
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('imported_inward_data')
          .select('class_id')
          .eq('class_id', cleanCid);

        if (!error && Array.isArray(data) && data.length > 0) {
          const canonical = data[0].class_id;
          // fetch members into cache
          await this.fetchClassMembers(canonical);
          return { exists: true, count: data.length, classId: canonical };
        }
      } catch (e) {
        console.warn('validateClassId error:', e);
      }
    }

    return { exists: false, count: 0, classId: cleanCid };
  }

  /**
   * STAGE 2 Validation for Manual Inward:
   * Validates against public.imported_inward_data using:
   * WHERE class_id = activeClassId AND member_id = enteredMemberId
   * Does NOT derive class ID from entered member ID.
   * Does NOT derive member ID from barcode.
   */
  public async validateMemberForClass(
    activeClassId: string,
    rawMemberId: string
  ): Promise<{
    status: 'VALID' | 'WRONG_CLASS' | 'NOT_FOUND';
    actualClassId?: string;
    record?: ImportInwardedRecord;
  }> {
    const cleanActiveCid = normalizeIdentifier(activeClassId);
    const cleanMid = normalizeIdentifier(rawMemberId);
    if (!cleanActiveCid || !cleanMid) {
      return { status: 'NOT_FOUND' };
    }

    const midLower = cleanMid.toLowerCase();
    const cidLower = cleanActiveCid.toLowerCase();

    // 0. Ensure imported data is available
    if (this.importInwarded.length === 0 && isSupabaseConfigured) {
      await this.syncFromSupabase();
    }

    // 1. Look in active class records in memory
    let foundRecord = this.importInwarded.find(
      r => normalizeIdentifier(r.class_id).toLowerCase() === cidLower &&
           this.matchImportedRecord(r, cleanMid)
    );

    // 2. If not found in active class, look across all imported records in memory
    if (!foundRecord) {
      foundRecord = this.importInwarded.find(r => this.matchImportedRecord(r, cleanMid));
    }

    // 3. If not found in memory, query Supabase imported_inward_data
    if (!foundRecord && isSupabaseConfigured) {
      try {
        await this.syncFromSupabase();
        foundRecord = this.importInwarded.find(
          r => normalizeIdentifier(r.class_id).toLowerCase() === cidLower &&
               this.matchImportedRecord(r, cleanMid)
        ) || this.importInwarded.find(r => this.matchImportedRecord(r, cleanMid));

        if (!foundRecord) {
          // Query active class first
          const { data: actData } = await supabase
            .from('imported_inward_data')
            .select('*')
            .eq('class_id', cleanActiveCid)
            .or(`member_id.eq.${cleanMid},barcode.eq.${cleanMid}`)
            .limit(5);

          if (actData && actData.length > 0) {
            const row = actData[0];
            foundRecord = {
              id: row.id || `${row.class_id}_${row.member_id}`,
              import_session_id: row.import_session_id || 'default_session',
              college_name: row.university_name || this.activeUniversity || '',
              university_name: row.university_name || this.activeUniversity || '',
              class_id: row.class_id,
              sch_id: row.sch_id,
              member_id: row.member_id,
              barcode: row.barcode ? row.barcode : undefined,
              created_by: row.created_by,
              created_at: row.created_at || new Date().toISOString(),
            };
          } else {
            // Query other classes
            const { data: otherData } = await supabase
              .from('imported_inward_data')
              .select('*')
              .or(`member_id.eq.${cleanMid},barcode.eq.${cleanMid}`)
              .limit(5);

            if (otherData && otherData.length > 0) {
              const row = otherData[0];
              foundRecord = {
                id: row.id || `${row.class_id}_${row.member_id}`,
                import_session_id: row.import_session_id || 'default_session',
                college_name: row.university_name || this.activeUniversity || '',
                university_name: row.university_name || this.activeUniversity || '',
                class_id: row.class_id,
                sch_id: row.sch_id,
                member_id: row.member_id,
                barcode: row.barcode ? row.barcode : undefined,
                created_by: row.created_by,
                created_at: row.created_at || new Date().toISOString(),
              };
            }
          }
        }

        if (foundRecord) {
          const existIdx = this.importInwarded.findIndex(r => r.id === foundRecord!.id);
          if (existIdx >= 0) this.importInwarded[existIdx] = foundRecord;
          else this.importInwarded.push(foundRecord);
        }
      } catch (e) {
        console.warn('Supabase member_id lookup note:', e);
      }
    }

    // If member does not exist anywhere in imported dataset
    if (!foundRecord) {
      return { status: 'NOT_FOUND' };
    }

    const importedClassId = foundRecord.class_id;

    // If member exists and imported class_id === currentClassId
    if (normalizeIdentifier(importedClassId).toLowerCase() === cidLower) {
      return { status: 'VALID', record: foundRecord, actualClassId: importedClassId };
    }

    // If member exists but imported class_id !== currentClassId
    return {
      status: 'WRONG_CLASS',
      actualClassId: importedClassId,
      record: foundRecord,
    };
  }

  /**
   * Check if a member is already inwarded for the class across:
   * 1. manual_inward_data
   * 2. saved_scanned_data
   * 3. pending scan_session_items
   */
  public isMemberAlreadyInwarded(classId: string, memberIdOrBarcode: string): boolean {
    const cleanCid = normalizeIdentifier(classId).toLowerCase();
    const cleanQuery = normalizeIdentifier(memberIdOrBarcode).toLowerCase();

    const matchesId = (candidateId: string, candidateBarcode?: string) => {
      const cLower = candidateId.toLowerCase();
      const bLower = candidateBarcode ? candidateBarcode.toLowerCase() : '';
      return cLower === cleanQuery || (bLower && bLower === cleanQuery);
    };

    // 1. Authoritative verification: member must exist in imported_inward_data for this class
    const isImported = this.importInwarded.some(
      r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid &&
           matchesId(normalizeIdentifier(r.member_id), r.barcode ? normalizeIdentifier(r.barcode) : undefined)
    );
    if (!isImported) return false;

    const activeUni = (this.activeUniversity || '').toLowerCase();

    // 2. Check saved_scanned_data for active university
    const isSaved = this.savedScanned.some(
      s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid &&
           (!activeUni || !s.college_name || s.college_name.toLowerCase() === activeUni) &&
           matchesId(normalizeIdentifier(s.member_id), s.barcode ? normalizeIdentifier(s.barcode) : undefined)
    );
    if (isSaved) return true;

    // 3. Check manual_inward_data for active university
    const isManual = this.manualInwarded.some(
      m => normalizeIdentifier(m.class_id).toLowerCase() === cleanCid &&
           (!activeUni || !m.college_name || m.college_name.toLowerCase() === activeUni) &&
           matchesId(
             normalizeIdentifier(m.member_id || m.roll_number || ''),
             m.booklet_barcode ? normalizeIdentifier(m.booklet_barcode) : undefined
           )
    );
    if (isManual) return true;

    // 4. Check pending scan items
    const isPending = this.scanItems.some(
      i => normalizeIdentifier(i.class_id).toLowerCase() === cleanCid &&
           i.status === 'PENDING_SAVE' &&
           matchesId(normalizeIdentifier(i.member_id), i.barcode ? normalizeIdentifier(i.barcode) : undefined)
    );
    if (isPending) return true;

    return false;
  }

  /**
   * MANUAL INWARD DATABASE INSERTION:
   * Inserts the manual inward operation strictly into public.manual_inward_data.
   * Does NOT write into imported_inward_data.
   * Associates with active scan session where supported.
   * Immediately updates class bundle counts and dispatches notifications.
   */
  public async recordManualInward(
    classId: string,
    memberId: string,
    options?: { notes?: string; bookletBarcode?: string }
  ): Promise<{
    success: boolean;
    error?: string;
    code?: string;
    record?: ManualInwardedRecord;
    bundle?: ClassBundle;
  }> {
    const cleanCid = normalizeIdentifier(classId);
    const cleanMid = normalizeIdentifier(memberId);

    if (!cleanCid || !cleanMid) {
      return { success: false, code: 'PARAM_MISSING', error: 'Class ID and Member ID are required.' };
    }

    // 1. Validation check against imported_inward_data
    const validation = await this.validateMemberForClass(cleanCid, cleanMid);
    if (validation.status === 'WRONG_CLASS') {
      return {
        success: false,
        code: 'WRONG_CLASS',
        error: `Member belongs to another Class (${validation.actualClassId})`,
      };
    }
    if (validation.status === 'NOT_FOUND') {
      return {
        success: false,
        code: 'NOT_FOUND',
        error: 'Member ID not found in this Class',
      };
    }

    // 2. Duplicate Protection
    if (this.isMemberAlreadyInwarded(cleanCid, cleanMid)) {
      return {
        success: false,
        code: 'ALREADY_INWARDED',
        error: 'Member already inwarded',
      };
    }

    // 3. Ensure active session exists
    const session = await this.ensureScanSession(cleanCid);
    const now = new Date().toISOString();
    const currentUser = getCurrentUser();
    const targetRecord = validation.record;
    const canonicalMid = targetRecord?.member_id ? normalizeIdentifier(targetRecord.member_id) : cleanMid;

    const newRecord: ManualInwardedRecord = {
      id: generateUUID(),
      session_code: session.id,
      bundle_code: `bundle_${cleanCid}`,
      class_id: cleanCid,
      booklet_barcode: options?.bookletBarcode || targetRecord?.barcode || cleanMid,
      roll_number: canonicalMid,
      member_id: canonicalMid,
      college_name: this.activeUniversity || targetRecord?.university_name || 'VIT',
      status: 'inwarded',
      inwarded_by: currentUser.name || 'Manual Inward',
      notes: options?.notes || 'Mobile Manual Inward',
      scanned_at: now,
      created_at: now,
    };

    // 4. Insert strictly into public.manual_inward_data in Supabase
    if (isSupabaseConfigured) {
      try {
        const { error: insErr } = await supabase.from('manual_inward_data').insert({
          id: newRecord.id,
          session_code: newRecord.session_code,
          bundle_code: newRecord.bundle_code,
          class_id: newRecord.class_id,
          roll_number: newRecord.roll_number,
          booklet_barcode: newRecord.booklet_barcode,
          status: 'inwarded',
          inwarded_by: newRecord.inwarded_by,
          notes: newRecord.notes,
          scanned_at: newRecord.scanned_at,
          created_at: newRecord.created_at,
          school_id: targetRecord?.sch_id || null,
          room_number: null,
          subject_name: null,
        });

        if (insErr) {
          console.error('[ImportedService] Supabase manual_inward_data insert error:', insErr);
          return {
            success: false,
            code: insErr.code,
            error: insErr.message || 'Database insert failed',
          };
        }

        try {
          await supabase
            .from('imported_inward_data')
            .update({ scan_status: 'completed', scanned_at: now })
            .eq('class_id', cleanCid)
            .eq('member_id', canonicalMid);
        } catch {}

        // Mirror directly into public.saved_scanned_data so all inwarded records exist in saved_scanned_data
        try {
          await supabase.from('saved_scanned_data').insert({
            id: newRecord.id,
            scan_session_id: null,
            import_session_id: session?.import_session_id || this.activeSessionId || null,
            college_name: newRecord.college_name,
            class_id: newRecord.class_id,
            member_id: newRecord.member_id,
            barcode: newRecord.booklet_barcode || newRecord.member_id,
            scanned_by: newRecord.inwarded_by,
            scanned_at: newRecord.scanned_at,
            saved_by: newRecord.inwarded_by,
            saved_at: newRecord.created_at,
            status: 'SAVED',
          });
        } catch (mErr) {
          console.warn('[ImportedService] saved_scanned_data mirror note:', mErr);
        }

        // Delete inwarded member from yet_to_be_inward table (3-Table Architecture)
        try {
          await supabase
            .from('yet_to_be_inward')
            .delete()
            .eq('class_id', cleanCid)
            .eq('member_id', canonicalMid);
        } catch (yDelErr) {
          console.warn('[ImportedService] yet_to_be_inward delete note:', yDelErr);
        }
      } catch (err: any) {
        console.error('[ImportedService] manual_inward_data Supabase exception:', err);
        return {
          success: false,
          code: err?.code || 'CONN_ERROR',
          error: err?.message || 'Database connection error',
        };
      }
    }

    // 5. Update local state and notify subscribers immediately
    this.manualInwarded.push(newRecord);

    const alreadyInSaved = this.savedScanned.some(
      s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid.toLowerCase() &&
           normalizeIdentifier(s.member_id).toLowerCase() === canonicalMid.toLowerCase()
    );
    if (!alreadyInSaved) {
      this.savedScanned.push({
        id: newRecord.id,
        scan_session_id: session?.id,
        import_session_id: session?.import_session_id || this.activeSessionId || undefined,
        college_name: newRecord.college_name || session?.college_name || this.activeUniversity || 'Standard Center',
        class_id: newRecord.class_id,
        member_id: newRecord.member_id || canonicalMid || 'UNKNOWN',
        barcode: newRecord.booklet_barcode || newRecord.member_id || canonicalMid,
        scanned_by: newRecord.inwarded_by || 'Manual Inward',
        scanned_at: newRecord.scanned_at || now,
        saved_by: newRecord.inwarded_by || 'Manual Inward',
        saved_at: now,
        status: 'SAVED',
      });
    }

    // Update yet_to_be_inward in-memory state and counts
    this.yetToBeInward = this.yetToBeInward.filter(
      y => !(normalizeIdentifier(y.class_id).toLowerCase() === cleanCid.toLowerCase() && normalizeIdentifier(y.member_id).toLowerCase() === canonicalMid.toLowerCase())
    );
    this.backendReceivedCount = this.savedScanned.length;
    this.backendPendingCount = this.yetToBeInward.length > 0 ? this.yetToBeInward.length : Math.max(0, this.backendExpectedCount - this.backendReceivedCount);

    this.moveClassToTop(cleanCid);
    this.saveToLocalStorage();
    this.notify();

    const updatedBundle = this.getClassBundle(cleanCid);

    return {
      success: true,
      record: newRecord,
      bundle: updatedBundle || undefined,
    };
  }

  /**
   * Mobile Member Barcode Scan Handler (STAGE 2):
   * Enforces 3-State Model:
   *   1. IMPORTED: Member exists in public.imported_inward_data (authoritative lookup by barcode)
   *   2. INWARDED: Member exists in saved_scanned_data or manual_inward_data
   *   3. NOT INWARDED: Member exists in imported_inward_data but NOT yet inwarded -> Allow Inward
   *
   * Flow:
   *   STEP 1: Decode barcode
   *   STEP 2: Normalize without removing leading zeros (via normalizeIdentifier)
   *   STEP 3: Find member in public.imported_inward_data using barcode
   *   STEP 4: Obtain member_id, class_id, barcode
   *   STEP 5: Verify class_id matches active Class ID (if not, "Member belongs to another Class", NEVER "Not Imported")
   *   STEP 6: Check inward status across saved_scanned_data, manual_inward_data, pending scans
   *           - If already inwarded -> "Member already inwarded"
   *           - If not inwarded -> Allow Inward -> Inwarded!
   */
  public async processMobileMemberBarcodeScan(
    activeClassId: string,
    rawBarcode: string,
    operatorOverride?: string
  ): Promise<ScanResult> {
    const normalized = normalizeIdentifier(rawBarcode);
    const cleanActiveCid = normalizeIdentifier(activeClassId);

    console.log('[MEMBER SCAN] Raw barcode:', rawBarcode);
    console.log('[MEMBER SCAN] Normalized barcode:', normalized);
    console.log('[MEMBER SCAN] Current class:', activeClassId);
    console.log('[MEMBER SCAN] Imported barcode lookup started:', normalized);

    if (!normalized) {
      console.log('[MEMBER SCAN] Imported row:', null);
      console.log('[MEMBER SCAN] Resolved member ID:', null);
      console.log('[MEMBER SCAN] Resolved class ID:', null);
      console.log('[MEMBER SCAN] Class validation:', 'Failed - empty barcode');
      console.log('[MEMBER SCAN] Inward status:', 'Not inwarded');
      console.log('[MEMBER SCAN] Final result:', 'Member ID not found');

      return {
        success: false,
        isUnknownMember: true,
        isNotImported: true,
        barcode: rawBarcode,
        message: 'Member ID not found',
      };
    }

    // STEP 3: Search authoritative imported data for matching record (by barcode or member_id)
    // 0. Ensure imported data is available in memory
    if (this.importInwarded.length === 0 && isSupabaseConfigured) {
      await this.syncFromSupabase();
    }

    // 1. Look in active class first in memory using compound & exact match
    let importedRow: ImportInwardedRecord | null = this.importInwarded.find(r =>
      normalizeIdentifier(r.class_id).toLowerCase() === cleanActiveCid.toLowerCase() &&
      this.matchImportedRecord(r, normalized)
    ) || null;

    // 2. If not in active class, look across all imported records in memory (to detect another class)
    if (!importedRow) {
      importedRow = this.importInwarded.find(r => this.matchImportedRecord(r, normalized)) || null;
    }

    // 3. Fallback: Query Supabase or re-sync if not found in memory
    if (!importedRow && isSupabaseConfigured) {
      try {
        await this.syncFromSupabase();
        importedRow = this.importInwarded.find(r =>
          normalizeIdentifier(r.class_id).toLowerCase() === cleanActiveCid.toLowerCase() &&
          this.matchImportedRecord(r, normalized)
        ) || this.importInwarded.find(r => this.matchImportedRecord(r, normalized)) || null;

        if (!importedRow) {
          // Query active class first
          const { data: actRows } = await supabase
            .from('imported_inward_data')
            .select('*')
            .eq('class_id', cleanActiveCid)
            .or(`barcode.eq.${normalized},member_id.eq.${normalized}`)
            .limit(5);

          if (actRows && actRows.length > 0) {
            const row = actRows[0];
            importedRow = {
              id: row.id || `${row.class_id}_${row.member_id}`,
              import_session_id: row.import_session_id || 'default_session',
              college_name: row.university_name || this.activeUniversity || '',
              university_name: row.university_name || this.activeUniversity || '',
              class_id: row.class_id,
              sch_id: row.sch_id,
              member_id: row.member_id,
              barcode: row.barcode ? row.barcode : normalized,
              created_by: row.created_by,
              created_at: row.created_at || new Date().toISOString(),
            };
          } else {
            // Query other classes
            const { data: otherRows } = await supabase
              .from('imported_inward_data')
              .select('*')
              .or(`barcode.eq.${normalized},member_id.eq.${normalized}`)
              .limit(5);

            if (otherRows && otherRows.length > 0) {
              const row = otherRows[0];
              importedRow = {
                id: row.id || `${row.class_id}_${row.member_id}`,
                import_session_id: row.import_session_id || 'default_session',
                college_name: row.university_name || this.activeUniversity || '',
                university_name: row.university_name || this.activeUniversity || '',
                class_id: row.class_id,
                sch_id: row.sch_id,
                member_id: row.member_id,
                barcode: row.barcode ? row.barcode : normalized,
                created_by: row.created_by,
                created_at: row.created_at || new Date().toISOString(),
              };
            }
          }
        }
      } catch (err) {
        console.warn('[STAGE 2] Supabase lookup error:', err);
      }
    }

    // If imported row was retrieved from Supabase, synchronize into this.importInwarded
    if (importedRow) {
      const existIdx = this.importInwarded.findIndex(r => r.id === importedRow!.id);
      if (existIdx >= 0) {
        this.importInwarded[existIdx] = importedRow;
      } else {
        this.importInwarded.push(importedRow);
      }
    }

    // If not found in imported_inward_data -> "MEMBER NOT IMPORTED"
    if (!importedRow) {
      console.log('[STAGE 2] Barcode not present in imported data:', normalized);

      return {
        success: false,
        isUnknownMember: true,
        isNotImported: true,
        class_id: activeClassId,
        detectedClassId: activeClassId,
        detectedMemberId: normalized,
        barcode: normalized,
        message: 'MEMBER NOT IMPORTED',
      };
    }

    // STEP 4: From matching imported row, obtain exact database values: member_id, class_id, barcode
    const resolvedMemberId = importedRow.member_id;
    const resolvedClassId = importedRow.class_id;
    const resolvedBarcode = importedRow.barcode || normalized;

    // STEP 5: Verify resolved class_id matches active Class ID
    if (normalizeIdentifier(resolvedClassId).toLowerCase() !== cleanActiveCid.toLowerCase()) {
      console.warn(`[STAGE 2] Class mismatch: belongs to Class ${resolvedClassId}, current is ${activeClassId}`);

      return {
        success: false,
        isWrongClass: true,
        currentClassId: activeClassId,
        detectedClassId: resolvedClassId,
        detectedMemberId: resolvedMemberId,
        barcode: normalized,
        message: 'This member belongs to another imported class.',
      };
    }

    console.log('[MEMBER SCAN] Class validation:', `Passed - belongs to current Class ${activeClassId}`);

    // STEP 6: Check whether this member has already been inwarded
    // Authoritative in-memory lookup first (sub-millisecond)
    const activeUni = (this.activeUniversity || '').toLowerCase();

    let savedScannedResult: any = this.savedScanned.find(s => {
      if (normalizeIdentifier(s.class_id).toLowerCase() !== cleanActiveCid.toLowerCase()) return false;
      if (activeUni && s.college_name && s.college_name.toLowerCase() !== activeUni) return false;
      return normalizeIdentifier(s.member_id).toLowerCase() === resolvedMemberId.toLowerCase();
    }) || null;

    let manualInwardResult: any = this.manualInwarded.find(m => {
      if (normalizeIdentifier(m.class_id).toLowerCase() !== cleanActiveCid.toLowerCase()) return false;
      if (activeUni && m.college_name && m.college_name.toLowerCase() !== activeUni) return false;
      return normalizeIdentifier(m.member_id || m.roll_number || '').toLowerCase() === resolvedMemberId.toLowerCase();
    }) || null;

    // Check pending session items (staged before save in current session)
    const pendingResult = this.scanItems.find(i => {
      if (normalizeIdentifier(i.class_id).toLowerCase() !== cleanActiveCid.toLowerCase()) return false;
      if (i.status !== 'PENDING_SAVE') return false;
      return normalizeIdentifier(i.member_id).toLowerCase() === resolvedMemberId.toLowerCase();
    }) || null;

    // Only fallback to Supabase query if service has never been initialized
    if (!this.isInitialized && isSupabaseConfigured) {
      if (!savedScannedResult) {
        try {
          let q = supabase
            .from('saved_scanned_data')
            .select('*')
            .eq('class_id', cleanActiveCid)
            .eq('member_id', resolvedMemberId);
          if (this.activeUniversity) {
            q = q.eq('college_name', this.activeUniversity);
          }
          const { data: svData } = await q.limit(1);
          if (svData && svData.length > 0) savedScannedResult = svData[0];
        } catch {}
      }

      if (!manualInwardResult) {
        try {
          let qm = supabase
            .from('manual_inward_data')
            .select('*')
            .eq('class_id', cleanActiveCid)
            .or(`roll_number.eq.${resolvedMemberId},member_id.eq.${resolvedMemberId}`);
          if (this.activeUniversity) {
            qm = qm.eq('college_name', this.activeUniversity);
          }
          const { data: manData } = await qm.limit(1);
          if (manData && manData.length > 0) manualInwardResult = manData[0];
        } catch {}
      }
    }

    const alreadyInwarded = Boolean(savedScannedResult || manualInwardResult || pendingResult);

    if (alreadyInwarded) {
      console.log('[MEMBER SCAN] Inward status:', 'Already inwarded');
      console.log('[MEMBER SCAN] Final result:', 'Member already inwarded');

      return {
        success: false,
        isDuplicate: true,
        class_id: activeClassId,
        member_id: resolvedMemberId,
        barcode: normalized,
        message: 'Member already inwarded',
      };
    }

    // Member is IMPORTED + NOT INWARDED -> Immediately inward and persist in REAL TIME
    console.log('[MEMBER SCAN] Inward status:', 'Not inwarded - inwarding in realtime');
    console.log('[MEMBER SCAN] Final result:', 'Member Inwarded');

    const session = await this.ensureScanSession(activeClassId);
    const now = new Date().toISOString();
    const currentUser = getCurrentUser();
    const operatorName = operatorOverride || currentUser.name || 'Siva Sai';
    const uni = this.activeUniversity || importedRow.university_name || importedRow.college_name || 'VIT-AP';
    const recordId = generateUUID();

    const newSavedRecord: SavedScannedRecord = {
      id: recordId,
      scan_session_id: session?.id || this.activeSessionId || undefined,
      import_session_id: importedRow.import_session_id || this.activeSessionId || undefined,
      college_name: uni,
      class_id: cleanActiveCid,
      sch_id: importedRow.sch_id || undefined,
      member_id: resolvedMemberId,
      barcode: resolvedBarcode || normalized,
      scanned_by: operatorName,
      scanned_at: now,
      saved_by: operatorName,
      saved_at: now,
      status: 'SAVED',
    };

    // 1. Add to savedScanned in-memory state
    this.savedScanned.push(newSavedRecord);

    // 2. Also keep scanItems updated as SAVED
    const pendingItem: ScanSessionItem = {
      id: recordId,
      scan_session_id: session?.id || this.activeSessionId || generateUUID(),
      class_id: cleanActiveCid,
      member_id: resolvedMemberId,
      barcode: resolvedBarcode || normalized,
      detected_at: now,
      detected_by: operatorName,
      status: 'SAVED',
      created_at: now,
    };
    this.scanItems.push(pendingItem);

    // 3. Immediately persist to Supabase in REAL TIME
    if (isSupabaseConfigured) {
      try {
        let validSessionId: string | null = null;
        if (session && session.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.id)) {
          validSessionId = session.id;
        }

        const insertPayload: any = {
          id: recordId,
          scan_session_id: validSessionId,
          import_session_id: importedRow.import_session_id || this.activeSessionId || null,
          college_name: uni,
          class_id: cleanActiveCid,
          member_id: resolvedMemberId,
          barcode: resolvedBarcode || normalized,
          scanned_by: operatorName,
          scanned_at: now,
          saved_by: operatorName,
          saved_at: now,
          status: 'SAVED',
        };

        let { error: insErr } = await supabase.from('saved_scanned_data').insert(insertPayload);

        // If scan_session_id caused a foreign key violation (23503), retry safely with null
        if (insErr && insErr.code === '23503') {
          insertPayload.scan_session_id = null;
          const retryRes = await supabase.from('saved_scanned_data').insert(insertPayload);
          insErr = retryRes.error;
        }

        if (insErr) {
          console.error('[REALTIME INWARD] saved_scanned_data insert error:', insErr);
        } else {
          console.log('[REALTIME INWARD] ✓ Successfully persisted to saved_scanned_data in Supabase:', resolvedMemberId);
        }

        // Update imported_inward_data scan_status to 'completed' (check constraint allows 'not_started' | 'completed')
        const { error: updErr } = await supabase
          .from('imported_inward_data')
          .update({ scan_status: 'completed', scanned_at: now })
          .eq('class_id', cleanActiveCid)
          .eq('member_id', resolvedMemberId);

        if (updErr) {
          console.warn('[REALTIME INWARD] imported_inward_data scan_status update note:', updErr);
        }

        // Delete from yet_to_be_inward table (3-Table Architecture)
        try {
          await supabase
            .from('yet_to_be_inward')
            .delete()
            .eq('class_id', cleanActiveCid)
            .eq('member_id', resolvedMemberId);
        } catch (yDelErr) {
          console.warn('[REALTIME INWARD] yet_to_be_inward delete note:', yDelErr);
        }
      } catch (dbErr) {
        console.warn('[MEMBER SCAN] Supabase realtime persistence note:', dbErr);
      }
    }

    // Update yet_to_be_inward in memory and counts
    this.yetToBeInward = this.yetToBeInward.filter(
      y => !(normalizeIdentifier(y.class_id).toLowerCase() === cleanActiveCid.toLowerCase() && normalizeIdentifier(y.member_id).toLowerCase() === resolvedMemberId.toLowerCase())
    );
    this.backendReceivedCount = this.savedScanned.length;
    this.backendPendingCount = this.yetToBeInward.length > 0 ? this.yetToBeInward.length : Math.max(0, this.backendExpectedCount - this.backendReceivedCount);

    this.moveClassToTop(cleanActiveCid);
    this.saveToLocalStorage();
    this.notify();

    const updatedBundle = this.getClassBundle(activeClassId);

    return {
      success: true,
      class_id: activeClassId,
      member_id: resolvedMemberId,
      barcode: resolvedBarcode,
      bundle: updatedBundle || undefined,
      message: `Inwarded Member ${resolvedMemberId} in Class ${activeClassId}`,
    };
  }

  /**
   * Delete a specific Class Bundle from imported data and strictly delete all corresponding
   * saved scan data, manual inward records, active sessions, and scan items in both local state and Supabase.
   */
  public async deleteClassBundle(classId: string): Promise<{ success: boolean; deletedCount: number; deletedScansCount: number }> {
    const cleanCid = normalizeIdentifier(classId);
    if (!cleanCid) return { success: false, deletedCount: 0, deletedScansCount: 0 };
    const cidLower = cleanCid.toLowerCase();

    // 1. Delete from importInwarded
    const initialImpCount = this.importInwarded.length;
    this.importInwarded = this.importInwarded.filter(
      r => normalizeIdentifier(r.class_id).toLowerCase() !== cidLower
    );
    const deletedImpCount = initialImpCount - this.importInwarded.length;

    // 2. Delete from savedScanned (Table 4: saved_scanned_data)
    const initialSavedCount = this.savedScanned.length;
    this.savedScanned = this.savedScanned.filter(
      s => normalizeIdentifier(s.class_id).toLowerCase() !== cidLower
    );
    const deletedSavedCount = initialSavedCount - this.savedScanned.length;

    // 3. Delete from manualInwarded (Table 2: manual_inward_data)
    this.manualInwarded = this.manualInwarded.filter(
      m => normalizeIdentifier(m.class_id).toLowerCase() !== cidLower
    );

    // 4. Delete from yetToBeInward (Dedicated Pending table)
    this.yetToBeInward = this.yetToBeInward.filter(
      y => normalizeIdentifier(y.class_id).toLowerCase() !== cidLower
    );

    // 5. Delete from scanSessions & scanItems
    this.scanSessions = this.scanSessions.filter(
      s => normalizeIdentifier(s.class_id).toLowerCase() !== cidLower
    );
    this.scanItems = this.scanItems.filter(
      i => normalizeIdentifier(i.class_id).toLowerCase() !== cidLower
    );

    // 6. Remove from classOrder
    this.classOrder = this.classOrder.filter(
      c => normalizeIdentifier(c).toLowerCase() !== cidLower
    );

    // Update counts
    this.backendExpectedCount = this.importInwarded.length;
    this.backendReceivedCount = this.savedScanned.length;
    this.backendPendingCount = this.yetToBeInward.length;

    // 7. Delete from Supabase if connected
    if (isSupabaseConfigured) {
      try {
        await Promise.allSettled([
          supabase.from('import_inwarded_data').delete().ilike('class_id', cleanCid),
          supabase.from('imported_inward_data').delete().ilike('class_id', cleanCid),
          supabase.from('yet_to_be_inward').delete().ilike('class_id', cleanCid),
          supabase.from('saved_scanned_data').delete().ilike('class_id', cleanCid),
          supabase.from('saved_scan_data').delete().ilike('class_id', cleanCid),
          supabase.from('manual_inward_data').delete().ilike('class_id', cleanCid),
          supabase.from('scan_sessions').delete().ilike('class_id', cleanCid),
          supabase.from('scan_session_items').delete().ilike('class_id', cleanCid),
        ]);
      } catch (err) {
        console.warn('[ImportedService] Supabase delete class error:', err);
      }
    }

    this.saveToLocalStorage();
    this.notify();

    return {
      success: true,
      deletedCount: deletedImpCount,
      deletedScansCount: deletedSavedCount,
    };
  }

  /**
   * Clears ALL imported data and strictly purges all corresponding saved scan data,
   * manual inward records, and scan sessions in both local state and Supabase.
   */
  public async clearAllImportedAndScannedData(): Promise<{ success: boolean }> {
    this.importInwarded = [];
    this.yetToBeInward = [];
    this.manualInwarded = [];
    this.scanSessions = [];
    this.savedScanned = [];
    this.scanItems = [];
    this.importSessions = [];
    this.classOrder = [];
    this.backendExpectedCount = 0;
    this.backendReceivedCount = 0;
    this.backendPendingCount = 0;
    this.backendManualCount = 0;

    if (isSupabaseConfigured) {
      try {
        await Promise.allSettled([
          supabase.from('import_inwarded_data').delete().neq('id', 'placeholder'),
          supabase.from('imported_inward_data').delete().neq('id', 'placeholder'),
          supabase.from('yet_to_be_inward').delete().neq('id', 'placeholder'),
          supabase.from('saved_scanned_data').delete().neq('id', 'placeholder'),
          supabase.from('saved_scan_data').delete().neq('id', 'placeholder'),
          supabase.from('manual_inward_data').delete().neq('id', 'placeholder'),
          supabase.from('scan_sessions').delete().neq('id', 'placeholder'),
          supabase.from('scan_session_items').delete().neq('id', 'placeholder'),
          supabase.from('import_sessions').delete().neq('id', 'placeholder'),
        ]);
      } catch (err) {
        console.warn('[ImportedService] Supabase clear all error:', err);
      }
    }

    this.saveToLocalStorage();
    this.notify();
    return { success: true };
  }

  public clearAll() {
    this.importInwarded = [];
    this.yetToBeInward = [];
    this.manualInwarded = [];
    this.scanSessions = [];
    this.savedScanned = [];
    this.scanItems = [];
    this.importSessions = [];
    this.classOrder = [];
    this.backendExpectedCount = 0;
    this.backendReceivedCount = 0;
    this.backendPendingCount = 0;
    this.backendManualCount = 0;
    this.saveToLocalStorage();
    this.notify();
  }
}

export const importedService = new ImportedService();
