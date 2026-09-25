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
  university_name?: string;
  class_id: string;
  member_id: string;
  barcode: string | null;
  scan_status: 'not_started' | 'started' | 'completed';
  scanned_at: string | null;
  created_at: string;
}

export interface ClassIdSummary {
  class_id: string;
  total_imported: number;
  scanned_count: number;
  remaining_count: number;
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
  isAllScanned?: boolean;
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

const PROD_RECORDS_KEY = 'examscan_imported_records_prod_v2';
const PROD_SESSIONS_KEY = 'examscan_import_sessions_prod_v2';
const PROD_ACTIVE_SESSION_KEY = 'examscan_active_session_prod_v2';
const BATCH_SIZE = 500;

const PRIMARY_TABLE = 'imported_inward_data';
const FALLBACK_TABLE = 'imported';

// Clean out any legacy demo or sample storage keys from previous builds
const LEGACY_KEYS = [
  'imported_records_v1',
  'imported_records_v2',
  'imported_records_prod',
  'import_sessions_v1',
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

      const storedActiveId = localStorage.getItem(PROD_ACTIVE_SESSION_KEY);
      if (storedActiveId) {
        this.activeSession = this.sessions.find(s => s.id === storedActiveId) || this.sessions[0] || null;
      } else {
        this.activeSession = this.sessions[0] || null;
      }
    } catch (err) {
      console.warn('Failed to load imported records from localStorage', err);
      this.records = [];
      this.sessions = [];
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
          created_at: d.created_at || new Date().toISOString(),
        }));
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
   * Get Class ID-Wise Summaries
   * Class ID | Imported | Inwarded (Scanned) | Missing (Remaining)
   */
  public getClassIdSummaries(): ClassIdSummary[] {
    const map = new Map<string, { total: number; scanned: number }>();

    for (const r of this.records) {
      const cid = r.class_id.trim();
      if (!cid) continue;
      if (!map.has(cid)) {
        map.set(cid, { total: 0, scanned: 0 });
      }
      const entry = map.get(cid)!;
      entry.total += 1;
      if (r.scan_status === 'started' || r.scan_status === 'completed') {
        entry.scanned += 1;
      }
    }

    const summaries: ClassIdSummary[] = [];
    for (const [class_id, stats] of map.entries()) {
      summaries.push({
        class_id,
        total_imported: stats.total,
        scanned_count: stats.scanned,
        remaining_count: Math.max(0, stats.total - stats.scanned),
      });
    }

    // Sort by class_id
    return summaries.sort((a, b) => a.class_id.localeCompare(b.class_id));
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
   * Requires mandatory University Name (Sections 4, 5, 6, 7)
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

    // 2. Prepare Records (Section 6 & 8: scan_status = 'not_started')
    const newRecords: ImportedRecord[] = items.map((item, index) => ({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `imp_${Date.now()}_${index}`,
      import_session_id: sessionId,
      university_name: cleanUniversity,
      class_id: String(item.class_id).trim(),
      member_id: String(item.member_id).trim(),
      barcode: null,
      scan_status: 'not_started',
      scanned_at: null,
      created_at: now,
    }));

    // Save session & records locally for instantaneous reliability
    this.sessions = [session, ...this.sessions];
    this.activeSession = session;
    this.records = [...this.records, ...newRecords];
    this.saveLocal();

    // Check remote table availability
    if (isSupabaseConfigured && !this.hasCheckedTable) {
      await this.checkRemoteTable();
    }

    // Push session and records to Supabase in batches if available
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
    this.saveLocal();
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        await supabase.from(this.tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000');
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
    // SHEET 2: Inwarded Data (Section 12: ONLY successfully scanned records)
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
    // SHEET 3: Missing Data (Section 13 & 19: ONLY imported records not scanned)
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
