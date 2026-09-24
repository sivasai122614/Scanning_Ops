// ==============================================================================
// Module 2: Session Details View
// Operational metadata, progress tracking (Expected, Received, Scanned, Verified),
// controlled status state transitions, and "Open Session" entrypoint
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Edit2,
  Archive,
  Scan,
  Calendar,
  Layers,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  User,
  Hash,
  ChevronRight,
  Info,
} from 'lucide-react';
import { SessionEntity, SessionStatus } from '../../types/exam';
import { sessionService, VALID_TRANSITIONS } from '../../services/sessionService';
import { StatusBadge, ConfirmDialog } from '../ui/Elements';
import { EditSessionModal } from './EditSessionModal';
import { useAuth } from '../../context/AuthContext';

interface SessionDetailsViewProps {
  sessionId: string;
  onBack: () => void;
  onOpenScanning: (sessionCode: string) => void;
}

export const SessionDetailsView: React.FC<SessionDetailsViewProps> = ({
  sessionId,
  onBack,
  onOpenScanning,
}) => {
  const { user, hasPermission } = useAuth();
  const [session, setSession] = useState<SessionEntity | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const canEdit =
    hasPermission('sessions:update') ||
    user?.role?.code === 'super_admin' ||
    user?.role?.code === 'admin';

  const loadSession = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const data = await sessionService.getSessionById(sessionId);
      if (data) {
        setSession(data);
      } else {
        setErrorMsg('Examination session not found in Supabase database.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error fetching session record.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const handleStatusTransition = async (newStatus: SessionStatus) => {
    if (!session) return;
    setIsTransitioning(true);
    setActionNotice(null);

    try {
      const res = await sessionService.transitionStatus(session.id, newStatus, {
        id: user?.id || 'admin',
        name: user?.full_name || 'Staff User',
      });

      if (res.success && res.session) {
        setSession(res.session);
        setActionNotice({
          type: 'success',
          text: `Status transitioned successfully to "${newStatus}".`,
        });
      } else {
        setActionNotice({
          type: 'error',
          text: res.error || `Could not transition status to "${newStatus}".`,
        });
      }
    } catch (err: any) {
      setActionNotice({
        type: 'error',
        text: err.message || 'Failed executing status transition.',
      });
    } finally {
      setIsTransitioning(false);
    }
  };

  const handleArchive = async () => {
    if (!session) return;
    setIsTransitioning(true);
    try {
      const res = await sessionService.archiveSession(session.id, {
        id: user?.id || 'admin',
        name: user?.full_name || 'Staff User',
      });
      if (res.success) {
        setIsArchiveConfirmOpen(false);
        setActionNotice({
          type: 'success',
          text: 'Session archived successfully.',
        });
        loadSession();
      } else {
        setActionNotice({
          type: 'error',
          text: res.error || 'Failed archiving session.',
        });
      }
    } finally {
      setIsTransitioning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-12 text-center shadow-xs">
        <div className="mx-auto h-7 w-7 border-2 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold text-[#172033]">Loading examination session details from Supabase...</p>
      </div>
    );
  }

  if (errorMsg || !session) {
    return (
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-8 text-center shadow-xs space-y-4">
        <AlertCircle className="mx-auto h-10 w-10 text-[#DC2626]" />
        <div>
          <h3 className="text-base font-bold text-[#172033]">Session Not Found</h3>
          <p className="text-xs text-[#64748B] mt-1">{errorMsg || 'No record matches this session identifier.'}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Sessions</span>
        </button>
      </div>
    );
  }

  // Calculated Progress
  const expected = session.expected_script_count;
  const received = session.received_scripts;
  const scanned = session.scanned_scripts;
  const verified = session.verified_scripts;
  const remaining = Math.max(0, expected - verified);
  const progressPercent = expected > 0 ? Math.min(100, Math.round((verified / expected) * 100)) : 0;
  const scannedPercent = expected > 0 ? Math.min(100, Math.round((scanned / expected) * 100)) : 0;

  const allowedTransitions = VALID_TRANSITIONS[session.status] || [];

  return (
    <div className="space-y-4">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-lg border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center h-9 w-9 rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#172033] hover:bg-slate-50 transition-colors"
            title="Back to Sessions List"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold font-mono text-[#172033]">{session.session_code}</span>
              <StatusBadge status={session.status} />
            </div>
            <p className="text-xs text-[#64748B] mt-0.5 font-medium">
              {session.exam_name} • {session.subject}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {canEdit && session.status !== 'Archived' && (
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#172033] hover:bg-slate-50 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Edit2 className="h-3.5 w-3.5 text-[#64748B]" />
              <span>Edit</span>
            </button>
          )}

          {canEdit && session.status !== 'Archived' && (
            <button
              type="button"
              onClick={() => setIsArchiveConfirmOpen(true)}
              className="h-9 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2]/40 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>Archive</span>
            </button>
          )}

          {/* Prominent Open Session Button */}
          <button
            type="button"
            onClick={() => onOpenScanning(session.session_code)}
            className="h-9 px-4 rounded-lg bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] active:bg-[#0A3880] transition-colors flex items-center gap-2 shadow-xs"
          >
            <Scan className="h-4 w-4" />
            <span>Open Session</span>
          </button>
        </div>
      </div>

      {/* Action Notification Message */}
      {actionNotice && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 border ${
            actionNotice.type === 'success'
              ? 'bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]'
              : 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]'
          }`}
        >
          {actionNotice.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{actionNotice.text}</span>
        </div>
      )}

      {/* Controlled Status Workflow Bar */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#172033] uppercase tracking-wider">
              Controlled Lifecycle State Machine
            </div>
            <p className="text-[11px] text-[#64748B] mt-0.5">
              Current state is <span className="font-semibold text-[#172033]">{session.status}</span>. Transitions are strictly validated against examination governance rules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allowedTransitions.map(targetStatus => (
              <button
                key={targetStatus}
                type="button"
                disabled={isTransitioning}
                onClick={() => handleStatusTransition(targetStatus)}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all shadow-xs flex items-center gap-1.5 ${
                  targetStatus === 'Scanning'
                    ? 'bg-[#1565D8] text-white hover:bg-[#0D47A1]'
                    : targetStatus === 'Completed'
                    ? 'bg-[#16A34A] text-white hover:bg-[#15803D]'
                    : targetStatus === 'Archived'
                    ? 'bg-slate-100 text-[#DC2626] border border-[#FECACA] hover:bg-[#FEE2E2]'
                    : 'bg-slate-100 text-[#172033] border border-[#E2E8F0] hover:bg-slate-200'
                }`}
              >
                <span>Advance to {targetStatus}</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            ))}
            {allowedTransitions.length === 0 && (
              <span className="text-xs text-[#64748B] italic">No further transitions available (Terminal State)</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress & Real Operational Counts (Frame 9 requirement) */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[#172033]">Operational Verification Progress</span>
          <span className="text-xs font-bold font-tabular text-[#16A34A]">
            Verified: {verified} / {expected} ({progressPercent}%)
          </span>
        </div>

        {/* Multi-tier Progress Bar */}
        <div className="space-y-1.5">
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden relative">
            {/* Scanned bar (lighter blue) */}
            <div
              className="absolute inset-y-0 left-0 bg-[#93C5FD] transition-all duration-300"
              style={{ width: `${scannedPercent}%` }}
              title={`Scanned: ${scanned} scripts (${scannedPercent}%)`}
            />
            {/* Verified bar (solid green) */}
            <div
              className="absolute inset-y-0 left-0 bg-[#16A34A] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
              title={`Verified: ${verified} scripts (${progressPercent}%)`}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-[#64748B]">
            <span>Initial Intake</span>
            <span>Batch Target: {expected} Scripts</span>
          </div>
        </div>

        {/* 5 Real Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1 text-center">
          <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0]">
            <div className="text-[11px] font-medium text-[#64748B]">Expected</div>
            <div className="text-xl font-bold font-tabular text-[#172033] mt-0.5">{expected}</div>
          </div>
          <div className="p-3 rounded-lg bg-[#EAF2FF] border border-[#BFDBFE]">
            <div className="text-[11px] font-medium text-[#1565D8]">Received</div>
            <div className="text-xl font-bold font-tabular text-[#1565D8] mt-0.5">{received}</div>
          </div>
          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="text-[11px] font-medium text-[#2563EB]">Scanned</div>
            <div className="text-xl font-bold font-tabular text-[#2563EB] mt-0.5">{scanned}</div>
          </div>
          <div className="p-3 rounded-lg bg-[#DCFCE7] border border-[#BBF7D0]">
            <div className="text-[11px] font-medium text-[#16A34A]">Verified</div>
            <div className="text-xl font-bold font-tabular text-[#16A34A] mt-0.5">{verified}</div>
          </div>
          <div className="p-3 rounded-lg bg-[#FEE2E2] border border-[#FECACA]">
            <div className="text-[11px] font-medium text-[#DC2626]">Remaining</div>
            <div className="text-xl font-bold font-tabular text-[#DC2626] mt-0.5">{remaining}</div>
          </div>
        </div>
      </div>

      {/* Session Metadata Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Academic & Schedule Parameters */}
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-[#1565D8]" />
            <span>Academic Manifest Parameters</span>
          </div>

          <div className="space-y-2.5 text-xs">
            {session.university && (
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-[#64748B]">University:</span>
                <span className="font-semibold text-[#172033]">{session.university}</span>
              </div>
            )}
            {session.exam_type && (
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-[#64748B]">Exam Type:</span>
                <span className="font-semibold text-[#172033]">{session.exam_type}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-[#64748B]">Exam Name:</span>
              <span className="font-semibold text-[#172033]">{session.exam_name}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-[#64748B]">Exam Code:</span>
              <span className="font-mono font-bold text-[#172033]">{session.exam_code}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-[#64748B]">Subject / Course:</span>
              <span className="font-semibold text-[#172033]">{session.subject}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-[#64748B]">Scheduled Exam Date:</span>
              <span className="font-semibold text-[#172033]">{session.exam_date}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[#64748B]">Shift / Time Window:</span>
              <span className="font-semibold text-[#172033]">{session.shift}</span>
            </div>
          </div>
        </div>

        {/* Governance & Audit Metadata */}
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[#1565D8]" />
            <span>Governance &amp; Custody Details</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-[#64748B]">Session Identifier:</span>
              <span className="font-mono font-bold text-[#1565D8]">{session.session_code}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-[#64748B]">Created By:</span>
              <span className="font-semibold text-[#172033]">{session.creator_name || 'Administrator'}</span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-[#64748B]">Created Timestamp:</span>
              <span className="font-mono text-[#172033]">
                {new Date(session.created_at).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
              <span className="text-[#64748B]">Last Updated:</span>
              <span className="font-mono text-[#172033]">
                {new Date(session.updated_at).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[#64748B]">Target Scanning Workflow:</span>
              <span className="font-semibold text-[#16A34A]">Module 3 &amp; 4 Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Description & Handling Notes */}
      {(session.description || session.notes) && (
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
            Operational Scope &amp; Special Handling
          </div>
          {session.description && (
            <p className="text-xs text-[#172033] leading-relaxed">
              <span className="font-semibold text-[#64748B]">Scope: </span>
              {session.description}
            </p>
          )}
          {session.notes && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
              <span className="font-semibold">Handling Notes: </span>
              {session.notes}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <EditSessionModal
        isOpen={isEditOpen}
        session={session}
        onClose={() => setIsEditOpen(false)}
        onSessionUpdated={updated => {
          setSession(updated);
          setActionNotice({ type: 'success', text: 'Session updated successfully.' });
        }}
      />

      <ConfirmDialog
        isOpen={isArchiveConfirmOpen}
        title="Archive Examination Session"
        message={`Are you sure you want to archive session "${session.session_code}"? The session will remain safely preserved in Supabase but hidden from active operational views.`}
        confirmLabel="Archive Session"
        isDestructive
        onConfirm={handleArchive}
        onCancel={() => setIsArchiveConfirmOpen(false)}
      />
    </div>
  );
};
