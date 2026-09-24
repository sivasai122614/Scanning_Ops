// ==============================================================================
// Exam Operations Data Store (Sessions, Inward Schedules, Scans, Metrics)
// Strictly ZERO hardcoded sample data. Starts completely empty.
// ==============================================================================

import { ExamSession, InwardSchedule, ScannedScript, OperationalMetrics } from '../types/exam';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const SESSIONS_STORAGE_KEY = 'exam_ops_sessions_v2';
const INWARD_STORAGE_KEY = 'exam_ops_inward_v2';
const SCANS_STORAGE_KEY = 'exam_ops_scans_v2';
const PENDING_SYNC_STORAGE_KEY = 'exam_ops_pending_sync_v1';

class ExamStore {
  private sessions: ExamSession[] = [];
  private inwardSchedules: InwardSchedule[] = [];
  private scans: ScannedScript[] = [];
  private pendingSyncQueue: ScannedScript[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.initStore();
    this.initNetworkListener();
  }

  private initStore() {
    try {
      const storedSessions = localStorage.getItem(SESSIONS_STORAGE_KEY);
      this.sessions = storedSessions ? JSON.parse(storedSessions) : [];

      const storedInward = localStorage.getItem(INWARD_STORAGE_KEY);
      if (storedInward) {
        const raw: InwardSchedule[] = JSON.parse(storedInward);
        const seen = new Set<string>();
        this.inwardSchedules = raw.filter(item => {
          const key = (item.scheduled_id || item.id || '').trim().toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else {
        this.inwardSchedules = [];
      }

      const storedScans = localStorage.getItem(SCANS_STORAGE_KEY);
      this.scans = storedScans ? JSON.parse(storedScans) : [];

      const storedPending = localStorage.getItem(PENDING_SYNC_STORAGE_KEY);
      this.pendingSyncQueue = storedPending ? JSON.parse(storedPending) : [];
    } catch (e) {
      console.warn('Failed loading exam operations data from localStorage:', e);
      this.sessions = [];
      this.inwardSchedules = [];
      this.scans = [];
      this.pendingSyncQueue = [];
    }
  }

  private initNetworkListener() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.flushPendingSync();
      });
      // Periodic background sync attempt
      setInterval(() => {
        if (navigator.onLine && this.pendingSyncQueue.length > 0) {
          this.flushPendingSync();
        }
      }, 15000);
    }
  }

  private notify() {
    this.listeners.forEach(cb => cb());
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private saveSessions() {
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(this.sessions));
      this.notify();
    } catch (e) {
      console.error('Failed to save sessions:', e);
    }
  }

  private saveInward() {
    try {
      localStorage.setItem(INWARD_STORAGE_KEY, JSON.stringify(this.inwardSchedules));
      this.notify();
    } catch (e) {
      console.error('Failed to save inward entries:', e);
    }
  }

  private saveScans() {
    try {
      localStorage.setItem(SCANS_STORAGE_KEY, JSON.stringify(this.scans));
      this.notify();
    } catch (e) {
      console.error('Failed to save scans:', e);
    }
  }

  private sessionUuidCache: Map<string, string> = new Map();
  private cachedCenterId: string | null = null;

  private savePendingSync() {
    try {
      localStorage.setItem(PENDING_SYNC_STORAGE_KEY, JSON.stringify(this.pendingSyncQueue));
    } catch (e) {
      console.error('Failed to save pending sync queue:', e);
    }
  }

  private enqueuePendingSync(scan: ScannedScript) {
    if (!this.pendingSyncQueue.some(s => s.id === scan.id)) {
      this.pendingSyncQueue.push(scan);
      this.savePendingSync();
    }
  }

  private async getOrCreateSupabaseSession(scan: ScannedScript): Promise<string | null> {
    const key = scan.scheduled_id || scan.class_id;
    if (this.sessionUuidCache.has(key)) {
      return this.sessionUuidCache.get(key)!;
    }

    try {
      // 1. Ensure a valid center exists in Supabase
      if (!this.cachedCenterId) {
        const { data: centerData } = await supabase.from('centers').select('id').limit(1);
        if (centerData && centerData.length > 0) {
          this.cachedCenterId = centerData[0].id;
        } else {
          // Create default center if table is empty
          const { data: newCenter } = await supabase
            .from('centers')
            .insert({
              center_code: 'CTR-001',
              center_name: 'Main Examination Center',
              location: 'Campus Control',
            })
            .select('id')
            .single();
          if (newCenter) {
            this.cachedCenterId = newCenter.id;
          }
        }
      }

      if (!this.cachedCenterId) {
        return null;
      }

      // 2. Query exam_sessions by session_code
      const { data: existingSession } = await supabase
        .from('exam_sessions')
        .select('id')
        .eq('session_code', key)
        .maybeSingle();

      if (existingSession?.id) {
        this.sessionUuidCache.set(key, existingSession.id);
        return existingSession.id;
      }

      // 3. Create exam session if not exists
      const { data: insertedSession, error: insertErr } = await supabase
        .from('exam_sessions')
        .insert({
          center_id: this.cachedCenterId,
          session_code: key,
          exam_name: scan.subject || 'Examination',
          exam_code: scan.class_id || key,
          school_id: scan.school_id || null,
          class_id: scan.class_id || null,
          exam_date: new Date().toISOString().split('T')[0],
          shift: 'Morning',
          subject: scan.subject || 'General',
          expected_script_count: 50,
          received_scripts: 1,
          status: 'Scanning',
        })
        .select('id')
        .single();

      if (!insertErr && insertedSession?.id) {
        this.sessionUuidCache.set(key, insertedSession.id);
        return insertedSession.id;
      }
    } catch (e) {
      console.warn('Supabase session lookup error:', e);
    }
    return null;
  }

  public async flushPendingSync(): Promise<number> {
    if (!isSupabaseConfigured || !navigator.onLine || this.pendingSyncQueue.length === 0) {
      return 0;
    }

    const itemsToSync = [...this.pendingSyncQueue];
    let syncedCount = 0;
    const remainingQueue: ScannedScript[] = [];

    for (const scan of itemsToSync) {
      try {
        const sessionUuid = await this.getOrCreateSupabaseSession(scan);
        if (!sessionUuid || !this.cachedCenterId) {
          remainingQueue.push(scan);
          continue;
        }

        const { error } = await supabase.from('scripts').upsert(
          {
            exam_session_id: sessionUuid,
            center_id: this.cachedCenterId,
            school_id: scan.school_id || null,
            class_id: scan.class_id || null,
            script_number: scan.student_id,
            barcode: scan.barcode || scan.student_id,
            student_identifier: scan.student_id,
            received_at: scan.scanned_at,
            verification_status: scan.status === 'VALID' ? 'verified' : 'pending',
            script_status: 'received',
          },
          { onConflict: 'exam_session_id,barcode' }
        );

        if (error) {
          console.warn('Supabase script sync error:', error.message);
          remainingQueue.push(scan);
        } else {
          syncedCount++;
          const target = this.scans.find(s => s.id === scan.id);
          if (target) target.synced_to_supabase = true;
        }
      } catch (err) {
        remainingQueue.push(scan);
      }
    }

    this.pendingSyncQueue = remainingQueue;
    this.savePendingSync();
    if (syncedCount > 0) {
      this.saveScans();
    }
    return syncedCount;
  }

  public getPendingSyncCount(): number {
    return this.pendingSyncQueue.length;
  }

  // ============================================================================
  // EXAM SESSIONS
  // ============================================================================

  public getSessions(): ExamSession[] {
    return [...this.sessions];
  }

  public getSessionById(id: string): ExamSession | undefined {
    return this.sessions.find(s => s.id === id || s.session_id === id);
  }

  public createSession(data: Omit<ExamSession, 'id' | 'created_at'>): ExamSession {
    const newSession: ExamSession = {
      ...data,
      id: 'ses-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      created_at: new Date().toISOString(),
    };
    this.sessions.unshift(newSession);
    this.saveSessions();
    return newSession;
  }

  // ============================================================================
  // INWARD SCHEDULES
  // ============================================================================

  public getInwardSchedules(sessionId?: string): InwardSchedule[] {
    if (sessionId && sessionId !== 'ALL') {
      return this.inwardSchedules.filter(s => s.session_id === sessionId);
    }
    return [...this.inwardSchedules];
  }

  public getUniversities(): string[] {
    const set = new Set<string>();
    for (const item of this.inwardSchedules) {
      if (item.university && item.university.trim()) {
        set.add(item.university.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  public getInwardSchedulesByUniversity(university?: string): InwardSchedule[] {
    if (!university || university === 'ALL') {
      return [...this.inwardSchedules];
    }
    const cleanUni = university.trim().toLowerCase();
    return this.inwardSchedules.filter(
      s => (s.university || '').trim().toLowerCase() === cleanUni
    );
  }

  public getScheduleById(scheduledId: string): InwardSchedule | undefined {
    return this.inwardSchedules.find(s => s.scheduled_id === scheduledId || s.id === scheduledId);
  }

  public addInwardEntry(data: Omit<InwardSchedule, 'id' | 'created_at'>): InwardSchedule {
    const cleanId = data.scheduled_id.trim().toUpperCase();
    const cleanUni = (data.university || '').trim().toUpperCase();
    const existing = this.inwardSchedules.find(
      s =>
        s.scheduled_id.trim().toUpperCase() === cleanId &&
        (s.university || '').trim().toUpperCase() === cleanUni
    );
    if (existing) {
      throw new Error(
        `Bundle '${cleanId}' is already registered under '${data.university || 'this university'}'. Duplicate books are prevented.`
      );
    }

    const newEntry: InwardSchedule = {
      ...data,
      scheduled_id: cleanId,
      id: 'inw-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      created_at: new Date().toISOString(),
      is_completed: false,
    };
    this.inwardSchedules.unshift(newEntry);
    this.saveInward();
    return newEntry;
  }

  public deleteInwardEntry(idOrScheduleId: string): boolean {
    const prev = this.inwardSchedules.length;
    const target = this.inwardSchedules.find(s => s.id === idOrScheduleId || s.scheduled_id === idOrScheduleId);
    const targetId = target ? target.id : idOrScheduleId;
    const scheduleCode = target ? target.scheduled_id : idOrScheduleId;
    const targetUni = target ? (target.university || '').toUpperCase() : '';

    this.inwardSchedules = this.inwardSchedules.filter(
      s => s.id !== idOrScheduleId && s.scheduled_id !== idOrScheduleId
    );
    this.scans = this.scans.filter(s => {
      if (s.inward_id && s.inward_id === targetId) return false;
      if (targetUni && (s.university || '').toUpperCase() === targetUni && s.scheduled_id === scheduleCode) return false;
      if (!targetUni && s.scheduled_id === scheduleCode) return false;
      return true;
    });
    this.saveScans();

    if (this.inwardSchedules.length !== prev) {
      this.saveInward();
      return true;
    }
    return false;
  }

  public updateInwardExpectedCount(scheduledId: string, newExpectedCount: number, university?: string): boolean {
    const item = this.inwardSchedules.find(s => {
      const matchId = s.scheduled_id === scheduledId || s.id === scheduledId;
      if (!matchId) return false;
      if (university) {
        return (s.university || '').trim().toUpperCase() === university.trim().toUpperCase();
      }
      return true;
    });
    if (item) {
      item.expected_scripts = newExpectedCount;
      this.saveInward();
      return true;
    }
    return false;
  }

  public finalizeInwardBundle(scheduledId: string, university?: string): boolean {
    const item = this.inwardSchedules.find(s => {
      const matchId = s.scheduled_id === scheduledId || s.id === scheduledId;
      if (!matchId) return false;
      if (university) {
        return (s.university || '').trim().toUpperCase() === university.trim().toUpperCase();
      }
      return true;
    });
    if (item) {
      item.is_completed = true;
      item.completed_at = new Date().toISOString();
      this.saveInward();
      return true;
    }
    return false;
  }

  public getLastCompletedBundle(): InwardSchedule | undefined {
    return this.inwardSchedules.find(s => s.is_completed);
  }

  // ============================================================================
  // BARCODE SCANS & RECONCILIATION
  // ============================================================================

  public getScans(scheduledId?: string, university?: string, inwardId?: string): ScannedScript[] {
    if (inwardId) {
      return this.scans.filter(s => s.inward_id === inwardId);
    }
    if (scheduledId && university) {
      const cleanUni = university.trim().toUpperCase();
      return this.scans.filter(
        s => s.scheduled_id === scheduledId && (s.university || '').trim().toUpperCase() === cleanUni
      );
    }
    if (scheduledId) {
      return this.scans.filter(s => s.scheduled_id === scheduledId);
    }
    return [...this.scans];
  }

  public recordScan(data: {
    inward_id?: string;
    scheduled_id: string;
    school_id?: string;
    class_id: string;
    university?: string;
    student_id: string;
    barcode?: string;
    room_number: string;
    subject: string;
    scanned_by: string;
  }): { success: boolean; scan: ScannedScript; isDuplicate: boolean } {
    const studentClean = data.student_id.trim().toUpperCase();
    const cleanUni = (data.university || '').trim().toUpperCase();

    // Check duplicate within the specific university & schedule
    const existing = this.scans.find(s => {
      const matchInward = data.inward_id && s.inward_id ? s.inward_id === data.inward_id : true;
      const matchSched = s.scheduled_id === data.scheduled_id;
      const matchUni = cleanUni ? (s.university || '').trim().toUpperCase() === cleanUni : true;
      return (data.inward_id ? matchInward : (matchSched && matchUni)) && s.student_id.toUpperCase() === studentClean;
    });

    if (existing) {
      // DUPLICATE DETECTED: STRICT REQUIREMENT 6: Do not silently create another record!
      return { success: false, scan: existing, isDuplicate: true };
    }

    const newScan: ScannedScript = {
      id: 'scn-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      inward_id: data.inward_id,
      scheduled_id: data.scheduled_id,
      school_id: data.school_id,
      class_id: data.class_id,
      university: data.university,
      student_id: studentClean,
      barcode: data.barcode || studentClean,
      room_number: data.room_number,
      subject: data.subject,
      status: 'VALID',
      scanned_at: new Date().toISOString(),
      scanned_by: data.scanned_by,
      synced_to_supabase: false,
    };

    this.scans.unshift(newScan);
    this.saveScans();

    // Asynchronous non-blocking background queue and sync (Req 11 & 12)
    this.enqueuePendingSync(newScan);
    if (isSupabaseConfigured && typeof navigator !== 'undefined' && navigator.onLine) {
      setTimeout(() => this.flushPendingSync(), 50);
    }

    return { success: true, scan: newScan, isDuplicate: false };
  }

  // ============================================================================
  // METRICS & RECONCILIATION (Computed dynamically from real stored records)
  // ============================================================================

  public getMetrics(sessionId?: string): OperationalMetrics {
    const relevantSchedules = this.getInwardSchedules(sessionId);
    const totalScheduled = relevantSchedules.length;
    const expectedScripts = relevantSchedules.reduce((acc, s) => acc + (Number(s.expected_scripts) || 0), 0);

    const scheduleIds = new Set(relevantSchedules.map(s => s.scheduled_id));
    const relevantScans = sessionId && sessionId !== 'ALL'
      ? this.scans.filter(s => scheduleIds.has(s.scheduled_id))
      : this.scans;

    const validScans = relevantScans.filter(s => s.status === 'VALID');
    const duplicateScans = relevantScans.filter(s => s.status === 'DUPLICATE');
    const unknownScans = relevantScans.filter(s => s.status === 'UNKNOWN');
    
    const scannedScripts = validScans.length;
    const missingScripts = Math.max(0, expectedScripts - scannedScripts);
    const completionRate = expectedScripts > 0 ? Math.round((scannedScripts / expectedScripts) * 100) : 0;

    return {
      totalScheduled,
      expectedScripts,
      scannedScripts,
      missingScripts,
      duplicateScripts: duplicateScans.length,
      unknownScripts: unknownScans.length,
      completionRate,
    };
  }

  public getScansByUniversity(university?: string): (ScannedScript & { university?: string })[] {
    const uniMap = new Map<string, string>();
    for (const item of this.inwardSchedules) {
      if (item.university) {
        uniMap.set(item.scheduled_id, item.university);
      }
    }

    const enhancedScans = this.scans.map(s => ({
      ...s,
      university: uniMap.get(s.scheduled_id) || 'Unknown University',
    }));

    if (!university || university === 'ALL') {
      return enhancedScans;
    }
    const cleanUni = university.trim().toLowerCase();
    return enhancedScans.filter(
      s => (s.university || '').trim().toLowerCase() === cleanUni
    );
  }

  public getMetricsByUniversity(university?: string): OperationalMetrics {
    const relevantSchedules = this.getInwardSchedulesByUniversity(university);
    const totalScheduled = relevantSchedules.length;
    const expectedScripts = relevantSchedules.reduce((acc, s) => acc + (Number(s.expected_scripts) || 0), 0);

    const scheduleIds = new Set(relevantSchedules.map(s => s.scheduled_id));
    const relevantScans = university && university !== 'ALL'
      ? this.scans.filter(s => scheduleIds.has(s.scheduled_id))
      : this.scans;

    const validScans = relevantScans.filter(s => s.status === 'VALID');
    const duplicateScans = relevantScans.filter(s => s.status === 'DUPLICATE');
    const unknownScans = relevantScans.filter(s => s.status === 'UNKNOWN');
    
    const scannedScripts = validScans.length;
    const missingScripts = Math.max(0, expectedScripts - scannedScripts);
    const completionRate = expectedScripts > 0 ? Math.round((scannedScripts / expectedScripts) * 100) : 0;

    return {
      totalScheduled,
      expectedScripts,
      scannedScripts,
      missingScripts,
      duplicateScripts: duplicateScans.length,
      unknownScripts: unknownScans.length,
      completionRate,
    };
  }

  public clearAllData() {
    this.sessions = [];
    this.inwardSchedules = [];
    this.scans = [];
    localStorage.removeItem(SESSIONS_STORAGE_KEY);
    localStorage.removeItem(INWARD_STORAGE_KEY);
    localStorage.removeItem(SCANS_STORAGE_KEY);
    this.notify();
  }
}

export const examStore = new ExamStore();
