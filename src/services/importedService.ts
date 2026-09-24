// ==============================================================================
// Imported Data Service (Excel Inwarding & Barcode Scanner Workflow)
// Table: imported (class_id, member_id, barcode, scan_status, scanned_at)
// Supports 1,000 to 100,000+ records with batching and local reactivity
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export interface ImportedRecord {
  id: string;
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

const LOCAL_STORAGE_KEY = 'imported_records_v1';
const BATCH_SIZE = 500;

class ImportedService {
  private records: ImportedRecord[] = [];
  private listeners: (() => void)[] = [];
  private isLoadedFromRemote = false;
  private realtimeChannel: any = null;

  constructor() {
    this.initLocalData();
    this.initRealtime();
  }

  private initLocalData() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        this.records = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Failed to load imported records from localStorage', err);
      this.records = [];
    }
  }

  private initRealtime() {
    if (isSupabaseConfigured && typeof window !== 'undefined') {
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
        console.error('Error in listener callback:', e);
      }
    });
  }

  private saveLocal() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.records));
      this.notify();
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  /**
   * Sync records from Supabase into memory
   */
  public async syncFromSupabase(): Promise<ImportedRecord[]> {
    if (!isSupabaseConfigured) {
      return this.records;
    }

    try {
      const { data, error } = await supabase
        .from('imported')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(20000);

      if (error) {
        console.warn('Supabase query error on imported table:', error.message);
        return this.records;
      }

      if (data && Array.isArray(data)) {
        this.records = data.map((d: any) => ({
          id: d.id,
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
      console.warn('Sync failed, relying on local records:', e);
      return this.records;
    }
  }

  /**
   * Get 4 Main Statistics
   * 1. Scan Started
   * 2. Scan Not Started (Formula: Total Imported Users - Scan Started)
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
   * Get Class ID-Wise Summaries
   * Class ID | Imported | Scanned | Remaining
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
    if (classId) {
      return this.records.filter(r => r.class_id.trim() === classId.trim());
    }
    return [...this.records];
  }

  /**
   * Bulk insert imported records into Supabase and local cache
   * Handles batching for high performance (1,000 to 100,000+ records)
   */
  public async bulkInsert(
    items: { class_id: string; member_id: string }[],
    onProgress?: (insertedCount: number, total: number) => void
  ): Promise<{ success: boolean; inserted: number; error?: string }> {
    if (!items || items.length === 0) {
      return { success: false, inserted: 0, error: 'No records to insert' };
    }

    const now = new Date().toISOString();
    const newRecords: ImportedRecord[] = items.map((item, index) => ({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `imp_${Date.now()}_${index}`,
      class_id: String(item.class_id).trim(),
      member_id: String(item.member_id).trim(),
      barcode: null,
      scan_status: 'not_started',
      scanned_at: null,
      created_at: now,
    }));

    // Update memory & local storage first for instantaneous UX
    this.records = [...this.records, ...newRecords];
    this.saveLocal();

    // If Supabase is configured, push in batches
    if (isSupabaseConfigured) {
      try {
        const total = newRecords.length;
        let processed = 0;

        for (let i = 0; i < total; i += BATCH_SIZE) {
          const chunk = newRecords.slice(i, i + BATCH_SIZE).map(r => ({
            id: r.id,
            class_id: r.class_id,
            member_id: r.member_id,
            barcode: null,
            scan_status: 'not_started',
            scanned_at: null,
            created_at: r.created_at,
          }));

          const { error } = await supabase.from('imported').insert(chunk);
          if (error) {
            console.error('Supabase batch insert error:', error);
            // Even if Supabase throws (e.g. table not migrated yet), local records remain available
          }
          processed += chunk.length;
          if (onProgress) {
            onProgress(processed, total);
          }
        }
      } catch (err: any) {
        console.warn('Batch insert to Supabase encountered warning:', err);
      }
    } else {
      if (onProgress) {
        onProgress(newRecords.length, newRecords.length);
      }
    }

    this.notify();
    return { success: true, inserted: newRecords.length };
  }

  /**
   * Barcode Scanning Engine
   * Matches specification:
   * 1. Read barcode (e.g. 040322MIS0089)
   * 2. Extract first 4 characters => Class ID (e.g. 0403)
   * 3. Fetch imported records for Class ID
   * 4. Match member record:
   *    - Check if barcode contains a specific member_id
   *    - Or assign to next unscanned record in that Class ID
   * 5. Duplicate scan protection
   * 6. Update record: scan_status='started', scanned_at=now, barcode=barcode
   */
  public async processBarcode(barcodeInput: string): Promise<ScanResult> {
    const barcode = barcodeInput.trim();
    if (!barcode) {
      return { success: false, message: 'Empty barcode received' };
    }

    // 1. Duplicate Scan Protection (Section 20)
    const existingWithBarcode = this.records.find(
      r => r.barcode && r.barcode.toLowerCase() === barcode.toLowerCase()
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
    // e.g. "040322MIS0089" -> contains "MIS0089"
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

    // 5. Update record
    const timestamp = new Date().toISOString();
    targetRecord.scan_status = 'started';
    targetRecord.scanned_at = timestamp;
    targetRecord.barcode = barcode;

    // Save locally
    this.saveLocal();

    // Sync to Supabase in background
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('imported')
          .update({
            scan_status: 'started',
            scanned_at: timestamp,
            barcode: barcode,
          })
          .eq('id', targetRecord.id);
      } catch (err) {
        console.warn('Failed updating Supabase scan record:', err);
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
   * Reset or clear all imported records
   */
  public async clearAll(): Promise<void> {
    this.records = [];
    this.saveLocal();
    if (isSupabaseConfigured) {
      try {
        await supabase.from('imported').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (e) {
        console.warn('Clear remote failed:', e);
      }
    }
  }

  /**
   * Reset scan status for testing/re-scan
   */
  public async resetAllScans(): Promise<void> {
    this.records = this.records.map(r => ({
      ...r,
      scan_status: 'not_started',
      scanned_at: null,
      barcode: null,
    }));
    this.saveLocal();
    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('imported')
          .update({ scan_status: 'not_started', scanned_at: null, barcode: null })
          .neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (e) {
        console.warn('Reset scans remote failed:', e);
      }
    }
  }
}

export const importedService = new ImportedService();
