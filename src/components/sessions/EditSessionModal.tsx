// ==============================================================================
// Module 2: Edit Session Modal
// Editable metadata with locked Session ID and script count guardrails
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle2, Lock } from 'lucide-react';
import { SessionEntity, UpdateSessionPayload } from '../../types/exam';
import { sessionService } from '../../services/sessionService';
import { useAuth } from '../../context/AuthContext';

interface EditSessionModalProps {
  isOpen: boolean;
  session: SessionEntity | null;
  onClose: () => void;
  onSessionUpdated: (updated: SessionEntity) => void;
}

export const EditSessionModal: React.FC<EditSessionModalProps> = ({
  isOpen,
  session,
  onClose,
  onSessionUpdated,
}) => {
  const { user } = useAuth();

  const [examName, setExamName] = useState('');
  const [examCode, setExamCode] = useState('');
  const [examDate, setExamDate] = useState('');
  const [subject, setSubject] = useState('');
  const [shift, setShift] = useState('Morning (FN)');
  const [expectedScriptCount, setExpectedScriptCount] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (session) {
      setExamName(session.exam_name || '');
      setExamCode(session.exam_code || '');
      setExamDate(session.exam_date || '');
      setSubject(session.subject || '');
      setShift(session.shift || 'Morning (FN)');
      setExpectedScriptCount(String(session.expected_script_count || ''));
      setDescription(session.description || '');
      setNotes(session.notes || '');
      setErrorMsg('');
      setFieldErrors({});
    }
  }, [session]);

  if (!isOpen || !session) return null;

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!examName.trim()) errors.examName = 'Exam Name is required.';
    if (!examCode.trim()) errors.examCode = 'Exam Code is required.';
    if (!examDate) errors.examDate = 'Exam Date is required.';
    if (!subject.trim()) errors.subject = 'Subject is required.';
    if (!shift.trim()) errors.shift = 'Session / Shift is required.';

    const count = Number(expectedScriptCount);
    if (!expectedScriptCount || isNaN(count) || count <= 0 || !Number.isInteger(count)) {
      errors.expectedScriptCount = 'Expected Script Count must be a positive integer greater than 0.';
    } else {
      // Guardrail rule: cannot be lower than already received/scanned/verified scripts
      const maxProcessed = Math.max(
        session.received_scripts,
        session.scanned_scripts,
        session.verified_scripts
      );
      if (count < maxProcessed) {
        errors.expectedScriptCount = `Expected Script Count cannot be lower than already processed scripts (${maxProcessed}).`;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!validate()) return;

    setIsLoading(true);

    try {
      const payload: UpdateSessionPayload = {
        exam_name: examName.trim(),
        exam_code: examCode.trim().toUpperCase(),
        exam_date: examDate,
        subject: subject.trim(),
        shift: shift.trim(),
        expected_script_count: parseInt(expectedScriptCount, 10),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const res = await sessionService.updateSession(session.id, payload, {
        id: user?.id || 'admin',
        name: user?.full_name || 'Staff Administrator',
      });

      if (res.success && res.session) {
        onSessionUpdated(res.session);
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to update session.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while saving modifications.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-lg border border-[#E2E8F0] bg-white shadow-xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-[#172033]">Edit Examination Session</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-[#64748B]">Session Identifier:</span>
              <span className="text-xs font-mono font-bold text-[#1565D8] flex items-center gap-1">
                <Lock className="h-3 w-3" />
                {session.session_code} (Immutable)
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-md text-[#64748B] hover:text-[#172033] hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Global Error Notice */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-[#FEE2E2] border border-[#FECACA] flex items-start gap-2.5 text-xs text-[#DC2626]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Exam Name */}
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">
                Exam Name <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                value={examName}
                onChange={e => setExamName(e.target.value)}
                className={`w-full h-10 px-3 rounded-lg border bg-white text-xs text-[#172033] focus:outline-none focus:ring-1 ${
                  fieldErrors.examName
                    ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]'
                    : 'border-[#E2E8F0] focus:border-[#1565D8] focus:ring-[#1565D8]'
                }`}
              />
              {fieldErrors.examName && (
                <p className="text-[11px] text-[#DC2626] mt-1">{fieldErrors.examName}</p>
              )}
            </div>

            {/* Exam Code */}
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">
                Exam Code <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                value={examCode}
                onChange={e => setExamCode(e.target.value)}
                className={`w-full h-10 px-3 rounded-lg border bg-white text-xs text-[#172033] uppercase focus:outline-none focus:ring-1 ${
                  fieldErrors.examCode
                    ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]'
                    : 'border-[#E2E8F0] focus:border-[#1565D8] focus:ring-[#1565D8]'
                }`}
              />
              {fieldErrors.examCode && (
                <p className="text-[11px] text-[#DC2626] mt-1">{fieldErrors.examCode}</p>
              )}
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">
                Subject <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className={`w-full h-10 px-3 rounded-lg border bg-white text-xs text-[#172033] focus:outline-none focus:ring-1 ${
                  fieldErrors.subject
                    ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]'
                    : 'border-[#E2E8F0] focus:border-[#1565D8] focus:ring-[#1565D8]'
                }`}
              />
              {fieldErrors.subject && (
                <p className="text-[11px] text-[#DC2626] mt-1">{fieldErrors.subject}</p>
              )}
            </div>

            {/* Exam Date */}
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">
                Exam Date <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="date"
                value={examDate}
                onChange={e => setExamDate(e.target.value)}
                className={`w-full h-10 px-3 rounded-lg border bg-white text-xs text-[#172033] focus:outline-none focus:ring-1 ${
                  fieldErrors.examDate
                    ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]'
                    : 'border-[#E2E8F0] focus:border-[#1565D8] focus:ring-[#1565D8]'
                }`}
              />
              {fieldErrors.examDate && (
                <p className="text-[11px] text-[#DC2626] mt-1">{fieldErrors.examDate}</p>
              )}
            </div>

            {/* Shift */}
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">
                Session / Shift <span className="text-[#DC2626]">*</span>
              </label>
              <select
                value={shift}
                onChange={e => setShift(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none"
              >
                <option value="Morning (FN)">Morning (Forenoon - 09:30 AM to 12:30 PM)</option>
                <option value="Afternoon (AN)">Afternoon (Afternoon - 02:00 PM to 05:00 PM)</option>
                <option value="Full Day">Full Day (Continuous Practical)</option>
                <option value="Evening">Evening Shift</option>
              </select>
            </div>

            {/* Expected Script Count */}
            <div>
              <label className="block text-xs font-semibold text-[#172033] mb-1">
                Expected Script Count <span className="text-[#DC2626]">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={expectedScriptCount}
                onChange={e => setExpectedScriptCount(e.target.value)}
                className={`w-full h-10 px-3 rounded-lg border bg-white text-xs text-[#172033] focus:outline-none focus:ring-1 ${
                  fieldErrors.expectedScriptCount
                    ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]'
                    : 'border-[#E2E8F0] focus:border-[#1565D8] focus:ring-[#1565D8]'
                }`}
              />
              {fieldErrors.expectedScriptCount ? (
                <p className="text-[11px] text-[#DC2626] mt-1">{fieldErrors.expectedScriptCount}</p>
              ) : (
                <p className="text-[11px] text-[#64748B] mt-1 font-tabular">
                  Processed: {session.received_scripts} rec / {session.scanned_scripts} scn / {session.verified_scripts} ver
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[#172033] mb-1">
              Description / Examination Scope
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#172033] mb-1">
              Special Handling Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full p-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#64748B] hover:text-[#172033] hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 rounded-lg bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] active:bg-[#0A3880] disabled:opacity-50 transition-colors flex items-center gap-2 shadow-xs"
            >
              {isLoading ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving Updates...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
