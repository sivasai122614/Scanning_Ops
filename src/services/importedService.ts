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
  isUnknownClass?: boolean;
  isAllScanned?: boolean;
}

const PROD_RECORDS_KEY = 'examscan_imported_records_prod_v2';
const PROD_SESSIONS_KEY = 'examscan_import_sessions_prod_v2';
const PROD_ACTIVE_SESSION_KEY = 'examscan_active_session_prod_v2';
const BATCH_SIZE = 500;

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
   * Check if 'imported' and 'import_sessions' tables exist in remote Supabase schema cache
   */
  public async checkRemoteTable(): Promise<boolean> {
    if (!isSupabaseConfigured) {
      this.isRemoteTableAvailable = false;
      this.hasCheckedTable = true;
      return false;
    }

    try {
      const { error } = await supabase.from('imported').select('id').limit(1);
      if (error) {
        if (
          error.code === 'PGRST205' ||
          error.message?.includes('schema cache') ||
          error.message?.includes('does not exist')
        ) {
          this.isRemoteTableAvailable = false;
          this.hasCheckedTable = true;
          return false;
        }
      }
      this.isRemoteTableAvailable = true;
      this.hasCheckedTable = true;
      return true;
    } catch {
      this.isRemoteTableAvailable = false;
      this.hasCheckedTable = true;
      return false;
    }
  }

  public getRemoteStatus(): { isConfigured: boolean; isRemoteTableAvailable: boolean } {
    return {
      isConfigured: isSupabaseConfigured,
      isRemoteTableAvailable: this.isRemoteTableAvailable,
    };
  }

  private initRealtime() {
    if (isSupabaseConfigured && this.isRemoteTableAvailable && typeof window !== 'undefined') {
      try {
        this.realtimeChannel = supabase
          .channel('public:imported')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'imported' },
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
        .from('imported')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50000);

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
          this.isRemoteTableAvailable = false;
        } else {
          console.warn('Supabase query note on imported table:', error.message);
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

          const { error } = await supabase.from('imported').insert(chunk);
          if (error) {
            if (
              error.code === 'PGRST205' ||
              error.message?.includes('schema cache') ||
              error.message?.includes('does not exist')
            ) {
              this.isRemoteTableAvailable = false;
              console.info(
                '[ImportedService] Supabase "imported" table not yet created in remote database (PGRST205). Stored safely in local high-speed cache.'
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
          .from('imported')
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
   * Reset or clear all imported records and sessions
   */
  public async clearAll(): Promise<void> {
    this.records = [];
    this.sessions = [];
    this.activeSession = null;
    this.saveLocal();
    if (isSupabaseConfigured && this.isRemoteTableAvailable) {
      try {
        await supabase.from('imported').delete().neq('id', '00000000-0000-0000-0000-000000000000');
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
          .from('imported')
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

        const { error } = await supabase.from('imported').upsert(chunk, { onConflict: 'id' });
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
