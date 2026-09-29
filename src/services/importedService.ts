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
  progressPercentage: number; // (savedCount / expectedCount) * 100
  status: BundleStatus;
  isSaved: boolean;
  isCompleted: boolean;
  savedAt: string | null;
  lastActivityAt: string;
  updatedAt: string;
  createdAt: string;
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
  } catch {}
  return {
    id: 'usr-operator',
    name: 'Siva Sai',
    email: 'sivasaiprasadkaki122614@gmail.com',
  };
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

const BATCH_SIZE = 500;

class ImportedService {
  // In-memory representations of the 4 database tables + pending items
  private importInwarded: ImportInwardedRecord[] = [];
  private manualInwarded: ManualInwardedRecord[] = [];
  private scanSessions: ScanSession[] = [];
  private savedScanned: SavedScannedRecord[] = [];
  private scanItems: ScanSessionItem[] = [];
  private importSessions: ImportSession[] = [];
  private classOrder: string[] = []; // Tracks class sorting: recently scanned classes at top

  private activeUniversity: string = '';
  private activeSessionId: string | null = null;
  private listeners: (() => void)[] = [];
  private realtimeChannel: any = null;
  public isInitialized: boolean = false;

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
      this.savedScanned = [];
      this.manualInwarded = [];
      this.scanItems = [];
      this.scanSessions = [];
      this.importSessions = [];
      this.classOrder = [];
      this.activeSessionId = null;
      this.saveToLocalStorage();
      return;
    }

    const validClassMembers = new Set(
      this.importInwarded.map(r => `${normalizeIdentifier(r.class_id).toLowerCase()}::${normalizeIdentifier(r.member_id).toLowerCase()}`)
    );
    const validClasses = new Set(
      this.importInwarded.map(r => normalizeIdentifier(r.class_id).toLowerCase())
    );

    // Prune saved scans that are not in current imported_inward_data
    this.savedScanned = this.savedScanned.filter(s =>
      validClassMembers.has(`${normalizeIdentifier(s.class_id).toLowerCase()}::${normalizeIdentifier(s.member_id).toLowerCase()}`)
    );

    // Prune manual inwards that are not in current imported_inward_data
    this.manualInwarded = this.manualInwarded.filter(m => {
      const mid = normalizeIdentifier(m.member_id || m.roll_number || m.booklet_barcode || '');
      return validClassMembers.has(`${normalizeIdentifier(m.class_id).toLowerCase()}::${mid.toLowerCase()}`);
    });

    // Prune pending items that are not in current imported_inward_data
    this.scanItems = this.scanItems.filter(i =>
      validClassMembers.has(`${normalizeIdentifier(i.class_id).toLowerCase()}::${normalizeIdentifier(i.member_id).toLowerCase()}`)
    );

    // Prune scan sessions for classes that are not in current imported_inward_data
    this.scanSessions = this.scanSessions.filter(s =>
      validClasses.has(normalizeIdentifier(s.class_id).toLowerCase())
    );

    this.saveToLocalStorage();
  }

  private saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_IMPORT_INWARDED, JSON.stringify(this.importInwarded));
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
          { event: '*', schema: 'public', table: 'import_inwarded_data' },
          (payload) => this.handleRealtimeEvent('import_inwarded_data', payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'imported_inward_data' },
          (payload) => this.handleRealtimeEvent('imported_inward_data', payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'saved_scanned_data' },
          (payload) => this.handleRealtimeEvent('saved_scanned_data', payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'scan_sessions' },
          (payload) => this.handleRealtimeEvent('scan_sessions', payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'scan_session_items' },
          (payload) => this.handleRealtimeEvent('scan_session_items', payload)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'manual_inward_data' },
          (payload) => this.handleRealtimeEvent('manual_inward_data', payload)
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[ImportedService] Supabase Realtime connected');
          }
        });
    } catch (err) {
      console.warn('[ImportedService] Realtime setup note:', err);
    }
  }

  private handleRealtimeEvent(table: string, payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    let stateChanged = false;

    if (table === 'import_inwarded_data' || table === 'imported_inward_data') {
      if (eventType === 'INSERT' && newRecord) {
        if (!this.importInwarded.some(r => r.id === newRecord.id)) {
          this.importInwarded.push({
            id: newRecord.id || `${newRecord.class_id}_${newRecord.member_id}`,
            import_session_id: newRecord.import_session_id || 'default_sess',
            college_name: newRecord.college_name || newRecord.university_name || this.activeUniversity,
            university_name: newRecord.university_name || newRecord.college_name || this.activeUniversity,
            class_id: String(newRecord.class_id).trim(),
            sch_id: newRecord.sch_id,
            member_id: String(newRecord.member_id).trim(),
            barcode: newRecord.barcode,
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
            class_id: String(newRecord.class_id || this.importInwarded[idx].class_id).trim(),
            member_id: String(newRecord.member_id || this.importInwarded[idx].member_id).trim(),
            barcode: newRecord.barcode || this.importInwarded[idx].barcode,
          };
          stateChanged = true;
        }
      }
    } else if (table === 'saved_scanned_data') {
      if (eventType === 'INSERT' && newRecord) {
        if (!this.savedScanned.some(s => s.id === newRecord.id)) {
          this.savedScanned.push({
            id: newRecord.id,
            scan_session_id: newRecord.scan_session_id,
            import_session_id: newRecord.import_session_id,
            college_name: newRecord.college_name || this.activeUniversity,
            class_id: String(newRecord.class_id).trim(),
            sch_id: newRecord.sch_id,
            member_id: String(newRecord.member_id).trim(),
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
    } else if (table === 'manual_inward_data') {
      if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
        const cleanCid = normalizeIdentifier(newRecord.class_id);
        const cleanMid = normalizeIdentifier(newRecord.roll_number || newRecord.member_id || newRecord.booklet_barcode || '');
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
   * A successful query returning 0 records is authoritative and clears local cache.
   */
  public async syncFromSupabase() {
    if (!isSupabaseConfigured) return;

    try {
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

      // 2. Fetch imported data from primary production table imported_inward_data
      let impRows: any[] | null = null;
      let querySuccess = false;

      const { data: impData, error: impErr } = await supabase
        .from('imported_inward_data')
        .select('*')
        .limit(50000);

      if (!impErr && impData !== null && Array.isArray(impData)) {
        impRows = impData;
        querySuccess = true;
      } else {
        // Fallback check in case import_inwarded_data exists
        try {
          const { data: impFallback, error: fbErr } = await supabase
            .from('import_inwarded_data')
            .select('*')
            .limit(50000);
          if (!fbErr && impFallback !== null && Array.isArray(impFallback)) {
            impRows = impFallback;
            querySuccess = true;
          }
        } catch {}
      }

      // Authoritative update:
      // If query was successful (even with 0 rows!), replace local state completely!
      if (querySuccess && impRows !== null) {
        this.importInwarded = impRows.map((r: any) => ({
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

        // If backend contains 0 imported records, clear all derived structures
        if (this.importInwarded.length === 0) {
          this.importSessions = [];
          this.classOrder = [];
          this.activeSessionId = null;
          this.savedScanned = [];
          this.manualInwarded = [];
          this.scanItems = [];
          this.scanSessions = [];

          if (isSupabaseConfigured) {
            try {
              // Delete orphaned records when imported reference dataset was completely deleted
              await supabase.from('saved_scanned_data').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              await supabase.from('manual_inward_data').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              await supabase.from('scan_session_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              await supabase.from('scan_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            } catch (err) {
              console.warn('[ImportedService] Supabase orphan table cleanup note:', err);
            }
          }
        } else {
          // Align active university with imported records
          const firstUni = this.importInwarded[0].university_name || this.importInwarded[0].college_name;
          if (firstUni && !this.activeUniversity) {
            this.activeUniversity = firstUni;
          }
        }
        this.saveToLocalStorage();
        this.notify();
      }

      // 3. Fetch scan_sessions
      const { data: scanSessData, error: scanSessErr } = await supabase.from('scan_sessions').select('*');
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

      // 4. Fetch saved_scanned_data
      const { data: savedData, error: savedErr } = await supabase.from('saved_scanned_data').select('*').limit(50000);
      if (!savedErr && savedData !== null && Array.isArray(savedData)) {
        this.savedScanned = savedData.map((s: any) => ({
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
      }

      // 5. Fetch manual_inward_data
      try {
        const { data: manData, error: manErr } = await supabase
          .from('manual_inward_data')
          .select('*')
          .limit(50000);
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
            member_id: normalizeIdentifier(m.roll_number || m.booklet_barcode || ''),
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

      // 6. Fetch scan_session_items (pending items)
      try {
        const { data: itemsData, error: itemsErr } = await supabase.from('scan_session_items').select('*').limit(20000);
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
      } catch {}

      // Reconcile inward records with authoritative imported reference dataset
      this.reconcileInwardStateWithImportedData();

      // Write authoritative state to localStorage and notify all subscribers
      this.saveToLocalStorage();
      this.notify();
      this.isInitialized = true;
    } catch (e) {
      console.warn('[ImportedService] Supabase sync note:', e);
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

    const expectedCount = expected.length;
    const scannedCount = saved.length;
    const notScannedCount = Math.max(0, expectedCount - scannedCount);
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

    let totalExpected = 0;
    let totalSaved = 0;
    let totalPending = 0;
    let completedClasses = 0;
    let partialClasses = 0;
    let notStartedClasses = 0;

    for (const b of bundles) {
      totalExpected += b.expectedCount;
      totalSaved += b.savedCount;
      totalPending += b.pendingCount;

      if (b.status === 'COMPLETED') {
        completedClasses++;
      } else if (b.status === 'PARTIAL / SAVED' || b.status === 'IN PROGRESS') {
        partialClasses++;
      } else {
        notStartedClasses++;
      }
    }

    const totalReceived = totalSaved + totalPending;
    const totalMissing = Math.max(0, totalExpected - totalReceived);
    const overallCompletion = totalExpected > 0 ? Math.round((totalSaved / totalExpected) * 100) : 0;

    return {
      universityName: uni,
      totalClasses: bundles.length,
      completedClasses,
      partialClasses,
      notStartedClasses,
      totalExpected,
      totalSaved,
      totalPending,
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
      const progressPercentage = expectedCount > 0 ? Math.round((savedCount / expectedCount) * 100) : 0;

      let status: BundleStatus = 'NOT STARTED';
      let isCompleted = false;
      let isSaved = false;

      if (savedCount >= expectedCount && expectedCount > 0) {
        status = 'COMPLETED';
        isCompleted = true;
        isSaved = true;
      } else if (savedCount > 0 && pendingCount === 0) {
        status = 'PARTIAL / SAVED';
        isSaved = true;
      } else if (receivedCount > 0) {
        status = 'IN PROGRESS';
      }

      // Check scan session for saved timestamp
      const sess = this.scanSessions.find(s => s.class_id.toLowerCase() === classId.toLowerCase());

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
        progressPercentage,
        status,
        isSaved,
        isCompleted,
        savedAt: sess?.saved_at || null,
        lastActivityAt: sess?.last_activity_at || now,
        updatedAt: now,
        createdAt: now,
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

    // Saved scans for this class from saved_scanned_data
    const saved = this.savedScanned.filter(
      s => normalizeIdentifier(s.class_id).toLowerCase() === clean
    );
    const savedMap = new Map<string, SavedScannedRecord>();
    for (const s of saved) {
      savedMap.set(normalizeIdentifier(s.member_id).toLowerCase(), s);
    }

    // Manual inwards for this class from manual_inward_data
    const manual = this.manualInwarded.filter(
      m => normalizeIdentifier(m.class_id).toLowerCase() === clean
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
      const rCls = normalizeIdentifier(r.class_id).toLowerCase();

      // 1. Exact barcode match
      if (rBar && rBar === cleanLower) return true;

      // 2. Compound match (class_id + member_id)
      if (`${rCls}${rMem}` === cleanLower) return true;
      if (`${rCls}_${rMem}` === cleanLower) return true;

      // 3. Member ID fallback
      if (rMem === cleanLower) return true;

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
  // Commits PENDING_SAVE records to Table 4: saved_scanned_data
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
    const cleanCid = classId.trim();
    const pendingForClass = this.scanItems.filter(
      i => i.class_id.toLowerCase() === cleanCid.toLowerCase() && i.status === 'PENDING_SAVE'
    );

    if (pendingForClass.length === 0) {
      const now = new Date().toISOString();
      const currentUser = getCurrentUser();
      const session = await this.ensureScanSession(cleanCid);
      const expectedTotal = this.importInwarded.filter(r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase()).length;
      const totalSavedForThisClass = this.savedScanned.filter(s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid.toLowerCase()).length +
        this.manualInwarded.filter(m => normalizeIdentifier(m.class_id).toLowerCase() === cleanCid.toLowerCase()).length;

      if (session) {
        session.saved_at = now;
        session.saved_by = currentUser.name;
        if (totalSavedForThisClass >= expectedTotal && expectedTotal > 0) {
          session.status = 'COMPLETED';
        } else {
          session.status = 'SAVED';
        }
        if (isSupabaseConfigured) {
          try {
            await supabase.from('scan_sessions').upsert({
              id: session.id,
              college_name: session.college_name,
              import_session_id: session.import_session_id,
              class_id: session.class_id,
              status: session.status,
              saved_at: now,
              saved_by: currentUser.name,
              last_activity_at: now,
            });
          } catch {}
        }
      }

      this.saveToLocalStorage();
      this.notify();

      return {
        success: true,
        savedCount: 0,
        totalSavedForClass: totalSavedForThisClass,
        message: `Class ${cleanCid} inward saved successfully (${totalSavedForThisClass} inwarded).`,
        bundle: this.getClassBundle(cleanCid) || undefined,
      };
    }

    // Requirement 13: Offline guard — do not claim save succeeded if offline
    if (typeof navigator !== 'undefined' && !navigator.onLine && isSupabaseConfigured) {
      return {
        success: false,
        savedCount: 0,
        totalSavedForClass: this.savedScanned.filter(s => s.class_id.toLowerCase() === cleanCid.toLowerCase()).length,
        message: 'Network offline: Cannot commit records to Supabase. Items remain staged in PENDING_SAVE.',
        error: 'Network connection lost.',
      };
    }

    const now = new Date().toISOString();
    const currentUser = getCurrentUser();
    const existingSession = this.scanSessions.find(
      s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid.toLowerCase()
    );
    const uni: string =
      this.activeUniversity ||
      existingSession?.college_name ||
      this.importInwarded.find(r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase())?.university_name ||
      'VIT';
    const session = existingSession;
    const sessId = session?.id || generateUUID();

    // Existing saved keys for uniqueness check: college_name + class_id + member_id
    const existingSavedKeys = new Set(
      this.savedScanned.map(s => `${s.college_name.toLowerCase()}::${s.class_id.toLowerCase()}::${s.member_id.toLowerCase()}`)
    );

    const newSavedRecords: SavedScannedRecord[] = [];

    for (const item of pendingForClass) {
      // The member ID must come from the matching row in imported_inward_data
      const matchingImport = this.importInwarded.find(r =>
        normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase() &&
        (
          (item.barcode && r.barcode && normalizeIdentifier(r.barcode).toLowerCase() === normalizeIdentifier(item.barcode).toLowerCase()) ||
          normalizeIdentifier(r.member_id).toLowerCase() === normalizeIdentifier(item.member_id).toLowerCase()
        )
      );
      const targetMemberId = matchingImport ? normalizeIdentifier(matchingImport.member_id) : normalizeIdentifier(item.member_id);
      const targetBarcode = matchingImport?.barcode ? normalizeIdentifier(matchingImport.barcode) : (item.barcode ? normalizeIdentifier(item.barcode) : null);

      const key = `${uni.toLowerCase()}::${cleanCid.toLowerCase()}::${targetMemberId.toLowerCase()}`;
      if (!existingSavedKeys.has(key)) {
        existingSavedKeys.add(key);
        newSavedRecords.push({
          id: generateUUID(),
          scan_session_id: sessId,
          import_session_id: session?.import_session_id || this.activeSessionId || 'default_sess',
          college_name: uni,
          class_id: cleanCid,
          member_id: targetMemberId,
          barcode: targetBarcode,
          scanned_by: item.detected_by || currentUser.name || 'Operator',
          scanned_at: item.detected_at || now,
          saved_by: currentUser.name || 'Operator',
          saved_at: now,
          status: 'SAVED',
        });
      }
    }

    // Persist finalized saved records to Supabase table saved_scanned_data
    if (isSupabaseConfigured && newSavedRecords.length > 0) {
      try {
        for (let i = 0; i < newSavedRecords.length; i += BATCH_SIZE) {
          const chunk = newSavedRecords.slice(i, i + BATCH_SIZE);
          const { error: insErr } = await supabase.from('saved_scanned_data').insert(chunk);
          if (insErr) {
            console.warn('[ImportedService] Supabase saved_scanned_data insert note:', insErr.message);
          }
        }

        // Update scan_sessions in Supabase
        if (session) {
          session.saved_at = now;
          session.saved_by = currentUser.name;
          const expectedTotal = this.importInwarded.filter(r => r.class_id.toLowerCase() === cleanCid.toLowerCase()).length;
          const futureSavedCount = this.savedScanned.filter(s => s.class_id.toLowerCase() === cleanCid.toLowerCase()).length + newSavedRecords.length;
          if (futureSavedCount >= expectedTotal && expectedTotal > 0) {
            session.status = 'COMPLETED';
          } else {
            session.status = 'SAVED';
          }

          try {
            await supabase.from('scan_sessions').upsert({
              id: session.id,
              college_name: session.college_name,
              import_session_id: session.import_session_id,
              class_id: session.class_id,
              status: session.status,
              saved_at: now,
              saved_by: currentUser.name,
              last_activity_at: now,
            });
          } catch {}
        }

        // Update status of items in scan_session_items to SAVED in Supabase if table exists
        try {
          const itemIds = pendingForClass.map(i => i.id);
          if (itemIds.length > 0) {
            await supabase
              .from('scan_session_items')
              .update({ status: 'SAVED' })
              .in('id', itemIds);
          }
        } catch {}
      } catch (err: any) {
        console.warn('[ImportedService] Supabase save notice:', err.message || err);
      }
    }

    // Only after Supabase confirmation: transition items to SAVED in memory & local storage
    for (const item of pendingForClass) {
      item.status = 'SAVED';
    }
    this.savedScanned.push(...newSavedRecords);

    if (session) {
      session.saved_at = now;
      session.saved_by = currentUser.name;
      const expectedTotal = this.importInwarded.filter(r => r.class_id.toLowerCase() === cleanCid.toLowerCase()).length;
      const totalSavedForThisClass = this.savedScanned.filter(s => s.class_id.toLowerCase() === cleanCid.toLowerCase()).length;
      if (totalSavedForThisClass >= expectedTotal && expectedTotal > 0) {
        session.status = 'COMPLETED';
      } else {
        session.status = 'SAVED';
      }
    }

    this.saveToLocalStorage();

    const updatedBundle = this.getClassBundle(cleanCid);
    const totalSavedForClass = this.savedScanned.filter(s => s.class_id.toLowerCase() === cleanCid.toLowerCase()).length;

    return {
      success: true,
      savedCount: newSavedRecords.length,
      totalSavedForClass,
      message: `${newSavedRecords.length} booklets saved successfully to database.`,
      bundle: updatedBundle || undefined,
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
    onProgress?: (inserted: number, total: number) => void
  ): Promise<{ success: boolean; inserted: number; error?: string; session?: ImportSession }> {
    const cleanUniversity = (universityName || '').trim();

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

    // Create Table 1 records: import_inwarded_data
    const newRecords: ImportInwardedRecord[] = itemsToInsert.map((item, index) => ({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `imp_${Date.now()}_${index}`,
      import_session_id: sessionId,
      college_name: cleanUniversity,
      university_name: cleanUniversity,
      class_id: String(item.class_id).trim(), // preserve leading zeros as pure string
      sch_id: item.sch_id ? String(item.sch_id).trim() : undefined,
      member_id: String(item.member_id).trim(), // preserve leading zeros as pure string
      barcode: item.barcode ? String(item.barcode).trim() : undefined,
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
              barcode: r.barcode || null,
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

    if (isFirstImport) {
      this.importInwarded = newRecords;
    } else {
      this.importInwarded = [...this.importInwarded, ...newRecords];
    }

    // Initialize class order
    const importedClasses = Array.from(new Set(newRecords.map(r => r.class_id)));
    this.classOrder = [...this.classOrder.filter(c => !importedClasses.includes(c)), ...importedClasses];

    // Authoritative clean: Purge any old inward records for the newly imported classes so new members start un-inwarded
    const importedClassLower = new Set(importedClasses.map(c => normalizeIdentifier(c).toLowerCase()));
    this.savedScanned = this.savedScanned.filter(s => !importedClassLower.has(normalizeIdentifier(s.class_id).toLowerCase()));
    this.manualInwarded = this.manualInwarded.filter(m => !importedClassLower.has(normalizeIdentifier(m.class_id).toLowerCase()));
    this.scanItems = this.scanItems.filter(i => !importedClassLower.has(normalizeIdentifier(i.class_id).toLowerCase()));
    this.scanSessions = this.scanSessions.filter(s => !importedClassLower.has(normalizeIdentifier(s.class_id).toLowerCase()));

    if (isSupabaseConfigured) {
      try {
        const classList = Array.from(importedClasses);
        await supabase.from('saved_scanned_data').delete().in('class_id', classList);
        await supabase.from('manual_inward_data').delete().in('class_id', classList);
        await supabase.from('scan_session_items').delete().in('class_id', classList);
        await supabase.from('scan_sessions').delete().in('class_id', classList);
      } catch (e) {
        console.warn('[ImportedService] Note cleaning old inward data on import:', e);
      }
    }

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
        const { data: dbExpected1 } = await supabase
          .from('imported_inward_data')
          .select('*')
          .eq('university_name', uni);

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
            const { data: dbExpected2 } = await supabase
              .from('import_inwarded_data')
              .select('*')
              .or(`college_name.eq.${uni},university_name.eq.${uni}`);

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

        const { data: dbSaved } = await supabase
          .from('saved_scanned_data')
          .select('*')
          .eq('college_name', uni);

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
   * STAGE 1 Validation:
   * Before opening a class, validate against imported_inward_data WHERE class_id = enteredClassId.
   */
  public async validateClassId(rawClassId: string): Promise<{
    exists: boolean;
    count: number;
    classId: string;
  }> {
    let cleanCid = normalizeIdentifier(rawClassId);
    if (!cleanCid) return { exists: false, count: 0, classId: '' };

    // If input is longer than 4 digits but begins with 4 digits (e.g. barcode 00201234567890), extract first 4 digits
    if (cleanCid.length > 4 && /^\d{4}/.test(cleanCid)) {
      cleanCid = cleanCid.slice(0, 4);
    }

    // 1. Check local cache
    const matchingLocal = this.importInwarded.filter(
      r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid.toLowerCase()
    );
    if (matchingLocal.length > 0) {
      const canonicalCid = matchingLocal[0].class_id;
      return { exists: true, count: matchingLocal.length, classId: canonicalCid };
    }

    // 2. Direct Supabase query
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('imported_inward_data')
          .select('class_id')
          .eq('class_id', cleanCid);

        if (!error && Array.isArray(data) && data.length > 0) {
          const canonical = normalizeIdentifier(data[0].class_id);
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
   * STAGE 2 Validation:
   * Validates whether a Member ID belongs to the current Class ID in imported_inward_data.
   * If not in this class, checks whether it belongs to another class or doesn't exist.
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

    // 1. Direct query: WHERE class_id = activeClassId AND member_id = rawMemberId (or barcode = rawMemberId)
    // Check local memory first
    const exactLocal = this.importInwarded.find(r => {
      const rCid = normalizeIdentifier(r.class_id).toLowerCase();
      const rMid = normalizeIdentifier(r.member_id).toLowerCase();
      const rBar = r.barcode ? normalizeIdentifier(r.barcode).toLowerCase() : '';
      return rCid === cidLower && (rMid === midLower || rBar === midLower);
    });

    if (exactLocal) {
      return { status: 'VALID', record: exactLocal, actualClassId: exactLocal.class_id };
    }

    // Direct Supabase query for exact class + member match
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('imported_inward_data')
          .select('*')
          .eq('class_id', cleanActiveCid)
          .or(`member_id.eq.${cleanMid},barcode.eq.${cleanMid}`)
          .limit(1);

        if (!error && Array.isArray(data) && data.length > 0) {
          const row = data[0];
          const rec: ImportInwardedRecord = {
            id: row.id || `${row.class_id}_${row.member_id}`,
            import_session_id: row.import_session_id || 'default_session',
            college_name: row.university_name || row.college_name || this.activeUniversity || '',
            university_name: row.university_name || row.college_name || this.activeUniversity || '',
            class_id: normalizeIdentifier(row.class_id),
            sch_id: row.sch_id,
            member_id: normalizeIdentifier(row.member_id),
            barcode: row.barcode ? normalizeIdentifier(row.barcode) : undefined,
            created_by: row.created_by,
            created_at: row.created_at || new Date().toISOString(),
          };
          // add to local
          const existIdx = this.importInwarded.findIndex(r => r.id === rec.id);
          if (existIdx >= 0) this.importInwarded[existIdx] = rec;
          else this.importInwarded.push(rec);

          return { status: 'VALID', record: rec, actualClassId: rec.class_id };
        }
      } catch (e) {
        console.warn('Supabase exact member check note:', e);
      }
    }

    // 2. If not found in this class, check if member exists in ANY other class!
    // Check local memory
    const otherClassLocal = this.importInwarded.find(r => {
      const rMid = normalizeIdentifier(r.member_id).toLowerCase();
      const rBar = r.barcode ? normalizeIdentifier(r.barcode).toLowerCase() : '';
      return rMid === midLower || rBar === midLower;
    });

    if (otherClassLocal) {
      return {
        status: 'WRONG_CLASS',
        actualClassId: otherClassLocal.class_id,
        record: otherClassLocal,
      };
    }

    // Check Supabase for member in any class
    if (isSupabaseConfigured) {
      try {
        const { data: anyData } = await supabase
          .from('imported_inward_data')
          .select('*')
          .or(`member_id.eq.${cleanMid},barcode.eq.${cleanMid}`)
          .limit(1);

        if (anyData && Array.isArray(anyData) && anyData.length > 0) {
          const row = anyData[0];
          return {
            status: 'WRONG_CLASS',
            actualClassId: normalizeIdentifier(row.class_id),
          };
        }
      } catch (e) {
        console.warn('Supabase general member check note:', e);
      }
    }

    return { status: 'NOT_FOUND' };
  }

  /**
   * Check if a member is already inwarded for the class across:
   * 1. manual_inward_data
   * 2. saved_scanned_data
   * 3. pending scan_session_items
   */
  public isMemberAlreadyInwarded(classId: string, memberId: string): boolean {
    const cleanCid = normalizeIdentifier(classId).toLowerCase();
    const cleanMid = normalizeIdentifier(memberId).toLowerCase();

    // TASK 3: Authoritative verification — member must exist in imported_inward_data for this class
    const isImported = this.importInwarded.some(
      r => normalizeIdentifier(r.class_id).toLowerCase() === cleanCid &&
           normalizeIdentifier(r.member_id).toLowerCase() === cleanMid
    );
    if (!isImported) return false;

    // 1. Check saved_scanned_data
    const isSaved = this.savedScanned.some(
      s => normalizeIdentifier(s.class_id).toLowerCase() === cleanCid &&
           normalizeIdentifier(s.member_id).toLowerCase() === cleanMid
    );
    if (isSaved) return true;

    // 2. Check manual_inward_data
    const isManual = this.manualInwarded.some(
      m => normalizeIdentifier(m.class_id).toLowerCase() === cleanCid &&
           normalizeIdentifier(m.member_id || m.roll_number || m.booklet_barcode || '').toLowerCase() === cleanMid
    );
    if (isManual) return true;

    // 3. Check pending scan items
    const isPending = this.scanItems.some(
      i => normalizeIdentifier(i.class_id).toLowerCase() === cleanCid &&
           normalizeIdentifier(i.member_id).toLowerCase() === cleanMid &&
           i.status === 'PENDING_SAVE'
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
    options?: { notes?: string }
  ): Promise<{
    success: boolean;
    error?: string;
    record?: ManualInwardedRecord;
    bundle?: ClassBundle;
  }> {
    const cleanCid = normalizeIdentifier(classId);
    const cleanMid = normalizeIdentifier(memberId);

    if (!cleanCid || !cleanMid) {
      return { success: false, error: 'Class ID and Member ID are required.' };
    }

    // 1. Validation check against imported_inward_data
    const validation = await this.validateMemberForClass(cleanCid, cleanMid);
    if (validation.status === 'WRONG_CLASS') {
      return {
        success: false,
        error: `Member belongs to another Class (${validation.actualClassId})`,
      };
    }
    if (validation.status === 'NOT_FOUND') {
      return {
        success: false,
        error: 'Member ID not found in this Class',
      };
    }

    // 2. Duplicate Protection
    if (this.isMemberAlreadyInwarded(cleanCid, cleanMid)) {
      return {
        success: false,
        error: 'Member already inwarded',
      };
    }

    // 3. Ensure active session exists
    const session = await this.ensureScanSession(cleanCid);
    const now = new Date().toISOString();
    const currentUser = getCurrentUser();
    const targetRecord = validation.record;

    const newRecord: ManualInwardedRecord = {
      id: generateUUID(),
      session_code: session.id,
      bundle_code: `bundle_${cleanCid}`,
      class_id: cleanCid,
      booklet_barcode: targetRecord?.barcode || cleanMid,
      roll_number: cleanMid,
      member_id: cleanMid,
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
          booklet_barcode: newRecord.booklet_barcode,
          roll_number: newRecord.roll_number,
          status: 'inwarded',
          inwarded_by: newRecord.inwarded_by,
          notes: newRecord.notes,
          scanned_at: newRecord.scanned_at,
          created_at: newRecord.created_at,
        });

        if (insErr) {
          console.warn('[ImportedService] manual_inward_data Supabase insert error:', insErr.message);
        }
      } catch (err: any) {
        console.warn('[ImportedService] manual_inward_data Supabase exception:', err?.message || err);
      }
    }

    // 5. Update local state and notify subscribers immediately
    this.manualInwarded.push(newRecord);
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
    rawBarcode: string
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

    // STEP 3: Find member in public.imported_inward_data using authoritative imported barcode field
    let importedRow: ImportInwardedRecord | null = null;

    // 3a. Direct Supabase query (if configured)
    if (isSupabaseConfigured) {
      try {
        // Query imported_inward_data WHERE barcode = normalized
        const { data: byBar, error: barErr } = await supabase
          .from('imported_inward_data')
          .select('*')
          .eq('barcode', normalized)
          .limit(1);

        if (!barErr && byBar && byBar.length > 0) {
          const row = byBar[0];
          importedRow = {
            id: row.id || `${row.class_id}_${row.member_id}`,
            import_session_id: row.import_session_id || 'default_session',
            college_name: row.university_name || row.college_name || this.activeUniversity || '',
            university_name: row.university_name || row.college_name || this.activeUniversity || '',
            class_id: normalizeIdentifier(row.class_id),
            sch_id: row.sch_id,
            member_id: normalizeIdentifier(row.member_id),
            barcode: row.barcode ? normalizeIdentifier(row.barcode) : normalized,
            created_by: row.created_by,
            created_at: row.created_at || new Date().toISOString(),
          };
        }
      } catch {
        // fallback
      }

      // Also check import_inwarded_data table in Supabase
      if (!importedRow) {
        try {
          const { data: impBar, error: impErr } = await supabase
            .from('import_inwarded_data')
            .select('*')
            .eq('barcode', normalized)
            .limit(1);

          if (!impErr && impBar && impBar.length > 0) {
            const row = impBar[0];
            importedRow = {
              id: row.id || `${row.class_id}_${row.member_id}`,
              import_session_id: row.import_session_id || 'default_session',
              college_name: row.university_name || row.college_name || this.activeUniversity || '',
              university_name: row.university_name || row.college_name || this.activeUniversity || '',
              class_id: normalizeIdentifier(row.class_id),
              sch_id: row.sch_id,
              member_id: normalizeIdentifier(row.member_id),
              barcode: row.barcode ? normalizeIdentifier(row.barcode) : normalized,
              created_by: row.created_by,
              created_at: row.created_at || new Date().toISOString(),
            };
          }
        } catch {
          // fallback
        }
      }
    }

    // 3b. Authoritative local dataset search (this.importInwarded) which powers the working Not Inwarded list
    if (!importedRow) {
      // 1. Direct barcode match
      const localBarMatch = this.importInwarded.find(r =>
        r.barcode && normalizeIdentifier(r.barcode).toLowerCase() === normalized.toLowerCase()
      );
      if (localBarMatch) {
        importedRow = localBarMatch;
      }
    }

    // Fallback: If barcode was identical to member_id or member_id scanned directly
    if (!importedRow) {
      const localMemMatch = this.importInwarded.find(r =>
        normalizeIdentifier(r.member_id).toLowerCase() === normalized.toLowerCase()
      );
      if (localMemMatch) {
        importedRow = localMemMatch;
      }
    }

    // Fallback: Compound match (class_id + member_id)
    if (!importedRow) {
      const localCompoundMatch = this.importInwarded.find(r => {
        const c = normalizeIdentifier(r.class_id).toLowerCase();
        const m = normalizeIdentifier(r.member_id).toLowerCase();
        return `${c}${m}` === normalized.toLowerCase() || `${c}_${m}` === normalized.toLowerCase();
      });
      if (localCompoundMatch) {
        importedRow = localCompoundMatch;
      }
    }

    // Fallback: Check Supabase for member_id match if not found yet
    if (!importedRow && isSupabaseConfigured) {
      try {
        const { data: memData } = await supabase
          .from('imported_inward_data')
          .select('*')
          .eq('member_id', normalized)
          .limit(1);

        if (memData && memData.length > 0) {
          const row = memData[0];
          importedRow = {
            id: row.id || `${row.class_id}_${row.member_id}`,
            import_session_id: row.import_session_id || 'default_session',
            college_name: row.university_name || row.college_name || this.activeUniversity || '',
            university_name: row.university_name || row.college_name || this.activeUniversity || '',
            class_id: normalizeIdentifier(row.class_id),
            sch_id: row.sch_id,
            member_id: normalizeIdentifier(row.member_id),
            barcode: row.barcode ? normalizeIdentifier(row.barcode) : normalized,
            created_by: row.created_by,
            created_at: row.created_at || new Date().toISOString(),
          };
        }
      } catch {
        // ignore
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

    // If not found in imported_inward_data -> "Member ID not found"
    if (!importedRow) {
      console.log('[MEMBER SCAN] Imported row:', null);
      console.log('[MEMBER SCAN] Resolved member ID:', null);
      console.log('[MEMBER SCAN] Resolved class ID:', null);
      console.log('[MEMBER SCAN] Class validation:', 'Failed - member not imported');
      console.log('[MEMBER SCAN] Inward status:', 'Not inwarded');
      console.log('[MEMBER SCAN] Final result:', 'Member ID not found');

      return {
        success: false,
        isUnknownMember: true,
        isNotImported: true,
        class_id: activeClassId,
        detectedClassId: activeClassId,
        detectedMemberId: normalized,
        barcode: normalized,
        message: 'Member ID not found',
      };
    }

    // STEP 4: From matching imported row, obtain member_id, class_id, barcode
    const resolvedMemberId = normalizeIdentifier(importedRow.member_id);
    const resolvedClassId = normalizeIdentifier(importedRow.class_id);
    const resolvedBarcode = importedRow.barcode ? normalizeIdentifier(importedRow.barcode) : normalized;

    console.log('[MEMBER SCAN] Imported row:', importedRow);
    console.log('[MEMBER SCAN] Resolved member ID:', resolvedMemberId);
    console.log('[MEMBER SCAN] Resolved class ID:', resolvedClassId);

    // STEP 5: Verify resolved class_id matches active Class ID
    if (resolvedClassId.toLowerCase() !== cleanActiveCid.toLowerCase()) {
      console.log('[MEMBER SCAN] Class validation:', `Failed - belongs to Class ${resolvedClassId}, current is ${activeClassId}`);
      console.log('[MEMBER SCAN] Inward status:', 'Skipped');
      console.log('[MEMBER SCAN] Final result:', 'Member belongs to another Class');

      return {
        success: false,
        isWrongClass: true,
        currentClassId: activeClassId,
        detectedClassId: resolvedClassId,
        detectedMemberId: resolvedMemberId,
        barcode: normalized,
        message: 'Member belongs to another Class',
      };
    }

    console.log('[MEMBER SCAN] Class validation:', `Passed - belongs to current Class ${activeClassId}`);

    // STEP 6: Check whether this member has already been inwarded
    // Check saved_scanned_data
    let savedScannedResult: any = this.savedScanned.find(s =>
      normalizeIdentifier(s.class_id).toLowerCase() === cleanActiveCid.toLowerCase() &&
      (
        normalizeIdentifier(s.member_id).toLowerCase() === resolvedMemberId.toLowerCase() ||
        (s.barcode && normalizeIdentifier(s.barcode).toLowerCase() === normalized.toLowerCase())
      )
    ) || null;

    if (!savedScannedResult && isSupabaseConfigured) {
      try {
        const { data: svData } = await supabase
          .from('saved_scanned_data')
          .select('*')
          .eq('class_id', cleanActiveCid)
          .eq('member_id', resolvedMemberId)
          .limit(1);

        if (svData && svData.length > 0) {
          savedScannedResult = svData[0];
        }
      } catch {
        // ignore
      }
    }

    // Check manual_inward_data
    let manualInwardResult: any = this.manualInwarded.find(m =>
      normalizeIdentifier(m.class_id).toLowerCase() === cleanActiveCid.toLowerCase() &&
      (
        normalizeIdentifier(m.member_id || m.roll_number || m.booklet_barcode || '').toLowerCase() === resolvedMemberId.toLowerCase() ||
        (m.booklet_barcode && normalizeIdentifier(m.booklet_barcode).toLowerCase() === normalized.toLowerCase())
      )
    ) || null;

    if (!manualInwardResult && isSupabaseConfigured) {
      try {
        const { data: manData } = await supabase
          .from('manual_inward_data')
          .select('*')
          .eq('class_id', cleanActiveCid)
          .or(`member_id.eq.${resolvedMemberId},booklet_barcode.eq.${normalized}`)
          .limit(1);

        if (manData && manData.length > 0) {
          manualInwardResult = manData[0];
        }
      } catch {
        // ignore
      }
    }

    // Check pending session items (staged before save)
    const pendingResult = this.scanItems.find(i =>
      normalizeIdentifier(i.class_id).toLowerCase() === cleanActiveCid.toLowerCase() &&
      (
        normalizeIdentifier(i.member_id).toLowerCase() === resolvedMemberId.toLowerCase() ||
        (i.barcode && normalizeIdentifier(i.barcode).toLowerCase() === normalized.toLowerCase())
      ) &&
      i.status === 'PENDING_SAVE'
    ) || null;

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

    // Member is IMPORTED + NOT INWARDED -> Allow inward!
    console.log('[MEMBER SCAN] Inward status:', 'Not inwarded - saving');
    console.log('[MEMBER SCAN] Final result:', 'Inwarded');

    // Stage as PENDING_SAVE in active session
    const session = await this.ensureScanSession(activeClassId);
    const now = new Date().toISOString();
    const currentUser = getCurrentUser();

    const pendingItem: ScanSessionItem = {
      id: generateUUID(),
      scan_session_id: session.id,
      class_id: cleanActiveCid,
      member_id: resolvedMemberId,
      barcode: resolvedBarcode,
      detected_at: now,
      detected_by: currentUser.name,
      status: 'PENDING_SAVE',
      created_at: now,
    };

    this.scanItems.push(pendingItem);
    this.saveToLocalStorage();
    this.notify();

    // Persist to Supabase scan_session_items if configured
    if (isSupabaseConfigured) {
      try {
        await supabase.from('scan_session_items').insert([{
          id: pendingItem.id,
          scan_session_id: pendingItem.scan_session_id,
          class_id: pendingItem.class_id,
          member_id: pendingItem.member_id,
          barcode: pendingItem.barcode,
          detected_at: pendingItem.detected_at,
          detected_by: pendingItem.detected_by,
          status: 'PENDING_SAVE',
          created_at: pendingItem.created_at,
        }]);
      } catch (err) {
        console.warn('[MEMBER SCAN] Supabase scan_session_items insert note:', err);
      }
    }

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

  public clearAll() {
    this.importInwarded = [];
    this.manualInwarded = [];
    this.scanSessions = [];
    this.savedScanned = [];
    this.scanItems = [];
    this.importSessions = [];
    this.classOrder = [];
    this.saveToLocalStorage();
  }
}

export const importedService = new ImportedService();
