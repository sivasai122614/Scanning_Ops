// ==============================================================================
// ExamScan — Production Imported Data Service & Inwarding Reconciliation Engine
// Supabase Tables: 'import_sessions' & 'imported'
// Formula: Total Imported = Inwarded (started) + Missing (not_started)
// Strictly ZERO sample/mock business data. Starts completely empty.
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import * as XLSX from 'xlsx';

export interface ImportSession {
  id: string;
  university_name: string;
  source_file_name: string;
  total_records: number;
  total_class_ids: number;
  created_at: string;
}

export type BundleStatus = 'NOT STARTED' | 'IN PROGRESS' | 'PARTIAL / SAVED' | 'COMPLETED';

export interface ClassBundle {
  id: string;
  sessionId: string;
  universityName: string;
  classId: string;
  expectedCount: number;
  receivedCount: number;
  missingCount: number;
  remainingCount: number;
  progressPercentage: number;
  status: BundleStatus;
  isSaved: boolean;
  isCompleted: boolean;
  savedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface SessionSummary {
  universityName: string;
  totalClasses: number;
  completedClasses: number;
  partialClasses: number;
  inProgressClasses: number;
  notStartedClasses: number;
  totalExpected: number;
  totalReceived: number;
  totalMissing: number;
  overallCompletion: number;
  bundles: ClassBundle[];
}

export interface StagedScanItem {
  id: string;
  recordId: string;
  classId: string;
  memberId: string;
  barcode: string;
  scannedAt: string;
}

export interface ImportedRecord {
  id: string;
  import_session_id?: string;
  bundle_id?: string;
  university_name?: string;
  class_id: string;
  member_id: string;
  barcode: string | null;
  scan_status: 'not_started' | 'started' | 'completed';
  scanned_at: string | null;
  saved_at?: string | null;
  created_at: string;
}

export interface ClassIdSummary {
  class_id: string;
  total_imported: number;
  scanned_count: number;
  remaining_count: number;
  bundle_status?: BundleStatus;
}

export interface ImportedStats {
  scan_started: number;
  scan_not_started: number;
  total_imported: number;
  class_ids_count: number;
}

export interface ScanResult {
  success: boolean;
  message: string;
  record?: ImportedRecord;
  class_id?: string;
  member_id?: string;
  isDuplicate?: boolean;
  isDuplicateInStaging?: boolean;
  isUnknownClass?: boolean;
  isUnknownMember?: boolean;
  isWrongClass?: boolean;
  currentClassId?: string;
  detectedClassId?: string;
  detectedMemberId?: string;
  barcode?: string;
  isAllScanned?: boolean;
  isComplete?: boolean;
  bundle?: ClassBundle;
  item?: StagedScanItem;
}

// SQL Script for clean 2-table architecture requested by user:
// 1. imported_inward_data
// 2. manual_inward_data
export const EXAMSCAN_2TABLES_SQL = `-- ==============================================================================
-- ExamScan — Clean 2-Table Database Architecture
-- Drops older legacy tables and establishes ONLY 2 operational tables:
-- 1. imported_inward_data (Excel imported students & inwarding status)
-- 2. manual_inward_data   (Manual bundle & script inward intake)
-- ==============================================================================

-- 1. Drop existing tables safely
DROP TABLE IF EXISTS public.imported CASCADE;
DROP TABLE IF EXISTS public.import_sessions CASCADE;
DROP TABLE IF EXISTS public.scanned_scripts CASCADE;
DROP TABLE IF EXISTS public.inward_schedules CASCADE;
DROP TABLE IF EXISTS public.exam_sessions CASCADE;
DROP TABLE IF EXISTS public.centers CASCADE;
DROP TABLE IF EXISTS public.imported_inward_data CASCADE;
DROP TABLE IF EXISTS public.manual_inward_data CASCADE;

-- 2. Table: imported_inward_data
CREATE TABLE public.imported_inward_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_session_id VARCHAR(100),
  university_name VARCHAR(255) NOT NULL,
  class_id VARCHAR(100) NOT NULL,
  member_id VARCHAR(100) NOT NULL,
  barcode VARCHAR(255),
  scan_status VARCHAR(50) NOT NULL DEFAULT 'not_started' CHECK (scan_status IN ('not_started', 'started', 'completed')),
  scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup indexes
CREATE INDEX idx_imp_inward_class_id ON public.imported_inward_data(class_id);
CREATE INDEX idx_imp_inward_member_id ON public.imported_inward_data(member_id);
CREATE INDEX idx_imp_inward_barcode ON public.imported_inward_data(barcode);
CREATE INDEX idx_imp_inward_scan_status ON public.imported_inward_data(scan_status);
CREATE INDEX idx_imp_inward_session_id ON public.imported_inward_data(import_session_id);

-- Enable RLS and public access policies
ALTER TABLE public.imported_inward_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on imported_inward_data" ON public.imported_inward_data;
CREATE POLICY "Allow all on imported_inward_data" ON public.imported_inward_data FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. Table: manual_inward_data
CREATE TABLE public.manual_inward_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code VARCHAR(100),
  bundle_code VARCHAR(100),
  class_id VARCHAR(100),
  school_id VARCHAR(100),
  room_number VARCHAR(100),
  subject_name VARCHAR(255),
  booklet_barcode VARCHAR(255),
  roll_number VARCHAR(100),
  status VARCHAR(50) NOT NULL DEFAULT 'inwarded',
  inwarded_by VARCHAR(255),
  notes TEXT,
  scanned_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup indexes
CREATE INDEX idx_manual_inward_class_id ON public.manual_inward_data(class_id);
CREATE INDEX idx_manual_inward_barcode ON public.manual_inward_data(booklet_barcode);
CREATE INDEX idx_manual_inward_roll ON public.manual_inward_data(roll_number);
CREATE INDEX idx_manual_inward_session ON public.manual_inward_data(session_code);

-- Enable RLS and public access policies
ALTER TABLE public.manual_inward_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on manual_inward_data" ON public.manual_inward_data;
CREATE POLICY "Allow all on manual_inward_data" ON public.manual_inward_data FOR ALL TO public USING (true) WITH CHECK (true);`;

const PROD_RECORDS_KEY = 'examscan_imported_records_prod_v3';
const PROD_SESSIONS_KEY = 'examscan_import_sessions_prod_v3';
const PROD_ACTIVE_SESSION_KEY = 'examscan_active_session_prod_v3';
const PROD_BUNDLES_KEY = 'examscan_class_bundles_prod_v4';
const BATCH_SIZE = 500;

const PRIMARY_TABLE = 'imported_inward_data';
const FALLBACK_TABLE = 'imported';

// Clean out any legacy demo or sample storage keys from previous builds
const LEGACY_KEYS = [
  'imported_records_v1',
  'imported_records_v2',
  'imported_records_prod',
  'import_sessions_v1',
  'examscan_imported_records_prod_v2',
  'examscan_import_sessions_prod_v2',
  'examscan_active_session_prod_v2',
];

/**
 * Sanitizes barcode by trimming whitespace and stripping Code 39 start/stop
 * asterisk delimiters (e.g. "*003121MIS0074*" -> "003121MIS0074")
 */
export function sanitizeBarcode(code: string): string {
  if (!code) return '';
  let cleaned = code.trim();
  // Strip start and stop asterisks common in Code 39 fonts and barcode scanners
  cleaned = cleaned.replace(/^\*+|\*+$/g, '').trim();
  return cleaned;
}

class ImportedService {
  private records: ImportedRecord[] = [];
  private sessions: ImportSession[] = [];
  private bundles: ClassBundle[] = [];
  private activeSession: ImportSession | null = null;
  private listeners: (() => void)[] = [];
  private isLoadedFromRemote = false;
  private realtimeChannel: any = null;
  private isRemoteTableAvailable = true;
  private hasCheckedTable = false;
  private tableName: string = PRIMARY_TABLE;

  constructor() {
    this.cleanLegacyStorage();
    this.initLocalData();
    this.checkRemoteTable().then(available => {
      if (available) {
        this.initRealtime();
        this.syncFromSupabase();
      }
    });
  }

  private cleanLegacyStorage() {
    try {
      LEGACY_KEYS.forEach(key => {
        localStorage.removeItem(key);
      });
    } catch {}
  }

  private initLocalData() {
    try {
      const storedSessions = localStorage.getItem(PROD_SESSIONS_KEY);
      this.sessions = storedSessions ? JSON.parse(storedSessions) : [];

      const storedRecords = localStorage.getItem(PROD_RECORDS_KEY);
      this.records = storedRecords ? JSON.parse(storedRecords) : [];

      const storedBundles = localStorage.getItem(PROD_BUNDLES_KEY);
      this.bundles = storedBundles ? JSON.parse(storedBundles) : [];

      const storedActiveId = localStorage.getItem(PROD_ACTIVE_SESSION_KEY);
      if (storedActiveId) {
        this.activeSession = this.sessions.find(s => s.id === storedActiveId) || this.sessions[0] || null;
      } else {
        this.activeSession = this.sessions[0] || null;
      }

      this.reconcileBundlesWithRecords();
    } catch (err) {
      console.warn('Failed to load imported records from localStorage', err);
      this.records = [];
      this.sessions = [];
      this.bundles = [];
      this.activeSession = null;
    }
  }

  /**
   * Check if 'imported_inward_data' (or fallback 'imported') exists in remote Supabase schema
   */
  public async checkRemoteTable(): Promise<boolean> {
    if (!isSupabaseConfigured) {
      this.isRemoteTableAvailable = false;
      this.hasCheckedTable = true;
      return false;
    }

    try {
      // 1. Try PRIMARY_TABLE: 'imported_inward_data'
      const { error: primaryErr } = await supabase.from(PRIMARY_TABLE).select('id').limit(1);
      if (!primaryErr) {
        this.tableName = PRIMARY_TABLE;
        this.isRemoteTableAvailable = true;
        this.hasCheckedTable = true;
        return true;
      }

      // If primary table doesn't exist yet, check fallback table: 'imported'
      if (
        primaryErr.code === 'PGRST205' ||
        primaryErr.message?.includes('schema cache') ||
        primaryErr.message?.includes('does not exist')
      ) {
        const { error: fallbackErr } = await supabase.from(FALLBACK_TABLE).select('id').limit(1);
        if (!fallbackErr) {
          this.tableName = FALLBACK_TABLE;
          this.isRemoteTableAvailable = true;
          this.hasCheckedTable = true;
          return true;
        }
      }

      this.tableName = PRIMARY_TABLE;
      this.isRemoteTableAvailable = false;
      this.hasCheckedTable = true;
      return false;
    } catch {
      this.tableName = PRIMARY_TABLE;
      this.isRemoteTableAvailable = false;
      this.hasCheckedTable = true;
      return false;
    }
  }

  public getRemoteStatus(): { isConfigured: boolean; isRemoteTableAvailable: boolean; tableName: string } {
    return {
      isConfigured: isSupabaseConfigured,
      isRemoteTableAvailable: this.isRemoteTableAvailable,
      tableName: this.tableName,
    };
  }

  private initRealtime() {
    if (isSupabaseConfigured && this.isRemoteTableAvailable && typeof window !== 'undefined') {
      try {
        if (this.realtimeChannel) {
          supabase.removeChannel(this.realtimeChannel);
        }
        this.realtimeChannel = supabase
          .channel(`public:${this.tableName}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: this.tableName },
            () => {
              this.syncFromSupabase();
            }
          )
          .subscribe();
      } catch (e) {
        console.warn('Realtime subscription not established:', e);
      }
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
        console.warn('Error in listener callback:', e);
      }
    });
  }

  private saveLocal() {
    try {
      localStorage.setItem(PROD_RECORDS_KEY, JSON.stringify(this.records));
      localStorage.setItem(PROD_SESSIONS_KEY, JSON.stringify(this.sessions));
      localStorage.setItem(PROD_BUNDLES_KEY, JSON.stringify(this.bundles));
      if (this.activeSession) {
        localStorage.setItem(PROD_ACTIVE_SESSION_KEY, this.activeSession.id);
      } else {
        localStorage.removeItem(PROD_ACTIVE_SESSION_KEY);
      }
      this.notify();
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }

  /**
   * Sync records from Supabase into memory
   */
  public async syncFromSupabase(): Promise<ImportedRecord[]> {
    if (!isSupabaseConfigured) {
      return this.records;
    }

    if (!this.hasCheckedTable) {
      const available = await this.checkRemoteTable();
      if (!available) return this.records;
    } else if (!this.isRemoteTableAvailable) {
      return this.records;
    }

    try {
      // 1. Fetch import sessions if available
      try {
        const { data: sessionData } = await supabase
          .from('import_sessions')
          .select('*')
          .order('created_at', { ascending: false });

        if (sessionData && Array.isArray(sessionData) && sessionData.length > 0) {
          this.sessions = sessionData.map((s: any) => ({
            id: s.id,
            university_name: s.university_name || 'General University',
            source_file_name: s.source_file_name || 'import.xlsx',
            total_records: s.total_records || 0,
            total_class_ids: s.total_class_ids || 0,
            created_at: s.created_at || new Date().toISOString(),
          }));
          if (!this.activeSession && this.sessions.length > 0) {
            this.activeSession = this.sessions[0];
          }
        }
      } catch (sessErr) {
        // sessions table might be optional
      }

      // 2. Fetch imported records
      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50000);

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('schema cache') || error.message?.includes('does not exist')) {
          this.isRemoteTableAvailable = false;
        } else {
          console.warn(`Supabase query note on ${this.tableName} table:`, error.message);
        }
        return this.records;
      }

      if (data && Array.isArray(data)) {
        this.records = data.map((d: any) => ({
          id: d.id,
          import_session_id: d.import_session_id,
          university_name: d.university_name || this.activeSession?.university_name || '',
          class_id: String(d.class_id || '').trim(),
          member_id: String(d.member_id || '').trim(),
          barcode: d.barcode || null,
          scan_status: d.scan_status || 'not_started',
          scanned_at: d.scanned_at || null,
          saved_at: d.saved_at || null,
          created_at: d.created_at || new Date().toISOString(),
        }));

        // Fetch remote class_bundles if available
        try {
          const { data: bData } = await supabase.from('class_bundles').select('*');
          if (bData && Array.isArray(bData) && bData.length > 0) {
            this.bundles = bData.map((b: any) => ({
              id: b.id,
              sessionId: b.session_id || this.activeSession?.id || 'default_session',
              universityName: b.university_name || this.activeSession?.university_name || 'General University',
              classId: String(b.class_id || '').trim(),
              expectedCount: Number(b.expected_count) || 0,
              receivedCount: Number(b.received_count) || 0,
              missingCount: Number(b.missing_count) || 0,
              remainingCount: Number(b.missing_count) || 0,
              progressPercentage: Number(b.expected_count) > 0 ? Math.round((Number(b.received_count) / Number(b.expected_count)) * 100) : 0,
              status: (b.status || 'NOT STARTED') as BundleStatus,
              isSaved: Boolean(b.is_saved),
              isCompleted: Boolean(b.is_completed),
              savedAt: b.saved_at || null,
              updatedAt: b.updated_at || new Date().toISOString(),
              createdAt: b.created_at || new Date().toISOString(),
            }));
          }
        } catch {}

        this.reconcileBundlesWithRecords();
        this.isLoadedFromRemote = true;
        this.saveLocal();
      }
      return this.records;
    } catch (e) {
      console.warn('Sync note, relying on local records:', e);
      return this.records;
    }
  }

  /**
   * Get 4 Main Statistics
   * 1. Scan Started (Inwarded)
   * 2. Scan Not Started (Missing = Total Imported - Scan Started)
   * 3. Imported Users
   * 4. Class ID Count
   */
  public getStats(): ImportedStats {
    const total_imported = this.records.length;
    const scan_started = this.records.filter(r => r.scan_status === 'started' || r.scan_status === 'completed').length;
    const scan_not_started = Math.max(0, total_imported - scan_started);
    const uniqueClassIds = new Set(this.records.map(r => r.class_id.trim()).filter(Boolean));

    return {
      scan_started,
      scan_not_started,
      total_imported,
      class_ids_count: uniqueClassIds.size,
    };
  }

  /**
   * Get Inwarding vs Missing Statistics & Metadata
   * Guaranteed: Total Imported = Inwarded + Missing
   */
  public getInwardStats(): {
    totalImported: number;
    inwarded: number;
    missing: number;
    classCount: number;
    universityName: string;
    completionRate: number;
  } {
    const totalImported = this.records.length;
    const inwarded = this.records.filter(r => r.scan_status === 'started' || r.scan_status === 'completed').length;
    const missing = Math.max(0, totalImported - inwarded);
    const classCount = new Set(this.records.map(r => r.class_id.trim()).filter(Boolean)).size;
    const universityName = this.activeSession?.university_name || this.records[0]?.university_name || 'General University';
    const completionRate = totalImported > 0 ? Math.round((inwarded / totalImported) * 100) : 0;

    return {
      totalImported,
      inwarded,
      missing,
      classCount,
      universityName,
      completionRate,
    };
  }

  public getActiveSession(): ImportSession | null {
    return this.activeSession;
  }

  public getAllSessions(): ImportSession[] {
    return [...this.sessions];
  }

  public setActiveSession(session: ImportSession | null) {
    this.activeSession = session;
    this.saveLocal();
  }

  /**
   * Get Inwarded Records (scan_status = 'started' or 'completed')
   */
  public getInwardedRecords(classId?: string): ImportedRecord[] {
    return this.records.filter(
      r =>
        (classId && classId !== 'all' ? r.class_id.toLowerCase() === classId.toLowerCase() : true) &&
        (r.scan_status === 'started' || r.scan_status === 'completed')
    );
  }

  /**
   * Get Missing Records (scan_status = 'not_started')
   */
  public getMissingRecords(classId?: string): ImportedRecord[] {
    return this.records.filter(
      r =>
        (classId && classId !== 'all' ? r.class_id.toLowerCase() === classId.toLowerCase() : true) &&
        r.scan_status === 'not_started'
    );
  }

  /**
   * Reconcile bundles state with records in memory
   * Ensures every unique class_id in records has a corresponding ClassBundle,
   * and calculates expected, received, missing, and status accurately.
   */
  public reconcileBundlesWithRecords(): ClassBundle[] {
    const classMap = new Map<string, { total: number; scanned: number }>();
    for (const r of this.records) {
      const cid = r.class_id.trim();
      if (!cid) continue;
      if (!classMap.has(cid)) {
        classMap.set(cid, { total: 0, scanned: 0 });
      }
      const item = classMap.get(cid)!;
      item.total += 1;
      if (r.scan_status === 'started' || r.scan_status === 'completed') {
        item.scanned += 1;
      }
    }

    const now = new Date().toISOString();
    const existingBundlesMap = new Map<string, ClassBundle>();
    for (const b of this.bundles) {
      existingBundlesMap.set(b.classId.toLowerCase(), b);
    }

    const updatedBundles: ClassBundle[] = [];
    const sessionId = this.activeSession?.id || 'default_session';
    const uniName = this.activeSession?.university_name || this.records[0]?.university_name || 'General University';

    for (const [classId, stats] of classMap.entries()) {
      const existing = existingBundlesMap.get(classId.toLowerCase());
      const expectedCount = stats.total;
      const receivedCount = stats.scanned;
      const remainingCount = Math.max(0, expectedCount - receivedCount);
      const progressPercentage = expectedCount > 0 ? Math.round((receivedCount / expectedCount) * 100) : 0;

      // Status resolution
      let status: BundleStatus = 'NOT STARTED';
      let isCompleted = existing?.isCompleted || false;
      let isSaved = existing?.isSaved || false;

      if (isCompleted || (isSaved && expectedCount > 0 && receivedCount === expectedCount)) {
        status = 'COMPLETED';
        isCompleted = true;
      } else if (isSaved) {
        status = 'PARTIAL / SAVED';
      } else if (receivedCount > 0) {
        status = 'IN PROGRESS';
      } else {
        status = 'NOT STARTED';
      }

      const bundle: ClassBundle = {
        id: existing?.id || `bundle_${sessionId}_${classId}`,
        sessionId: existing?.sessionId || sessionId,
        universityName: existing?.universityName || uniName,
        classId,
        expectedCount,
        receivedCount,
        missingCount: remainingCount,
        remainingCount,
        progressPercentage,
        status,
        isSaved,
        isCompleted,
        savedAt: existing?.savedAt || null,
        updatedAt: now,
        createdAt: existing?.createdAt || now,
      };

      updatedBundles.push(bundle);
    }

    // Sort by classId
    updatedBundles.sort((a, b) => a.classId.localeCompare(b.classId));
    this.bundles = updatedBundles;
    return this.bundles;
  }

  /**
   * Get all Class Bundles
   */
  public getClassBundles(): ClassBundle[] {
    return this.reconcileBundlesWithRecords();
  }

  /**
   * Get specific Class Bundle
   */
  public getClassBundle(classId: string): ClassBundle | null {
    if (!classId) return null;
    const clean = classId.trim().toLowerCase();
    const bundles = this.getClassBundles();
    return bundles.find(b => b.classId.toLowerCase() === clean) || null;
  }

  /**
   * Get Class ID-Wise Summaries
   * Class ID | Imported | Inwarded (Scanned) | Missing (Remaining)
   */
  public getClassIdSummaries(): ClassIdSummary[] {
    const bundles = this.getClassBundles();
    return bundles.map(b => ({
      class_id: b.classId,
      total_imported: b.expectedCount,
      scanned_count: b.receivedCount,
      remaining_count: b.missingCount,
      bundle_status: b.status,
    }));
  }

  /**
   * Get all records or filter by Class ID
   */
  public getRecords(classId?: string): ImportedRecord[] {
    if (classId && classId !== 'all') {
      return this.records.filter(r => r.class_id.trim().toLowerCase() === classId.trim().toLowerCase());
    }
    return [...this.records];
  }

  /**
   * Get dynamic Class ID specific statistics
   * Total Members, Total Scanned (started), Pending (Missing), Progress %
   */
  public getClassStats(classId: string): {
    class_id: string;
    total_members: number;
    total_scanned: number;
    pending: number;
    progress_percentage: number;
  } {
    const list = this.records.filter(r => r.class_id.trim().toLowerCase() === classId.trim().toLowerCase());
    const total_members = list.length;
    const total_scanned = list.filter(r => r.scan_status === 'started' || r.scan_status === 'completed').length;
    const pending = Math.max(0, total_members - total_scanned);
    const progress_percentage = total_members > 0 ? Math.round((total_scanned / total_members) * 100) : 0;
    return {
      class_id: classId,
      total_members,
      total_scanned,
      pending,
      progress_percentage,
    };
  }

  /**
   * Bulk insert imported records into Supabase and local cache
   * Section 1:
   * 1. Remove all sample/demo data completely.
   * 2. Import actual Excel records.
   * 3. Validate imported records.
   * 4. Store University Name with imported scanning session.
   * 5. Detect and calculate class-wise expected booklet/member counts.
   * 6. Show imported classes in Scanning Dashboard.
   */
  public async bulkInsert(
    items: { class_id: string; member_id: string }[],
    universityName: string,
    sourceFileName?: string,
    onProgress?: (insertedCount: number, total: number) => void
  ): Promise<{ success: boolean; inserted: number; error?: string; session?: ImportSession }> {
    const cleanUniversity = (universityName || '').trim();
    if (!cleanUniversity) {
      return { success: false, inserted: 0, error: 'University Name is mandatory before importing.' };
    }

    if (!items || items.length === 0) {
      return { success: false, inserted: 0, error: 'No valid records to import.' };
    }

    const now = new Date().toISOString();
    const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}`;

    // 1. Create Import Session (Section 6)
    const session: ImportSession = {
      id: sessionId,
      university_name: cleanUniversity,
      source_file_name: sourceFileName || 'import_file.xlsx',
      total_records: items.length,
      total_class_ids: new Set(items.map(i => i.class_id.trim())).size,
      created_at: now,
    };

    // 2. Prepare Records (scan_status = 'not_started')
    const newRecords: ImportedRecord[] = items.map((item, index) => ({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `imp_${Date.now()}_${index}`,
      import_session_id: sessionId,
      university_name: cleanUniversity,
      class_id: String(item.class_id).trim(),
      member_id: String(item.member_id).trim(),
      barcode: null,
      scan_status: 'not_started',
      scanned_at: null,
      saved_at: null,
      created_at: now,
    }));

    // 3. Calculate class-wise expected counts and initialize bundles
    const classCountMap = new Map<string, number>();
    for (const it of items) {
      const cid = String(it.class_id).trim();
      classCountMap.set(cid, (classCountMap.get(cid) || 0) + 1);
    }

    const newBundles: ClassBundle[] = [];
    for (const [classId, expectedCount] of classCountMap.entries()) {
      newBundles.push({
        id: `bundle_${sessionId}_${classId}`,
        sessionId,
        universityName: cleanUniversity,
        classId,
        expectedCount,
        receivedCount: 0,
        missingCount: expectedCount,
        remainingCount: expectedCount,
        progressPercentage: 0,
        status: 'NOT STARTED',
        isSaved: false,
        isCompleted: false,
        savedAt: null,
        updatedAt: now,
        createdAt: now,
      });
    }

    // Wipe previous session/demo data completely (Req 1.1)
    this.sessions = [session];
    this.activeSession = session;
    this.records = newRecords;
    this.bundles = newBundles;
    this.saveLocal();

    // Check remote table availability
    if (isSupabaseConfigured && !this.hasCheckedTable) {
      await this.checkRemoteTable();
    }

    // Push session, bundles, and records to Supabase in batches if available
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        // Insert session record
        try {
          await supabase.from('import_sessions').insert([
            {
              id: session.id,
              university_name: session.university_name,
              source_file_name: session.source_file_name,
              total_records: session.total_records,
              total_class_ids: session.total_class_ids,
              created_at: session.created_at,
            },
          ]);
        } catch (sessErr) {
          console.warn('Session insert note:', sessErr);
        }

        // Insert bundles into class_bundles table if present
        try {
          await supabase.from('class_bundles').upsert(
            newBundles.map(b => ({
              id: b.id,
              session_id: b.sessionId,
              university_name: b.universityName,
              class_id: b.classId,
              expected_count: b.expectedCount,
              received_count: b.receivedCount,
              missing_count: b.missingCount,
              status: b.status,
              is_saved: b.isSaved,
              is_completed: b.isCompleted,
              saved_at: b.savedAt,
              created_at: b.createdAt,
              updated_at: b.updatedAt,
            }))
          );
        } catch (bErr) {
          console.warn('class_bundles upsert note:', bErr);
        }

        const total = newRecords.length;
        let processed = 0;

        for (let i = 0; i < total; i += BATCH_SIZE) {
          const chunk = newRecords.slice(i, i + BATCH_SIZE).map(r => ({
            id: r.id,
            import_session_id: r.import_session_id,
            university_name: r.university_name,
            class_id: r.class_id,
            member_id: r.member_id,
            barcode: null,
            scan_status: 'not_started',
            scanned_at: null,
            saved_at: null,
            created_at: r.created_at,
          }));

          const { error } = await supabase.from(this.tableName).insert(chunk);
          if (error) {
            if (
              error.code === 'PGRST205' ||
              error.message?.includes('schema cache') ||
              error.message?.includes('does not exist')
            ) {
              this.isRemoteTableAvailable = false;
              console.info(
                `[ImportedService] Supabase "${this.tableName}" table not yet created in remote database (PGRST205). Stored safely in local high-speed cache.`
              );
              break;
            } else {
              console.warn('[ImportedService] Supabase batch insert note:', error.message);
            }
          }
          processed += chunk.length;
          if (onProgress) {
            onProgress(processed, total);
          }
        }
      } catch (err: any) {
        console.warn('[ImportedService] Batch insert remote warning:', err);
      }
    } else {
      if (onProgress) {
        onProgress(newRecords.length, newRecords.length);
      }
    }

    this.notify();
    return { success: true, inserted: newRecords.length, session };
  }

  /**
   * Detect Class ID from Barcode input
   */
  public detectClassId(barcodeInput: string): string | null {
    const code = sanitizeBarcode(barcodeInput);
    if (!code) return null;

    const bundles = this.getClassBundles();
    const knownIds = bundles.map(b => b.classId);

    // 1. Direct prefix match with known class IDs
    for (const cid of knownIds) {
      if (code.toLowerCase().startsWith(cid.toLowerCase())) {
        return cid;
      }
    }

    // 2. Delimiter split match (e.g. 1211-MEM001 -> 1211)
    const parts = code.split(/[-_/ ]+/);
    if (parts.length > 1) {
      for (const p of parts) {
        const match = knownIds.find(cid => cid.toLowerCase() === p.toLowerCase());
        if (match) return match;
      }
    }

    // 3. First 4 characters
    if (code.length >= 4) {
      const candidate = code.substring(0, 4);
      const match = knownIds.find(cid => cid.toLowerCase() === candidate.toLowerCase());
      if (match) return match;
      return candidate;
    }

    return code;
  }

  /**
   * Parse barcode content into Class ID and Member ID
   */
  public parseBarcodeContent(barcodeInput: string): {
    rawBarcode: string;
    detectedClassId: string | null;
    detectedMemberId: string | null;
  } {
    const raw = sanitizeBarcode(barcodeInput);
    if (!raw) return { rawBarcode: '', detectedClassId: null, detectedMemberId: null };

    // 1. Direct match with any known member_id in imported records
    const exactMemberMatch = this.records.find(
      r => r.member_id.toLowerCase() === raw.toLowerCase()
    );
    if (exactMemberMatch) {
      return {
        rawBarcode: raw,
        detectedClassId: exactMemberMatch.class_id,
        detectedMemberId: exactMemberMatch.member_id,
      };
    }

    // 2. Check if raw barcode starts with any known imported Class ID
    const knownClassIds = Array.from(new Set(this.records.map(r => r.class_id.trim()))).sort(
      (a, b) => b.length - a.length
    );

    for (const cid of knownClassIds) {
      if (raw.toLowerCase().startsWith(cid.toLowerCase())) {
        const remainder = raw.substring(cid.length).replace(/^[-_/ ]+/, '').trim();
        return {
          rawBarcode: raw,
          detectedClassId: cid,
          detectedMemberId: remainder || null,
        };
      }
    }

    // 3. Delimiter split: e.g. 0099-MEM001 or 0021_MEM001
    const parts = raw.split(/[-_/ ]+/);
    if (parts.length > 1) {
      return {
        rawBarcode: raw,
        detectedClassId: parts[0],
        detectedMemberId: parts.slice(1).join('-') || null,
      };
    }

    // 4. Default 4-character prefix (e.g. 0099MEM001 -> 0099 and MEM001)
    if (raw.length > 4) {
      const candidateCid = raw.substring(0, 4);
      const candidateMid = raw.substring(4);
      return {
        rawBarcode: raw,
        detectedClassId: candidateCid,
        detectedMemberId: candidateMid || null,
      };
    }

    // 5. Fallback
    return {
      rawBarcode: raw,
      detectedClassId: raw,
      detectedMemberId: null,
    };
  }

  /**
   * Process Scanning on the Scanning Dashboard (Sections 16, 17, 18, 19, 20)
   * Validates Class ID and Member ID against imported Excel records.
   * If Class ID not imported -> isUnknownClass: true
   * If Member ID not imported -> isUnknownMember: true
   * If Duplicate -> isDuplicate: true
   * If Valid -> Marks record scanned, updates Class Bundle, persists to Supabase.
   */
  public async processScanningDashboardScan(barcodeInput: string): Promise<ScanResult> {
    const rawCode = sanitizeBarcode(barcodeInput);
    if (!rawCode) {
      return { success: false, message: 'Please provide a valid barcode.' };
    }

    const { detectedClassId, detectedMemberId } = this.parseBarcodeContent(rawCode);

    if (!detectedClassId) {
      return {
        success: false,
        message: 'Could not extract Class ID from barcode.',
        barcode: rawCode,
      };
    }

    // SECTION 17: Check whether Class ID exists in imported Excel data
    const classRecords = this.records.filter(
      r => r.class_id.trim().toLowerCase() === detectedClassId.toLowerCase()
    );

    if (classRecords.length === 0) {
      return {
        success: false,
        isUnknownClass: true,
        detectedClassId,
        detectedMemberId: detectedMemberId || undefined,
        barcode: rawCode,
        message: `⚠ CLASS ID NOT IMPORTED\n\nScanned Class ID: ${detectedClassId}\nThis Class ID does not exist in the imported Excel data.\n\nThis booklet cannot be added to the current scanning session.`,
      };
    }

    const actualClassId = classRecords[0].class_id;

    // SECTION 19: Check whether Member ID exists under that Class ID
    let targetRecord: ImportedRecord | undefined;

    if (detectedMemberId) {
      targetRecord = classRecords.find(
        r =>
          r.member_id.toLowerCase() === detectedMemberId.toLowerCase() ||
          r.member_id.toLowerCase() === rawCode.toLowerCase() ||
          (r.barcode && sanitizeBarcode(r.barcode).toLowerCase() === rawCode.toLowerCase())
      );

      if (!targetRecord) {
        return {
          success: false,
          isUnknownMember: true,
          detectedClassId: actualClassId,
          detectedMemberId,
          barcode: rawCode,
          message: `⚠ MEMBER ID NOT IMPORTED\n\nClass ID: ${actualClassId}\nMember ID: ${detectedMemberId}\n\nThis Member ID was not found in the imported Excel data.`,
        };
      }
    } else {
      // If no specific member was in the barcode, find first unscanned record in this class
      targetRecord = classRecords.find(r => r.scan_status === 'not_started');
      if (!targetRecord) {
        return {
          success: false,
          isAllScanned: true,
          class_id: actualClassId,
          barcode: rawCode,
          message: `All ${classRecords.length} booklets for Class ${actualClassId} have already been scanned!`,
        };
      }
    }

    // SECTION 20: Duplicate scan protection
    if (targetRecord.scan_status === 'started' || targetRecord.scan_status === 'completed') {
      return {
        success: false,
        isDuplicate: true,
        class_id: actualClassId,
        member_id: targetRecord.member_id,
        barcode: rawCode,
        record: targetRecord,
        message: `⚠ DUPLICATE BOOKLET\n\nMember ${targetRecord.member_id} has already been scanned in Class ${actualClassId}.`,
      };
    }

    // SECTION 18: VALID CLASS + VALID MEMBER -> Process Scan
    const now = new Date().toISOString();
    targetRecord.scan_status = 'started';
    targetRecord.scanned_at = now;
    targetRecord.barcode = rawCode;

    // Update Class Bundle in memory
    this.reconcileBundlesWithRecords();
    const updatedBundle = this.getClassBundle(actualClassId);
    if (updatedBundle) {
      if (updatedBundle.status === 'NOT STARTED') {
        updatedBundle.status = 'IN PROGRESS';
      }
      updatedBundle.updatedAt = now;
    }

    this.saveLocal();

    // Persist to Supabase in background
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        await supabase
          .from(this.tableName)
          .update({ scan_status: 'started', scanned_at: now, barcode: rawCode })
          .eq('id', targetRecord.id);

        if (updatedBundle) {
          try {
            await supabase.from('class_bundles').upsert({
              id: updatedBundle.id,
              session_id: updatedBundle.sessionId,
              university_name: updatedBundle.universityName,
              class_id: updatedBundle.classId,
              expected_count: updatedBundle.expectedCount,
              received_count: updatedBundle.receivedCount,
              missing_count: updatedBundle.missingCount,
              status: updatedBundle.status,
              is_saved: updatedBundle.isSaved,
              is_completed: updatedBundle.isCompleted,
              saved_at: updatedBundle.savedAt,
              updated_at: now,
            });
          } catch {}
        }
      } catch (e) {
        console.warn('Sync scan note:', e);
      }
    }

    this.notify();

    return {
      success: true,
      class_id: actualClassId,
      member_id: targetRecord.member_id,
      record: targetRecord,
      bundle: updatedBundle || undefined,
      message: `✓ Scanned ${targetRecord.member_id} for Class ${actualClassId}`,
    };
  }

  /**
   * Process First Booklet Scan (Universal or Dashboard Scan)
   * Section 3:
   * 1. Detect Class ID.
   * 2. Identify corresponding class.
   * 3. Immediately redirect user to dedicated Bundle Statistics screen for that Class ID.
   * 4. Do NOT keep camera visible on Bundle Statistics screen.
   */
  public async processFirstBooklet(barcodeInput: string): Promise<ScanResult> {
    const barcode = sanitizeBarcode(barcodeInput);
    if (!barcode) {
      return { success: false, message: 'Please provide a valid barcode.' };
    }

    // 1. Duplicate check across all received booklets
    const existingScanned = this.records.find(
      r => r.barcode && sanitizeBarcode(r.barcode).toLowerCase() === barcode.toLowerCase()
    );
    if (existingScanned) {
      return {
        success: false,
        isDuplicate: true,
        class_id: existingScanned.class_id,
        member_id: existingScanned.member_id,
        message: `⚠ DUPLICATE BOOKLET DETECTED\n\nMember ${existingScanned.member_id} has already been received in Class ${existingScanned.class_id}.`,
        record: existingScanned,
      };
    }

    // 2. Detect Class ID
    const detectedClassId = this.detectClassId(barcode);
    if (!detectedClassId) {
      return { success: false, message: `Could not detect Class ID from barcode "${barcode}". Minimum 4 characters required.` };
    }

    // 3. Find imported records for this Class ID
    const classRecords = this.records.filter(
      r => r.class_id.trim().toLowerCase() === detectedClassId.toLowerCase()
    );

    if (classRecords.length === 0) {
      return {
        success: false,
        isUnknownClass: true,
        class_id: detectedClassId,
        message: `⚠ UNKNOWN CLASS DETECTED\n\nNo imported records found for Class ID "${detectedClassId}". Please import Class ${detectedClassId} data first.`,
      };
    }

    // 4. Find matching unscanned record (prefer exact member_id match in barcode, else next unscanned)
    let targetRecord = classRecords.find(
      r => r.scan_status === 'not_started' && r.member_id && barcode.toLowerCase().includes(r.member_id.toLowerCase())
    );
    if (!targetRecord) {
      targetRecord = classRecords.find(r => r.scan_status === 'not_started');
    }

    if (!targetRecord) {
      return {
        success: false,
        isAllScanned: true,
        class_id: detectedClassId,
        message: `All ${classRecords.length} records for Class ID "${detectedClassId}" have already been received!`,
      };
    }

    // 5. Update record
    const now = new Date().toISOString();
    targetRecord.scan_status = 'started';
    targetRecord.scanned_at = now;
    targetRecord.barcode = barcode;

    // 6. Update Bundle
    this.reconcileBundlesWithRecords();
    const updatedBundle = this.getClassBundle(detectedClassId);
    if (updatedBundle) {
      if (updatedBundle.status === 'NOT STARTED') {
        updatedBundle.status = 'IN PROGRESS';
      }
      updatedBundle.updatedAt = now;
    }

    this.saveLocal();

    // Sync to Supabase in background
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        await supabase
          .from(this.tableName)
          .update({ scan_status: 'started', scanned_at: now, barcode: barcode })
          .eq('id', targetRecord.id);

        if (updatedBundle) {
          try {
            await supabase.from('class_bundles').upsert({
              id: updatedBundle.id,
              session_id: updatedBundle.sessionId,
              university_name: updatedBundle.universityName,
              class_id: updatedBundle.classId,
              expected_count: updatedBundle.expectedCount,
              received_count: updatedBundle.receivedCount,
              missing_count: updatedBundle.missingCount,
              status: updatedBundle.status,
              is_saved: updatedBundle.isSaved,
              is_completed: updatedBundle.isCompleted,
              saved_at: updatedBundle.savedAt,
              updated_at: now,
            });
          } catch {}
        }
      } catch (e) {
        console.warn('Sync first booklet note:', e);
      }
    }

    return {
      success: true,
      class_id: targetRecord.class_id,
      member_id: targetRecord.member_id,
      record: targetRecord,
      bundle: updatedBundle || undefined,
      message: `Detected Class ${targetRecord.class_id} • Booklet Received for Member ${targetRecord.member_id}`,
    };
  }

  /**
   * Process Booklet Scan Inside an Active Class Bundle Workflow (Section 10 & 11)
   * 1. Duplicate Scan Protection (Section 10)
   * 2. Wrong Class Protection (Section 11)
   * 3. Match Member Record
   * 4. Update Stats & Detect 100% Completion (Section 8)
   */
  public async processBundleBooklet(currentClassId: string, barcodeInput: string): Promise<ScanResult> {
    const barcode = sanitizeBarcode(barcodeInput);
    if (!barcode) {
      return { success: false, message: 'Please provide a valid barcode.' };
    }

    const cleanCurrentClass = currentClassId.trim().toLowerCase();

    // 1. Duplicate Scan Protection (Section 10)
    const dupRecord = this.records.find(
      r => r.barcode && sanitizeBarcode(r.barcode).toLowerCase() === barcode.toLowerCase()
    );
    if (dupRecord) {
      return {
        success: false,
        isDuplicate: true,
        class_id: dupRecord.class_id,
        member_id: dupRecord.member_id,
        message: `⚠ DUPLICATE BOOKLET DETECTED\n\nMember ${dupRecord.member_id} has already been received in Class ${dupRecord.class_id}.`,
        record: dupRecord,
      };
    }

    // 2. Wrong Class Protection (Section 11)
    const detectedClassId = this.detectClassId(barcode);
    if (detectedClassId && detectedClassId.toLowerCase() !== cleanCurrentClass) {
      // Check if this detected class exists in database
      const isOtherKnownClass = this.records.some(r => r.class_id.trim().toLowerCase() === detectedClassId.toLowerCase());
      if (isOtherKnownClass) {
        return {
          success: false,
          isWrongClass: true,
          currentClassId,
          detectedClassId,
          message: `⚠ WRONG CLASS DETECTED\n\nCurrent Bundle: Class ${currentClassId}\nDetected Class: Class ${detectedClassId}\n\nThis booklet belongs to Class ${detectedClassId}, not Class ${currentClassId}.`,
        };
      }
    }

    // 3. Match member record in active Class ID
    const classRecords = this.records.filter(r => r.class_id.trim().toLowerCase() === cleanCurrentClass);
    if (classRecords.length === 0) {
      return {
        success: false,
        isUnknownClass: true,
        class_id: currentClassId,
        message: `No records found for active Class ${currentClassId}.`,
      };
    }

    // Match exact member ID if inside barcode, else next unscanned
    let targetRecord = classRecords.find(
      r => r.scan_status === 'not_started' && r.member_id && barcode.toLowerCase().includes(r.member_id.toLowerCase())
    );
    if (!targetRecord) {
      targetRecord = classRecords.find(r => r.scan_status === 'not_started');
    }

    if (!targetRecord) {
      return {
        success: false,
        isAllScanned: true,
        class_id: currentClassId,
        message: `All ${classRecords.length} booklets for Class ${currentClassId} have already been received!`,
      };
    }

    // 4. Update record
    const now = new Date().toISOString();
    targetRecord.scan_status = 'started';
    targetRecord.scanned_at = now;
    targetRecord.barcode = barcode;

    // 5. Update bundle
    this.reconcileBundlesWithRecords();
    const updatedBundle = this.getClassBundle(currentClassId);
    const isComplete = updatedBundle ? updatedBundle.receivedCount >= updatedBundle.expectedCount : false;

    this.saveLocal();

    // 6. Push to Supabase
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        await supabase
          .from(this.tableName)
          .update({ scan_status: 'started', scanned_at: now, barcode: barcode })
          .eq('id', targetRecord.id);

        if (updatedBundle) {
          try {
            await supabase.from('class_bundles').upsert({
              id: updatedBundle.id,
              session_id: updatedBundle.sessionId,
              university_name: updatedBundle.universityName,
              class_id: updatedBundle.classId,
              expected_count: updatedBundle.expectedCount,
              received_count: updatedBundle.receivedCount,
              missing_count: updatedBundle.missingCount,
              status: updatedBundle.status,
              is_saved: updatedBundle.isSaved,
              is_completed: updatedBundle.isCompleted,
              saved_at: updatedBundle.savedAt,
              updated_at: now,
            });
          } catch {}
        }
      } catch (err) {
        console.warn('Sync bundle booklet note:', err);
      }
    }

    return {
      success: true,
      class_id: targetRecord.class_id,
      member_id: targetRecord.member_id,
      record: targetRecord,
      bundle: updatedBundle || undefined,
      isComplete,
      message: `Verified: Member ${targetRecord.member_id} received for Class ${targetRecord.class_id}`,
    };
  }

  /**
   * Save Class Bundle (Sections 7, 8, 9, 13)
   * Handles Partial Bundle Save or Complete Bundle Save.
   * Persists bundle state to Supabase, updates status to PARTIAL / SAVED or COMPLETED.
   */
  public async saveBundle(
    classId: string,
    forceComplete: boolean = false
  ): Promise<{ success: boolean; bundle?: ClassBundle; error?: string }> {
    const cleanClassId = classId.trim();
    const bundle = this.getClassBundle(cleanClassId);
    if (!bundle) {
      return { success: false, error: `Bundle for Class ${cleanClassId} not found.` };
    }

    const now = new Date().toISOString();
    const isCompleted = forceComplete || (bundle.expectedCount > 0 && bundle.receivedCount >= bundle.expectedCount);

    bundle.isSaved = true;
    bundle.savedAt = now;
    bundle.updatedAt = now;

    if (isCompleted) {
      bundle.isCompleted = true;
      bundle.status = 'COMPLETED';
    } else {
      bundle.isCompleted = false;
      bundle.status = 'PARTIAL / SAVED';
    }

    // Update records in this class with saved_at
    for (const r of this.records) {
      if (r.class_id.trim().toLowerCase() === cleanClassId.toLowerCase()) {
        r.saved_at = now;
        if (isCompleted && r.scan_status === 'started') {
          r.scan_status = 'completed';
        }
      }
    }

    this.saveLocal();

    // Persist to Supabase
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        // Upsert bundle
        try {
          await supabase.from('class_bundles').upsert({
            id: bundle.id,
            session_id: bundle.sessionId,
            university_name: bundle.universityName,
            class_id: bundle.classId,
            expected_count: bundle.expectedCount,
            received_count: bundle.receivedCount,
            missing_count: bundle.missingCount,
            status: bundle.status,
            is_saved: bundle.isSaved,
            is_completed: bundle.isCompleted,
            saved_at: bundle.savedAt,
            updated_at: now,
          });
        } catch (bErr) {
          console.warn('class_bundles table note in Supabase:', bErr);
        }

        // Update records in Supabase
        await supabase
          .from(this.tableName)
          .update({
            saved_at: now,
            scan_status: isCompleted ? 'completed' : 'started',
          })
          .eq('class_id', cleanClassId)
          .neq('scan_status', 'not_started');
      } catch (err: any) {
        console.warn('Supabase saveBundle sync note:', err);
      }
    }

    this.notify();
    return { success: true, bundle };
  }

  /**
   * Reopen Completed Class Bundle (Section 13)
   * Allows operator to reopen a completed/locked bundle for adjustments.
   */
  public async reopenBundle(classId: string): Promise<{ success: boolean; bundle?: ClassBundle; error?: string }> {
    const cleanClassId = classId.trim();
    const bundle = this.getClassBundle(cleanClassId);
    if (!bundle) {
      return { success: false, error: `Bundle for Class ${cleanClassId} not found.` };
    }

    const now = new Date().toISOString();
    bundle.isCompleted = false;
    bundle.isSaved = false;
    bundle.status = bundle.receivedCount > 0 ? 'IN PROGRESS' : 'NOT STARTED';
    bundle.updatedAt = now;

    // Reset records marked 'completed' back to 'started'
    for (const r of this.records) {
      if (r.class_id.trim().toLowerCase() === cleanClassId.toLowerCase()) {
        if (r.scan_status === 'completed') {
          r.scan_status = 'started';
        }
      }
    }

    this.saveLocal();

    // Sync to Supabase
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        try {
          await supabase.from('class_bundles').upsert({
            id: bundle.id,
            session_id: bundle.sessionId,
            university_name: bundle.universityName,
            class_id: bundle.classId,
            status: bundle.status,
            is_completed: false,
            is_saved: false,
            updated_at: now,
          });
        } catch {}

        await supabase
          .from(this.tableName)
          .update({ scan_status: 'started' })
          .eq('class_id', cleanClassId)
          .eq('scan_status', 'completed');
      } catch (err) {
        console.warn('Supabase reopenBundle note:', err);
      }
    }

    this.notify();
    return { success: true, bundle };
  }

  /**
   * Session Summary & Final Reconciliation (Section 18 & Operator Sign-off)
   * Single final screen calculating Total Classes, Completed, Partial, Not Started, Total Expected, Received, Missing.
   */
  public getSessionSummary(): SessionSummary {
    const bundles = this.getClassBundles();
    const universityName = this.activeSession?.university_name || this.records[0]?.university_name || 'General University';

    const totalClasses = bundles.length;
    const completedClasses = bundles.filter(b => b.status === 'COMPLETED').length;
    const partialClasses = bundles.filter(b => b.status === 'PARTIAL / SAVED').length;
    const inProgressClasses = bundles.filter(b => b.status === 'IN PROGRESS').length;
    const notStartedClasses = bundles.filter(b => b.status === 'NOT STARTED').length;

    let totalExpected = 0;
    let totalReceived = 0;
    let totalMissing = 0;

    for (const b of bundles) {
      totalExpected += b.expectedCount;
      totalReceived += b.receivedCount;
      totalMissing += b.missingCount;
    }

    const overallCompletion = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;

    return {
      universityName,
      totalClasses,
      completedClasses,
      partialClasses,
      inProgressClasses,
      notStartedClasses,
      totalExpected,
      totalReceived,
      totalMissing,
      overallCompletion,
      bundles,
    };
  }

  /**
   * Barcode Scanning Engine
   * Matches specification:
   * 1. Read barcode (e.g. 003121MIS0074)
   * 2. Strip Code 39 asterisks if present (*003121MIS0074* -> 003121MIS0074)
   * 3. Extract first 4 characters => Class ID (e.g. 0031)
   * 4. Fetch imported records for Class ID
   * 5. Match member record
   * 6. Duplicate scan protection
   * 7. Update record: scan_status='started', scanned_at=now, barcode=barcode
   */
  public async processBarcode(barcodeInput: string): Promise<ScanResult> {
    const barcode = sanitizeBarcode(barcodeInput);
    if (!barcode) {
      return { success: false, message: 'Empty barcode received' };
    }

    // 1. Duplicate Scan Protection (Section 20 & V3)
    const existingWithBarcode = this.records.find(
      r => r.barcode && sanitizeBarcode(r.barcode).toLowerCase() === barcode.toLowerCase()
    );
    if (existingWithBarcode) {
      return {
        success: false,
        isDuplicate: true,
        message: `Barcode "${barcode}" has already been scanned for Class ${existingWithBarcode.class_id} (Member ${existingWithBarcode.member_id})`,
        record: existingWithBarcode,
        class_id: existingWithBarcode.class_id,
        member_id: existingWithBarcode.member_id,
      };
    }

    // 2. Barcode -> Class ID Detection (Section 12)
    // The first 4 characters represent the Class ID
    if (barcode.length < 4) {
      return {
        success: false,
        message: `Barcode "${barcode}" is too short. Minimum 4 characters required for Class ID.`,
      };
    }

    const detectedClassId = barcode.substring(0, 4);

    // 3. Fetch imported records for this Class ID (Section 13)
    const classRecords = this.records.filter(
      r => r.class_id.trim().toLowerCase() === detectedClassId.toLowerCase()
    );

    if (classRecords.length === 0) {
      return {
        success: false,
        isUnknownClass: true,
        class_id: detectedClassId,
        message: `No imported records found for Class ID "${detectedClassId}". Please import Class ${detectedClassId} data first.`,
      };
    }

    // 4. Barcode Matching Logic (Section 14)
    // Check if the barcode contains or matches a specific member_id
    // e.g. "003121MIS0074" -> contains "MIS0074" or "21MIS0074"
    let targetRecord = classRecords.find(
      r =>
        r.scan_status === 'not_started' &&
        r.member_id &&
        barcode.toLowerCase().includes(r.member_id.toLowerCase())
    );

    // If no exact member_id match found in barcode string, take the next unscanned record in this Class ID
    if (!targetRecord) {
      targetRecord = classRecords.find(r => r.scan_status === 'not_started');
    }

    if (!targetRecord) {
      return {
        success: false,
        isAllScanned: true,
        class_id: detectedClassId,
        message: `All ${classRecords.length} records for Class ID "${detectedClassId}" have already been scanned!`,
      };
    }

    // 5. Update record to 'started'
    const timestamp = new Date().toISOString();
    targetRecord.scan_status = 'started';
    targetRecord.scanned_at = timestamp;
    targetRecord.barcode = barcode;

    // Save locally
    this.saveLocal();

    // Sync to Supabase in background if table is available
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        const { error } = await supabase
          .from(this.tableName)
          .update({
            scan_status: 'started',
            scanned_at: timestamp,
            barcode: barcode,
          })
          .eq('id', targetRecord.id);

        if (error && (error.code === 'PGRST205' || error.message?.includes('schema cache'))) {
          this.isRemoteTableAvailable = false;
        }
      } catch (err) {
        console.warn('Sync scan record note:', err);
      }
    }

    return {
      success: true,
      message: `Successfully verified Class ${targetRecord.class_id} • Member ${targetRecord.member_id}`,
      record: targetRecord,
      class_id: targetRecord.class_id,
      member_id: targetRecord.member_id,
    };
  }

  /**
   * Validate and Stage a Barcode (Req 1, 2, 3, 6):
   * Stages scanned barcode into in-memory list under the camera scanner.
   * Performs airtight duplicate detection:
   * 1. Check if barcode is already in currently staged (unsaved) list
   * 2. Check if barcode is already saved in database
   * 3. Extract Class ID (first 4 characters)
   * 4. Match available unscanned member in that Class ID
   * 5. Returns staged item without mutating DB until user clicks 'Save Inward Data'
   */
  public validateAndStageBarcode(
    barcodeInput: string,
    stagedList: StagedScanItem[] = []
  ): ScanResult {
    const barcode = sanitizeBarcode(barcodeInput);
    if (!barcode || barcode.length < 4) {
      return {
        success: false,
        message: `Barcode "${barcodeInput}" is invalid. Minimum 4 characters required.`,
      };
    }

    // 1. DUPLICATE CHECK: In current unsaved scan batch (Req 6)
    const dupInStaged = stagedList.find(
      s => sanitizeBarcode(s.barcode).toLowerCase() === barcode.toLowerCase()
    );
    if (dupInStaged) {
      return {
        success: false,
        isDuplicate: true,
        isDuplicateInStaging: true,
        class_id: dupInStaged.classId,
        member_id: dupInStaged.memberId,
        message: `Barcode "${barcode}" is already in your current unsaved scan list! (Class ${dupInStaged.classId} • Member ${dupInStaged.memberId})`,
      };
    }

    // 2. DUPLICATE CHECK: In database (saved records) (Req 6)
    const dupInDb = this.records.find(
      r =>
        r.barcode &&
        sanitizeBarcode(r.barcode).toLowerCase() === barcode.toLowerCase() &&
        (r.scan_status === 'started' || r.scan_status === 'completed')
    );
    if (dupInDb) {
      return {
        success: false,
        isDuplicate: true,
        record: dupInDb,
        class_id: dupInDb.class_id,
        member_id: dupInDb.member_id,
        message: `Barcode "${barcode}" has already been saved in database for Class ${dupInDb.class_id} (Member ${dupInDb.member_id})`,
      };
    }

    // 3. Class ID Detection (First 4 characters)
    const detectedClassId = barcode.substring(0, 4);
    const classRecords = this.records.filter(
      r => r.class_id.trim().toLowerCase() === detectedClassId.toLowerCase()
    );

    if (classRecords.length === 0) {
      return {
        success: false,
        isUnknownClass: true,
        class_id: detectedClassId,
        message: `No imported records found for Class ID "${detectedClassId}". Please import Class ${detectedClassId} data first.`,
      };
    }

    // Set of member IDs already staged in current session for this class
    const stagedMemberIds = new Set(
      stagedList
        .filter(s => s.classId.toLowerCase() === detectedClassId.toLowerCase())
        .map(s => s.memberId.toLowerCase())
    );

    // 4. Match member record (prefer exact member_id in barcode string, else next unscanned member)
    let targetRecord = classRecords.find(
      r =>
        r.scan_status === 'not_started' &&
        !stagedMemberIds.has(r.member_id.toLowerCase()) &&
        r.member_id &&
        barcode.toLowerCase().includes(r.member_id.toLowerCase())
    );

    if (!targetRecord) {
      targetRecord = classRecords.find(
        r => r.scan_status === 'not_started' && !stagedMemberIds.has(r.member_id.toLowerCase())
      );
    }

    if (!targetRecord) {
      return {
        success: false,
        isAllScanned: true,
        class_id: detectedClassId,
        message: `All ${classRecords.length} records for Class ID "${detectedClassId}" have already been scanned or are in your staging list!`,
      };
    }

    const stagedItem: StagedScanItem = {
      id: `staged_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      recordId: targetRecord.id,
      classId: targetRecord.class_id,
      memberId: targetRecord.member_id,
      barcode,
      scannedAt: new Date().toLocaleTimeString(),
    };

    return {
      success: true,
      message: `Verified: Class ${targetRecord.class_id} • Member ${targetRecord.member_id}`,
      record: targetRecord,
      class_id: targetRecord.class_id,
      member_id: targetRecord.member_id,
      item: stagedItem,
    };
  }

  /**
   * Commit Staged Scans to Backend (Req 3):
   * Commits all verified scans from the staging list to localStorage & Supabase.
   */
  public async commitStagedScans(
    stagedList: StagedScanItem[]
  ): Promise<{ success: boolean; count: number; error?: string }> {
    if (!stagedList || stagedList.length === 0) {
      return { success: false, count: 0, error: 'No scanned records to save.' };
    }

    const now = new Date().toISOString();
    let savedCount = 0;

    for (const item of stagedList) {
      const target = this.records.find(r => r.id === item.recordId);
      if (target) {
        target.scan_status = 'started';
        target.scanned_at = now;
        target.barcode = item.barcode;
        savedCount++;
      }
    }

    this.saveLocal();

    // Push to Supabase if configured and available
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        for (const item of stagedList) {
          const { error } = await supabase
            .from(this.tableName)
            .update({
              scan_status: 'started',
              scanned_at: now,
              barcode: item.barcode,
            })
            .eq('id', item.recordId);

          if (error && (error.code === 'PGRST205' || error.message?.includes('schema cache'))) {
            this.isRemoteTableAvailable = false;
            break;
          }
        }
      } catch (err) {
        console.warn('Sync commit staged scans note:', err);
      }
    }

    this.notify();
    return { success: true, count: savedCount };
  }

  /**
   * Get Pending (Unscanned) Member IDs / Records for Preview (Req 5)
   */
  public getPendingMembers(classId?: string): ImportedRecord[] {
    return this.records.filter(
      r =>
        (classId && classId !== 'all' ? r.class_id.toLowerCase() === classId.toLowerCase() : true) &&
        r.scan_status === 'not_started'
    );
  }

  /**
   * Get Scanned Records for Preview (Req 5)
   */
  public getScannedMembers(classId?: string): ImportedRecord[] {
    return this.records.filter(
      r =>
        (classId && classId !== 'all' ? r.class_id.toLowerCase() === classId.toLowerCase() : true) &&
        (r.scan_status === 'started' || r.scan_status === 'completed')
    );
  }

  /**
   * Reset or clear all imported records and sessions
   */
  public async clearAll(): Promise<void> {
    this.records = [];
    this.sessions = [];
    this.activeSession = null;
    try {
      localStorage.removeItem(PROD_RECORDS_KEY);
      localStorage.removeItem(PROD_SESSIONS_KEY);
      localStorage.removeItem(PROD_ACTIVE_SESSION_KEY);
      LEGACY_KEYS.forEach(key => localStorage.removeItem(key));
    } catch {}
    this.notify();
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        await supabase.from(this.tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (this.tableName !== 'imported') {
          try {
            await supabase.from('imported').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          } catch {}
        }
        await supabase.from('import_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (e) {
        console.warn('Clear remote note:', e);
      }
    }
  }

  /**
   * Reset scan status for re-scan testing
   */
  public async resetAllScans(): Promise<void> {
    this.records = this.records.map(r => ({
      ...r,
      scan_status: 'not_started',
      scanned_at: null,
      barcode: null,
    }));
    this.saveLocal();
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        await supabase
          .from(this.tableName)
          .update({ scan_status: 'not_started', scanned_at: null, barcode: null })
          .neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (e) {
        console.warn('Reset scans remote note:', e);
      }
    }
  }

  /**
   * EXCEL EXPORT WORKFLOW (Sections 11, 12, 13, 14, 15, 16, 17, 18, 19)
   * Generates a 3-sheet workbook:
   * Sheet 1: Summary (University, Totals, Class ID Breakdown)
   * Sheet 2: Inwarded Data (ONLY scanned records: scan_status = started)
   * Sheet 3: Missing Data (ONLY unscanned records: scan_status = not_started)
   */
  public exportInwardingReport(customUniversityName?: string): {
    success: boolean;
    filename: string;
    inwardedCount: number;
    missingCount: number;
    totalImported: number;
  } {
    const universityName =
      (customUniversityName || '').trim() ||
      this.activeSession?.university_name ||
      this.records[0]?.university_name ||
      'VIT-AP University';

    const totalImported = this.records.length;
    const inwardedRecords = this.records.filter(
      r => r.scan_status === 'started' || r.scan_status === 'completed'
    );
    const missingRecords = this.records.filter(r => r.scan_status === 'not_started');
    const classSummaries = this.getClassIdSummaries();
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // -------------------------------------------------------------------------
    // SHEET 1: Summary (Section 15)
    // -------------------------------------------------------------------------
    const summaryData: any[][] = [
      ['EXAMSCAN INWARDING & RECONCILIATION SUMMARY REPORT', ''],
      ['', ''],
      ['Field', 'Value'],
      ['University', universityName],
      ['Total Imported', totalImported],
      ['Total Inwarded', inwardedRecords.length],
      ['Total Missing', missingRecords.length],
      ['Class IDs', classSummaries.length],
      ['Completion Rate', `${totalImported > 0 ? ((inwardedRecords.length / totalImported) * 100).toFixed(1) : 0}%`],
      ['Export Generated', formattedDate],
      ['', ''],
      ['CLASS ID-WISE SUMMARY', '', '', ''],
      ['Class ID', 'Imported', 'Inwarded', 'Missing'],
      ...classSummaries.map(c => [c.class_id, c.total_imported, c.scanned_count, c.remaining_count]),
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];

    // -------------------------------------------------------------------------
    // SHEET 2: Class-Wise Reconciliation (Section 15 Specification)
    // Suggested columns:
    // University Name, Class ID, Member ID, Expected Status, Scan Status, Bundle Status, Scanned At, Saved At
    // -------------------------------------------------------------------------
    const bundleMap = new Map<string, ClassBundle>();
    this.getClassBundles().forEach(b => bundleMap.set(b.classId.toLowerCase(), b));

    const reconciliationRows: any[][] = [
      ['University Name', 'Class ID', 'Member ID', 'Expected Status', 'Scan Status', 'Bundle Status', 'Scanned At', 'Saved At'],
    ];

    for (const r of this.records) {
      const b = bundleMap.get(r.class_id.trim().toLowerCase());
      const isReceived = r.scan_status === 'started' || r.scan_status === 'completed';
      reconciliationRows.push([
        r.university_name || universityName,
        r.class_id,
        r.member_id,
        'EXPECTED',
        isReceived ? 'RECEIVED' : 'MISSING',
        b ? b.status : 'NOT STARTED',
        r.scanned_at ? new Date(r.scanned_at).toLocaleString() : '—',
        r.saved_at || b?.savedAt ? new Date(r.saved_at || b?.savedAt || '').toLocaleString() : '—',
      ]);
    }

    const wsReconciliation = XLSX.utils.aoa_to_sheet(reconciliationRows);
    wsReconciliation['!cols'] = [
      { wch: 25 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 22 },
      { wch: 22 },
    ];

    // -------------------------------------------------------------------------
    // SHEET 3: Inwarded Data (Section 12: ONLY successfully scanned records)
    // -------------------------------------------------------------------------
    const inwardedData: any[][] = [
      ['University Name', 'Class ID', 'Member ID', 'Barcode', 'Scan Status', 'Scanned At'],
    ];

    if (inwardedRecords.length > 0) {
      inwardedRecords.forEach(r => {
        inwardedData.push([
          r.university_name || universityName,
          r.class_id,
          r.member_id,
          r.barcode || '—',
          'Started',
          r.scanned_at ? new Date(r.scanned_at).toLocaleString() : '—',
        ]);
      });
    } else {
      inwardedData.push(['No inwarded records yet', '', '', '', '', '']);
    }

    const wsInwarded = XLSX.utils.aoa_to_sheet(inwardedData);
    wsInwarded['!cols'] = [
      { wch: 24 },
      { wch: 12 },
      { wch: 16 },
      { wch: 20 },
      { wch: 14 },
      { wch: 22 },
    ];

    // -------------------------------------------------------------------------
    // SHEET 4: Missing Data (Section 13 & 19: ONLY imported records not scanned)
    // -------------------------------------------------------------------------
    const missingData: any[][] = [
      ['University Name', 'Class ID', 'Member ID', 'Barcode', 'Status'],
    ];

    if (missingRecords.length > 0) {
      missingRecords.forEach(r => {
        missingData.push([
          r.university_name || universityName,
          r.class_id,
          r.member_id,
          '', // Blank barcode cell as specified in Section 13
          'Missing',
        ]);
      });
    } else {
      // Section 19: If 0 missing records, show 'No missing records'
      missingData.push(['No missing records', '', '', '', '']);
    }

    const wsMissing = XLSX.utils.aoa_to_sheet(missingData);
    wsMissing['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 }];

    // -------------------------------------------------------------------------
    // WORKBOOK COMPILATION & SANITIZED FILENAME (Section 14)
    // -------------------------------------------------------------------------
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
    XLSX.utils.book_append_sheet(wb, wsReconciliation, 'Class Reconciliation');
    XLSX.utils.book_append_sheet(wb, wsInwarded, 'Inwarded Data');
    XLSX.utils.book_append_sheet(wb, wsMissing, 'Missing Data');

    const cleanUniFilename = universityName
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const filename = `${cleanUniFilename || 'ExamScan'}_Inwarding_Report.xlsx`;

    XLSX.writeFile(wb, filename);

    return {
      success: true,
      filename,
      inwardedCount: inwardedRecords.length,
      missingCount: missingRecords.length,
      totalImported,
    };
  }

  public exportClassWiseExcel(customUniversityName?: string) {
    return this.exportInwardingReport(customUniversityName);
  }

  /**
   * Manually check if table is now created in Supabase, and sync local records to cloud
   */
  public async retryCloudSync(): Promise<{ success: boolean; message: string; syncedCount: number }> {
    if (!isSupabaseConfigured) {
      return { success: false, message: 'Supabase credentials not configured.', syncedCount: 0 };
    }

    this.hasCheckedTable = false;
    const available = await this.checkRemoteTable();

    if (!available) {
      return {
        success: false,
        message: 'Table "imported" still not detected in Supabase schema cache. Please run the SQL migration in Supabase SQL editor.',
        syncedCount: 0,
      };
    }

    // Table is available! Sync any local records up
    if (this.records.length === 0) {
      await this.syncFromSupabase();
      this.initRealtime();
      return { success: true, message: 'Connected to Supabase "imported" table successfully.', syncedCount: 0 };
    }

    let syncedCount = 0;
    try {
      for (let i = 0; i < this.records.length; i += BATCH_SIZE) {
        const chunk = this.records.slice(i, i + BATCH_SIZE).map(r => ({
          id: r.id,
          import_session_id: r.import_session_id,
          university_name: r.university_name,
          class_id: r.class_id,
          member_id: r.member_id,
          barcode: r.barcode,
          scan_status: r.scan_status,
          scanned_at: r.scanned_at,
          created_at: r.created_at,
        }));

        const { error } = await supabase.from(this.tableName).upsert(chunk, { onConflict: 'id' });
        if (error) {
          console.warn('Retry sync upsert note:', error.message);
          break;
        }
        syncedCount += chunk.length;
      }
      this.initRealtime();
      return {
        success: true,
        message: `Successfully synchronized ${syncedCount} records to Supabase cloud database!`,
        syncedCount,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Sync failed', syncedCount };
    }
  }
}

export const importedService = new ImportedService();
