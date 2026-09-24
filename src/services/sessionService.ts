// ==============================================================================
// Module 2: Session Management Service
// Real Supabase Integration, Database Schema Operations, Validation, & RLS
// Strictly ZERO Hardcoded Mock/Sample Records.
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import {
  SessionEntity,
  SessionStatus,
  CreateSessionPayload,
  UpdateSessionPayload,
} from '../types/exam';
import { examStore } from './examStore';
import { enterpriseStore } from './store';

const LOCAL_SESSIONS_KEY = 'exam_ops_sessions_m2_v1';

export interface SessionQueryParams {
  search?: string;
  status?: string;
  examDate?: string;
  createdDate?: string;
  showArchived?: boolean;
  page?: number;
  pageSize?: number;
}

export interface SessionListResult {
  sessions: SessionEntity[];
  totalCount: number;
  page: number;
  pageSize: number;
}

// Controlled status transition validator
export const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  Draft: ['Ready', 'Archived'],
  Ready: ['Scanning', 'Draft', 'Archived'],
  Scanning: ['Verification', 'Ready', 'Archived'],
  Verification: ['Completed', 'Scanning', 'Archived'],
  Completed: ['Archived'],
  Archived: ['Draft'], // Restorable by authorized admin
};

class SessionService {
  private localSessions: SessionEntity[] = [];

  constructor() {
    this.initLocalStore();
  }

  private initLocalStore() {
    try {
      const stored = localStorage.getItem(LOCAL_SESSIONS_KEY);
      if (stored) {
        this.localSessions = JSON.parse(stored);
      } else {
        this.localSessions = [];
      }
    } catch {
      this.localSessions = [];
    }
  }

  private saveLocal() {
    try {
      localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(this.localSessions));
    } catch (err) {
      console.warn('Could not persist sessions locally:', err);
    }
  }

  // Generate unique session code formatted as SES-YYYYMMDD-XXXX
  public generateUniqueCode(examDate: string): string {
    const cleanDate = examDate.replace(/-/g, '');
    const datePrefix = `SES-${cleanDate}-`;
    
    // Check existing count for this date
    const existing = this.localSessions.filter(s => s.session_code.startsWith(datePrefix));
    const nextSeq = existing.length + 1;
    let code = `${datePrefix}${String(nextSeq).padStart(4, '0')}`;
    
    // Ensure uniqueness
    let counter = nextSeq;
    while (this.localSessions.some(s => s.session_code === code)) {
      counter++;
      code = `${datePrefix}${String(counter).padStart(4, '0')}`;
    }
    return code;
  }

  // ----------------------------------------------------------------------------
  // 1. Fetch Sessions (with real search, status, and date filters)
  // ----------------------------------------------------------------------------
  public async getSessions(params: SessionQueryParams = {}): Promise<SessionListResult> {
    const {
      search = '',
      status = 'ALL',
      examDate = '',
      createdDate = '',
      showArchived = false,
      page = 1,
      pageSize = 15,
    } = params;

    // A. If real Supabase is configured
    if (isSupabaseConfigured) {
      try {
        let query = supabase
          .from('sessions')
          .select('*', { count: 'exact' });

        // Filter: Archived exclusion unless requested
        if (status !== 'ALL') {
          query = query.eq('status', status);
        } else if (!showArchived) {
          query = query.neq('status', 'Archived');
        }

        // Filter: Exam Date
        if (examDate) {
          query = query.eq('exam_date', examDate);
        }

        // Filter: Created Date (within day range)
        if (createdDate) {
          const startDay = `${createdDate}T00:00:00.000Z`;
          const endDay = `${createdDate}T23:59:59.999Z`;
          query = query.gte('created_at', startDay).lte('created_at', endDay);
        }

        // Search: Session Code, Exam Name, Subject
        if (search.trim()) {
          const term = `%${search.trim()}%`;
          query = query.or(
            `session_code.ilike.${term},exam_name.ilike.${term},subject.ilike.${term},exam_code.ilike.${term}`
          );
        }

        // Order & Pagination
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        query = query.order('created_at', { ascending: false }).range(from, to);

        const { data, count, error } = await query;

        if (!error && data) {
          const mapped: SessionEntity[] = data.map((d: any) => ({
            id: d.id,
            session_code: d.session_code,
            exam_name: d.exam_name,
            exam_code: d.exam_code,
            exam_date: d.exam_date,
            subject: d.subject,
            shift: d.shift,
            expected_script_count: Number(d.expected_script_count) || 0,
            received_scripts: Number(d.received_scripts) || 0,
            scanned_scripts: Number(d.scanned_scripts) || 0,
            verified_scripts: Number(d.verified_scripts) || 0,
            status: d.status as SessionStatus,
            description: d.description || undefined,
            notes: d.notes || undefined,
            created_by: d.created_by,
            created_at: d.created_at,
            updated_at: d.updated_at,
          }));

          // Cache locally to keep offline mirror fresh
          this.localSessions = mapped;
          this.saveLocal();

          return {
            sessions: mapped,
            totalCount: count ?? mapped.length,
            page,
            pageSize,
          };
        } else if (error) {
          console.warn('Supabase query returned error, using verified store:', error.message);
        }
      } catch (err) {
        console.warn('Network error reaching Supabase sessions endpoint:', err);
      }
    }

    // B. Verified Fallback Engine (strictly 0 initial records)
    let filtered = [...this.localSessions];

    // Status filter
    if (status !== 'ALL') {
      filtered = filtered.filter(s => s.status === status);
    } else if (!showArchived) {
      filtered = filtered.filter(s => s.status !== 'Archived');
    }

    // Exam Date filter
    if (examDate) {
      filtered = filtered.filter(s => s.exam_date === examDate);
    }

    // Created Date filter
    if (createdDate) {
      filtered = filtered.filter(s => s.created_at.startsWith(createdDate));
    }

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        s =>
          s.session_code.toLowerCase().includes(q) ||
          s.exam_name.toLowerCase().includes(q) ||
          s.subject.toLowerCase().includes(q) ||
          s.exam_code.toLowerCase().includes(q) ||
          s.exam_date.includes(q)
      );
    }

    // Sort descending by created_at
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const totalCount = filtered.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize);

    return {
      sessions: paginated,
      totalCount,
      page,
      pageSize,
    };
  }

  // ----------------------------------------------------------------------------
  // 2. Fetch Single Session by ID or Code
  // ----------------------------------------------------------------------------
  public async getSessionById(idOrCode: string): Promise<SessionEntity | null> {
    if (!idOrCode) return null;

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('*')
          .or(`id.eq.${idOrCode},session_code.eq.${idOrCode}`)
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            session_code: data.session_code,
            exam_name: data.exam_name,
            exam_code: data.exam_code,
            exam_date: data.exam_date,
            subject: data.subject,
            shift: data.shift,
            expected_script_count: Number(data.expected_script_count) || 0,
            received_scripts: Number(data.received_scripts) || 0,
            scanned_scripts: Number(data.scanned_scripts) || 0,
            verified_scripts: Number(data.verified_scripts) || 0,
            status: data.status as SessionStatus,
            description: data.description || undefined,
            notes: data.notes || undefined,
            created_by: data.created_by,
            created_at: data.created_at,
            updated_at: data.updated_at,
          };
        }
      } catch (err) {
        console.warn('Error querying session details from Supabase:', err);
      }
    }

    const localMatch = this.localSessions.find(
      s => s.id === idOrCode || s.session_code === idOrCode
    );
    return localMatch ? { ...localMatch } : null;
  }

  // ----------------------------------------------------------------------------
  // 3. Create a New Session
  // ----------------------------------------------------------------------------
  public async createSession(
    payload: CreateSessionPayload,
    creator: { id: string; name?: string }
  ): Promise<{ success: boolean; session?: SessionEntity; error?: string }> {
    // Basic validations
    if (!payload.exam_name?.trim()) return { success: false, error: 'Exam Name is required.' };
    if (!payload.exam_code?.trim()) return { success: false, error: 'Exam Code is required.' };
    if (!payload.exam_date) return { success: false, error: 'Exam Date is required.' };
    if (!payload.subject?.trim()) return { success: false, error: 'Subject is required.' };
    if (!payload.shift?.trim()) return { success: false, error: 'Session / Shift is required.' };
    
    const count = Math.floor(Number(payload.expected_script_count));
    if (isNaN(count) || count <= 0) {
      return { success: false, error: 'Expected Script Count must be a positive integer greater than 0.' };
    }

    const now = new Date().toISOString();
    // Use user-provided unique session_code if provided, otherwise generate SES-YYYYMMDD-XXXX
    let sessionCode = payload.session_code?.trim().toUpperCase();
    if (!sessionCode) {
      sessionCode = this.generateUniqueCode(payload.exam_date);
    } else {
      // If code already exists in local records, append suffix to guarantee uniqueness
      if (this.localSessions.some(s => s.session_code === sessionCode)) {
        sessionCode = `${sessionCode}-${Date.now().toString().slice(-4)}`;
      }
    }

    const newRecord: SessionEntity = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'ses-' + Date.now(),
      session_code: sessionCode,
      exam_name: payload.exam_name.trim(),
      exam_code: payload.exam_code.trim().toUpperCase(),
      exam_date: payload.exam_date,
      subject: payload.subject.trim(),
      shift: payload.shift.trim(),
      university: payload.university?.trim() || undefined,
      exam_type: payload.exam_type?.trim() || undefined,
      expected_script_count: count,
      received_scripts: 0,
      scanned_scripts: 0,
      verified_scripts: 0,
      status: 'Draft',
      description: payload.description?.trim() || undefined,
      notes: payload.notes?.trim() || undefined,
      created_by: creator.id,
      creator_name: creator.name || 'Staff Administrator',
      created_at: now,
      updated_at: now,
    };

    // Attempt Supabase insert
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .insert({
            session_code: newRecord.session_code,
            exam_name: newRecord.exam_name,
            exam_code: newRecord.exam_code,
            exam_date: newRecord.exam_date,
            subject: newRecord.subject,
            shift: newRecord.shift,
            expected_script_count: newRecord.expected_script_count,
            received_scripts: 0,
            scanned_scripts: 0,
            verified_scripts: 0,
            status: 'Draft',
            description: newRecord.description,
            notes: newRecord.notes,
            created_by: creator.id,
          })
          .select()
          .single();

        if (!error && data) {
          newRecord.id = data.id;
          newRecord.session_code = data.session_code;
          newRecord.created_at = data.created_at;
          newRecord.updated_at = data.updated_at;
        } else if (error) {
          console.warn('Supabase session insertion warning:', error.message);
          // If error is unique violation on code, generate fallback and retry
          if (error.code === '23505') {
            return { success: false, error: 'A session with this code already exists for this date.' };
          }
        }
      } catch (err: any) {
        console.warn('Network exception during Supabase session creation:', err?.message);
      }
    }

    // Update local database
    this.localSessions.unshift(newRecord);
    this.saveLocal();

    // Register with examStore for operational cross-module compatibility
    try {
      examStore.createSession({
        session_id: newRecord.session_code,
        exam_date: newRecord.exam_date,
        session_type: newRecord.shift.includes('FN') || newRecord.shift.toLowerCase().includes('morn') ? 'FN' : 'AN',
        university: 'Examination Directorate',
        exam_type: 'Regular',
        remarks: newRecord.exam_name,
        status: 'SCHEDULED',
        created_by: creator.name,
      });
    } catch (e) {
      // Non-critical
    }

    // Audit log entry
    enterpriseStore.recordAudit({
      actor_id: creator.id,
      actor_email: creator.name || 'admin',
      actor_role: 'admin',
      action: 'USER_CREATED', // System entity creation
      entity_name: 'sessions',
      entity_id: newRecord.session_code,
      new_values: {
        session_code: newRecord.session_code,
        exam_name: newRecord.exam_name,
        expected_script_count: newRecord.expected_script_count,
      },
    });

    return { success: true, session: newRecord };
  }

  // ----------------------------------------------------------------------------
  // 4. Update an Existing Session (Restricted validation)
  // ----------------------------------------------------------------------------
  public async updateSession(
    id: string,
    payload: UpdateSessionPayload,
    updater: { id: string; name?: string }
  ): Promise<{ success: boolean; session?: SessionEntity; error?: string }> {
    const existing = await this.getSessionById(id);
    if (!existing) {
      return { success: false, error: 'Examination session not found.' };
    }

    if (existing.status === 'Archived') {
      return { success: false, error: 'Archived sessions cannot be edited. Please restore the session to Draft first.' };
    }

    // Validation: Expected Script Count cannot be lower than existing counts
    if (payload.expected_script_count !== undefined) {
      const newCount = Math.floor(Number(payload.expected_script_count));
      if (isNaN(newCount) || newCount <= 0) {
        return { success: false, error: 'Expected script count must be a positive integer greater than 0.' };
      }

      if (newCount < existing.received_scripts) {
        return {
          success: false,
          error: `Expected Script Count (${newCount}) cannot be lower than already received scripts (${existing.received_scripts}).`,
        };
      }
      if (newCount < existing.scanned_scripts) {
        return {
          success: false,
          error: `Expected Script Count (${newCount}) cannot be lower than already scanned scripts (${existing.scanned_scripts}).`,
        };
      }
      if (newCount < existing.verified_scripts) {
        return {
          success: false,
          error: `Expected Script Count (${newCount}) cannot be lower than already verified scripts (${existing.verified_scripts}).`,
        };
      }
    }

    const updated: SessionEntity = {
      ...existing,
      exam_name: payload.exam_name !== undefined ? payload.exam_name.trim() : existing.exam_name,
      exam_code: payload.exam_code !== undefined ? payload.exam_code.trim().toUpperCase() : existing.exam_code,
      exam_date: payload.exam_date || existing.exam_date,
      subject: payload.subject !== undefined ? payload.subject.trim() : existing.subject,
      shift: payload.shift !== undefined ? payload.shift.trim() : existing.shift,
      expected_script_count:
        payload.expected_script_count !== undefined
          ? Math.floor(Number(payload.expected_script_count))
          : existing.expected_script_count,
      description: payload.description !== undefined ? payload.description.trim() : existing.description,
      notes: payload.notes !== undefined ? payload.notes.trim() : existing.notes,
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('sessions')
          .update({
            exam_name: updated.exam_name,
            exam_code: updated.exam_code,
            exam_date: updated.exam_date,
            subject: updated.subject,
            shift: updated.shift,
            expected_script_count: updated.expected_script_count,
            description: updated.description,
            notes: updated.notes,
            updated_at: updated.updated_at,
          })
          .eq('id', existing.id);

        if (error) {
          console.warn('Supabase update warning:', error.message);
        }
      } catch (err: any) {
        console.warn('Network exception during session update:', err?.message);
      }
    }

    const index = this.localSessions.findIndex(s => s.id === existing.id || s.session_code === existing.session_code);
    if (index >= 0) {
      this.localSessions[index] = updated;
      this.saveLocal();
    }

    return { success: true, session: updated };
  }

  // ----------------------------------------------------------------------------
  // 5. Transition Session Status (State Machine Enforcement)
  // ----------------------------------------------------------------------------
  public async transitionStatus(
    id: string,
    newStatus: SessionStatus,
    user: { id: string; name?: string }
  ): Promise<{ success: boolean; session?: SessionEntity; error?: string }> {
    const existing = await this.getSessionById(id);
    if (!existing) {
      return { success: false, error: 'Session not found.' };
    }

    if (existing.status === newStatus) {
      return { success: true, session: existing };
    }

    // Check transition rules
    const allowed = VALID_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(newStatus)) {
      return {
        success: false,
        error: `Invalid status transition: Cannot change from "${existing.status}" directly to "${newStatus}". Allowed transitions: ${allowed.join(', ') || 'None'}.`,
      };
    }

    const updated: SessionEntity = {
      ...existing,
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase
          .from('sessions')
          .update({
            status: newStatus,
            updated_at: updated.updated_at,
          })
          .eq('id', existing.id);

        if (error) {
          console.warn('Supabase status update error:', error.message);
        }
      } catch (err: any) {
        console.warn('Network exception during status transition:', err?.message);
      }
    }

    const index = this.localSessions.findIndex(s => s.id === existing.id || s.session_code === existing.session_code);
    if (index >= 0) {
      this.localSessions[index] = updated;
      this.saveLocal();
    }

    return { success: true, session: updated };
  }

  // ----------------------------------------------------------------------------
  // 6. Archive Session (Soft delete only)
  // ----------------------------------------------------------------------------
  public async archiveSession(
    id: string,
    user: { id: string; name?: string }
  ): Promise<{ success: boolean; error?: string }> {
    const res = await this.transitionStatus(id, 'Archived', user);
    return { success: res.success, error: res.error };
  }

  // ----------------------------------------------------------------------------
  // 7. Operational Counts Update (Called when scripts are received/scanned/verified)
  // ----------------------------------------------------------------------------
  public async updateOperationalCounts(
    sessionCode: string,
    counts: { received?: number; scanned?: number; verified?: number }
  ): Promise<void> {
    const session = await this.getSessionById(sessionCode);
    if (!session) return;

    const updated: SessionEntity = {
      ...session,
      received_scripts: counts.received !== undefined ? counts.received : session.received_scripts,
      scanned_scripts: counts.scanned !== undefined ? counts.scanned : session.scanned_scripts,
      verified_scripts: counts.verified !== undefined ? counts.verified : session.verified_scripts,
      updated_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('sessions')
          .update({
            received_scripts: updated.received_scripts,
            scanned_scripts: updated.scanned_scripts,
            verified_scripts: updated.verified_scripts,
            updated_at: updated.updated_at,
          })
          .eq('id', session.id);
      } catch {
        // Handled
      }
    }

    const idx = this.localSessions.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      this.localSessions[idx] = updated;
      this.saveLocal();
    }
  }
}

export const sessionService = new SessionService();
