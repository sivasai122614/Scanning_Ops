// ==============================================================================
// Module 2: Create Session Modal (Aligned with Reference Image Screen 2)
// Visual hierarchy: Exam Date -> Session Type (FN/AN/Full Day) -> University
// -> Exam Type -> Session ID -> Academic Details -> Remarks -> Save
// Strictly ZERO fake data in database.
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { CreateSessionPayload, SessionEntity } from '../../types/exam';
import { sessionService } from '../../services/sessionService';
import { useAuth } from '../../context/AuthContext';
import {
  PrimaryButton,
  SecondaryButton,
  FormField,
  SelectField,
  DateField,
  SegmentedControl,
} from '../ui/ReferenceComponents';

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: (session: SessionEntity) => void;
}

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  isOpen,
  onClose,
  onSessionCreated,
}) => {
  const { user } = useAuth();

  // Auto-detect today's date (YYYY-MM-DD)
  const getTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Form Fields - Date automatically detected
  const [examDate, setExamDate] = useState(getTodayDate());
  const [sessionType, setSessionType] = useState('FN');
  const [university, setUniversity] = useState('');
  const [examType, setExamType] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [subject, setSubject] = useState('');
  const [examCode, setExamCode] = useState('');
  const [expectedScriptCount, setExpectedScriptCount] = useState('');
  const [remarks, setRemarks] = useState('');

  // UI States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Dynamic Session ID suggestion
  useEffect(() => {
    if (examDate && !sessionId) {
      try {
        const d = new Date(examDate);
        if (!isNaN(d.getTime())) {
          const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
          const monthStr = months[d.getUTCMonth()];
          const yearStr = d.getUTCFullYear();
          const typeSuffix = sessionType === 'Full Day' ? 'FD' : sessionType;
          setSessionId(`${monthStr}${yearStr}_${typeSuffix}`);
        }
      } catch {
        // ignore
      }
    }
  }, [examDate, sessionType, sessionId]);

  if (!isOpen) return null;

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!examDate) errors.examDate = 'Exam Date is required.';
    if (!sessionType) errors.sessionType = 'Session Type is required.';
    if (!university) errors.university = 'Please select a University.';
    if (!examType) errors.examType = 'Please select the Exam Type.';
    if (!sessionId.trim()) errors.sessionId = 'Session ID is required.';
    if (!subject.trim()) errors.subject = 'Subject is required.';
    if (!examCode.trim()) errors.examCode = 'Exam Code is required.';

    const count = Number(expectedScriptCount);
    if (!expectedScriptCount || isNaN(count) || count <= 0 || !Number.isInteger(count)) {
      errors.expectedScriptCount = 'Expected Script Count must be a positive integer greater than 0.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!validate()) return;

    setIsLoading(true);

    try {
      const payload: CreateSessionPayload = {
        session_code: sessionId.trim().toUpperCase(),
        exam_name: `${university} - ${subject.trim()}`,
        exam_code: examCode.trim().toUpperCase(),
        exam_date: examDate,
        subject: subject.trim(),
        shift: sessionType,
        university: university.trim(),
        exam_type: examType.trim(),
        expected_script_count: parseInt(expectedScriptCount, 10),
        notes: remarks.trim() || undefined,
        description: `${examType} examination for ${university}. Session: ${sessionType}.`,
      };

      const res = await sessionService.createSession(payload, {
        id: user?.id || 'usr-admin-root',
        name: user?.full_name || user?.email || 'Authorized Staff',
      });

      if (res.success && res.session) {
        onSessionCreated(res.session);
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to create examination session in database.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const universityOptions = [
    { label: 'VIT-AP University', value: 'VIT-AP' },
    { label: 'Anna University', value: 'Anna University' },
    { label: 'Jawaharlal Nehru Technological University', value: 'JNTU' },
    { label: 'University of Madras', value: 'University of Madras' },
    { label: 'Osmania University', value: 'Osmania University' },
    { label: 'Central Examination Directorate', value: 'Central Directorate' },
  ];

  const examTypeOptions = [
    { label: 'Regular', value: 'Regular' },
    { label: 'Supplementary', value: 'Supplementary' },
    { label: 'Revaluation', value: 'Revaluation' },
    { label: 'Special Examination', value: 'Special Examination' },
    { label: 'Improvement Examination', value: 'Improvement' },
  ];

  const sessionTypeSegments = [
    { label: 'FN', value: 'FN' },
    { label: 'AN', value: 'AN' },
    { label: 'Full Day', value: 'Full Day' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-2xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-xl rounded-lg border border-[#E2E8F0] bg-white shadow-2xl overflow-hidden my-6">
        {/* Blue Header matching Screen 2 */}
        <div className="bg-[#1565D8] text-white px-4 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white tracking-tight">
            Create Exam Session
          </h2>
          <div className="flex items-center gap-2">
            <SecondaryButton
              variant="header-pill"
              size="sm"
              onClick={() => handleSubmit()}
              loading={isLoading}
              disabled={isLoading}
            >
              Save
            </SecondaryButton>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Global Error Notice */}
        {errorMsg && (
          <div className="mx-4 sm:mx-6 mt-4 p-3 rounded-lg bg-[#FEE2E2] border border-[#FECACA] flex items-start gap-2.5 text-xs text-[#DC2626]">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Form Fields matching Screen 2 Hierarchy */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 max-h-[calc(85vh-60px)] overflow-y-auto">
          {/* Exam Date */}
          <DateField
            label="Exam Date"
            required
            value={examDate}
            onChange={e => {
              setExamDate(e.target.value);
              if (fieldErrors.examDate) setFieldErrors(prev => ({ ...prev, examDate: '' }));
            }}
            error={fieldErrors.examDate}
          />

          {/* Session Type */}
          <SegmentedControl
            label="Session Type"
            required
            options={sessionTypeSegments}
            value={sessionType}
            onChange={val => {
              setSessionType(val);
              if (fieldErrors.sessionType) setFieldErrors(prev => ({ ...prev, sessionType: '' }));
            }}
            error={fieldErrors.sessionType}
          />

          {/* University */}
          <SelectField
            label="University"
            required
            placeholder="Select University"
            options={universityOptions}
            value={university}
            onChange={e => {
              setUniversity(e.target.value);
              if (fieldErrors.university) setFieldErrors(prev => ({ ...prev, university: '' }));
            }}
            error={fieldErrors.university}
          />

          {/* Exam Type */}
          <SelectField
            label="Exam Type"
            required
            placeholder="Select Exam Type"
            options={examTypeOptions}
            value={examType}
            onChange={e => {
              setExamType(e.target.value);
              if (fieldErrors.examType) setFieldErrors(prev => ({ ...prev, examType: '' }));
            }}
            error={fieldErrors.examType}
          />

          {/* Session ID */}
          <FormField
            label="Session ID"
            required
            error={fieldErrors.sessionId}
            helperText="Unique institutional identifier for scanning batches"
          >
            <input
              type="text"
              value={sessionId}
              onChange={e => {
                setSessionId(e.target.value.toUpperCase());
                if (fieldErrors.sessionId) setFieldErrors(prev => ({ ...prev, sessionId: '' }));
              }}
              placeholder="e.g. SEP2026_FN"
              className={`w-full h-11 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 text-xs sm:text-sm text-[#172033] font-mono focus:bg-white focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none uppercase ${
                fieldErrors.sessionId ? 'border-[#DC2626]' : ''
              }`}
            />
          </FormField>

          {/* Academic & Script Attributes */}
          <div className="pt-2 border-t border-[#E2E8F0] space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Subject" required error={fieldErrors.subject}>
                <input
                  type="text"
                  value={subject}
                  onChange={e => {
                    setSubject(e.target.value);
                    if (fieldErrors.subject) setFieldErrors(prev => ({ ...prev, subject: '' }));
                  }}
                  placeholder="e.g. Data Structures"
                  className={`w-full h-11 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 text-xs sm:text-sm text-[#172033] focus:bg-white focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none ${
                    fieldErrors.subject ? 'border-[#DC2626]' : ''
                  }`}
                />
              </FormField>

              <FormField label="Exam Code" required error={fieldErrors.examCode}>
                <input
                  type="text"
                  value={examCode}
                  onChange={e => {
                    setExamCode(e.target.value.toUpperCase());
                    if (fieldErrors.examCode) setFieldErrors(prev => ({ ...prev, examCode: '' }));
                  }}
                  placeholder="e.g. CSE2001"
                  className={`w-full h-11 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 text-xs sm:text-sm text-[#172033] font-mono focus:bg-white focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none uppercase ${
                    fieldErrors.examCode ? 'border-[#DC2626]' : ''
                  }`}
                />
              </FormField>
            </div>

            <FormField
              label="Expected Script Count"
              required
              error={fieldErrors.expectedScriptCount}
              helperText="Candidate scripts expected to be received and digitized (> 0)"
            >
              <input
                type="number"
                min="1"
                step="1"
                value={expectedScriptCount}
                onChange={e => {
                  setExpectedScriptCount(e.target.value);
                  if (fieldErrors.expectedScriptCount) {
                    setFieldErrors(prev => ({ ...prev, expectedScriptCount: '' }));
                  }
                }}
                placeholder="e.g. 500"
                className={`w-full h-11 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 text-xs sm:text-sm text-[#172033] font-tabular focus:bg-white focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none ${
                  fieldErrors.expectedScriptCount ? 'border-[#DC2626]' : ''
                }`}
              />
            </FormField>
          </div>

          {/* Remarks (Optional) */}
          <FormField label="Remarks (Optional)">
            <textarea
              rows={2}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Enter remarks..."
              className="w-full rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs sm:text-sm text-[#172033] placeholder:text-[#94A3B8] focus:bg-white focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none resize-none"
            />
          </FormField>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="h-11 px-4 text-xs sm:text-sm font-semibold rounded-lg border border-[#E2E8F0] bg-white text-[#172033] hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <PrimaryButton
              type="submit"
              loading={isLoading}
              disabled={isLoading}
            >
              Save Exam Session
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
};
