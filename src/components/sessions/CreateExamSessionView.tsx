// ==============================================================================
// Module 2: Create Exam Session (Direct Reference Image Screen 2 Implementation)
// Exact Structure & Hierarchy:
// Top blue header -> Back button + "Create Exam Session" + Save button
// -> Exam Date -> Session Type (Segmented: FN / AN / Full Day)
// -> University -> Exam Type -> Session ID -> Academic Details -> Remarks (Optional)
// -> Save Primary Action
// Strictly ZERO fake session data in database.
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  FormField,
  SelectField,
  DateField,
  SegmentedControl,
} from '../ui/ReferenceComponents';
import { CreateSessionPayload, SessionEntity } from '../../types/exam';
import { sessionService } from '../../services/sessionService';
import { useAuth } from '../../context/AuthContext';
import { CheckCircle2, AlertCircle } from 'lucide-react';

interface CreateExamSessionViewProps {
  onBack: () => void;
  onSessionCreated: (session: SessionEntity) => void;
}

export const CreateExamSessionView: React.FC<CreateExamSessionViewProps> = ({
  onBack,
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

  // State fields - Date automatically detected
  const [examDate, setExamDate] = useState(getTodayDate());
  const [sessionType, setSessionType] = useState('FN'); // 'FN' | 'AN' | 'Full Day'
  const [university, setUniversity] = useState('');
  const [examType, setExamType] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [subject, setSubject] = useState('');
  const [examCode, setExamCode] = useState('');
  const [expectedScriptCount, setExpectedScriptCount] = useState('');
  const [remarks, setRemarks] = useState('');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);

  // Dynamic Session ID suggestion based on date and session type (only if user hasn't typed custom code)
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
        // Ignore date parsing error
      }
    }
  }, [examDate, sessionType, sessionId]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!examDate) {
      errors.examDate = 'Exam Date is required.';
    }
    if (!sessionType) {
      errors.sessionType = 'Session Type is required.';
    }
    if (!university) {
      errors.university = 'Please select an institutional University.';
    }
    if (!examType) {
      errors.examType = 'Please select the Exam Type.';
    }
    if (!sessionId.trim()) {
      errors.sessionId = 'Session ID is required.';
    }

    // Operational parameters validation
    if (!subject.trim()) {
      errors.subject = 'Subject is required for script categorization.';
    }
    if (!examCode.trim()) {
      errors.examCode = 'Exam Course Code is required.';
    }

    const count = Number(expectedScriptCount);
    if (!expectedScriptCount || isNaN(count) || count <= 0 || !Number.isInteger(count)) {
      errors.expectedScriptCount = 'Expected script count must be a positive integer greater than 0.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    setIsSuccess(false);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

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
        description: `${examType} examination conducted for ${university}. Session: ${sessionType}.`,
      };

      const res = await sessionService.createSession(payload, {
        id: user?.id || 'usr-admin-root',
        name: user?.full_name || user?.email || 'Authorized Examination Officer',
      });

      if (res.success && res.session) {
        setIsSuccess(true);
        setTimeout(() => {
          onSessionCreated(res.session!);
        }, 350);
      } else {
        setErrorMessage(res.error || 'Failed to record examination session in Supabase.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'A network error occurred while communicating with the database.');
    } finally {
      setIsSubmitting(false);
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
    <div className="min-h-screen bg-[#F5F7FA] pb-24 md:pb-12 text-[#172033]">
      {/* 1. TOP BLUE APP HEADER (Strictly matching reference image Screen 2) */}
      <PageHeader
        title="Create Exam Session"
        variant="blue"
        onBack={onBack}
        rightAction={
          <SecondaryButton
            variant="header-pill"
            size="sm"
            onClick={() => handleSave()}
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Save
          </SecondaryButton>
        }
      />

      {/* 2. MAIN OPERATIONAL FORM CONTAINER (Desktop centered, mobile full width) */}
      <div className="max-w-xl mx-auto px-4 py-4 sm:py-6">
        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-4 rounded-lg bg-[#FEE2E2] border border-[#FECACA] p-3 text-xs text-[#DC2626] flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Success Alert */}
        {isSuccess && (
          <div className="mb-4 rounded-lg bg-[#DCFCE7] border border-[#BBF7D0] p-3 text-xs text-[#16A34A] flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-semibold">Session created successfully. Redirecting...</span>
          </div>
        )}

        {/* Form Card */}
        <form onSubmit={handleSave} className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-6 shadow-xs space-y-4">
          {/* FIELD 1: Exam Date */}
          <DateField
            label="Exam Date"
            required
            value={examDate}
            onChange={e => {
              setExamDate(e.target.value);
              if (fieldErrors.examDate) {
                setFieldErrors(prev => ({ ...prev, examDate: '' }));
              }
            }}
            error={fieldErrors.examDate}
            helperText="Date on which scripts were physically written and received"
          />

          {/* FIELD 2: Session Type (Segmented Control: FN / AN / Full Day) */}
          <SegmentedControl
            label="Session Type"
            required
            options={sessionTypeSegments}
            value={sessionType}
            onChange={val => {
              setSessionType(val);
              if (fieldErrors.sessionType) {
                setFieldErrors(prev => ({ ...prev, sessionType: '' }));
              }
            }}
            error={fieldErrors.sessionType}
          />

          {/* FIELD 3: University */}
          <SelectField
            label="University"
            required
            placeholder="Select University"
            options={universityOptions}
            value={university}
            onChange={e => {
              setUniversity(e.target.value);
              if (fieldErrors.university) {
                setFieldErrors(prev => ({ ...prev, university: '' }));
              }
            }}
            error={fieldErrors.university}
          />

          {/* FIELD 4: Exam Type */}
          <SelectField
            label="Exam Type"
            required
            placeholder="Select Exam Type"
            options={examTypeOptions}
            value={examType}
            onChange={e => {
              setExamType(e.target.value);
              if (fieldErrors.examType) {
                setFieldErrors(prev => ({ ...prev, examType: '' }));
              }
            }}
            error={fieldErrors.examType}
          />

          {/* FIELD 5: Session ID */}
          <FormField
            label="Session ID"
            required
            error={fieldErrors.sessionId}
            helperText="Unique institutional identifier for scanning batches (e.g. SEP2026_FN)"
          >
            <input
              type="text"
              value={sessionId}
              onChange={e => {
                setSessionId(e.target.value.toUpperCase());
                if (fieldErrors.sessionId) {
                  setFieldErrors(prev => ({ ...prev, sessionId: '' }));
                }
              }}
              placeholder="e.g. SEP2026_FN"
              className={`w-full h-11 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-3.5 text-xs sm:text-sm text-[#172033] font-mono focus:bg-white focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none uppercase ${
                fieldErrors.sessionId ? 'border-[#DC2626]' : ''
              }`}
            />
          </FormField>

          {/* ACADEMIC & SCRIPT ATTRIBUTES */}
          <div className="pt-2 border-t border-[#E2E8F0] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Subject / Paper" required error={fieldErrors.subject}>
                <input
                  type="text"
                  value={subject}
                  onChange={e => {
                    setSubject(e.target.value);
                    if (fieldErrors.subject) {
                      setFieldErrors(prev => ({ ...prev, subject: '' }));
                    }
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
                    if (fieldErrors.examCode) {
                      setFieldErrors(prev => ({ ...prev, examCode: '' }));
                    }
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
              helperText="Total candidate scripts expected to be received and digitized (> 0)"
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

          {/* FIELD 6: Remarks (Optional) */}
          <FormField label="Remarks (Optional)" optionalText="Optional operational notes">
            <textarea
              rows={3}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="Enter remarks..."
              className="w-full rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] p-3 text-xs sm:text-sm text-[#172033] placeholder:text-[#94A3B8] focus:bg-white focus:border-[#1565D8] focus:ring-1 focus:ring-[#1565D8] focus:outline-none resize-none"
            />
          </FormField>

          {/* PRIMARY ACTION BUTTON */}
          <div className="pt-2">
            <PrimaryButton
              type="submit"
              fullWidth
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              Save Exam Session
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
};
