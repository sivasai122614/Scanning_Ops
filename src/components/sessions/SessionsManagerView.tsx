// ==============================================================================
// Bundle Inward & Receiving Manager (Operational Intake & Log)
// Strictly ZERO Mock/Sample Data.
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Trash2,
  AlertTriangle,
  Edit3,
  X,
} from 'lucide-react';
import { examStore } from '../../services/examStore';
import { InwardSchedule } from '../../types/exam';
import { useAuth } from '../../context/AuthContext';

interface SessionsManagerViewProps {
  initialMode?: 'list' | 'details' | 'inward' | 'create';
  initialSessionId?: string;
  onNavigateToScan?: (scheduleId?: string) => void;
}

export const SessionsManagerView: React.FC<SessionsManagerViewProps> = ({
  onNavigateToScan,
}) => {
  // Toast
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  const handleOpenScanning = (sessionCode: string) => {
    if (onNavigateToScan) {
      onNavigateToScan(sessionCode);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#16A34A] text-white text-xs font-semibold shadow-lg animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#172033]">
            Bundle Inward / Receiving
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Physical exam bundle custody intake &amp; script reconciliation log
          </p>
        </div>
      </div>

      {/* Inward Intake & Schedules Log Section */}
      <InwardIntakeSection onOpenScanning={handleOpenScanning} showToast={showToast} />
    </div>
  );
};

// Subcomponent: Inward / Receiving Intake Section
const InwardIntakeSection: React.FC<{
  onOpenScanning: (code: string) => void;
  showToast?: (msg: string) => void;
}> = ({ onOpenScanning, showToast }) => {
  const { user } = useAuth();

  // 1. University Name (Custom input per Requirement 1 & 5)
  const [university, setUniversity] = useState('');

  // 2. Exam Type (Custom input per Requirement 1)
  const [examType, setExamType] = useState('Regular');

  // STRICT REQUIREMENT 1: School ID and Class ID are TWO DIFFERENT fields stored separately
  const [schoolId, setSchoolId] = useState('');
  const [classId, setClassId] = useState('');
  const [scheduledId, setScheduledId] = useState('');

  // 4. Room Number & Subject (Optional)
  const [roomNumber, setRoomNumber] = useState('');
  const [subject, setSubject] = useState('');

  // 5. Expected Scripts & Bundles
  const [expectedScripts, setExpectedScripts] = useState('');
  const [numberOfBundles, setNumberOfBundles] = useState('1');
  const [receivedBy, setReceivedBy] = useState(user?.full_name || 'Staff Officer');
  const [receivedTime, setReceivedTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  );

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [schedules, setSchedules] = useState<InwardSchedule[]>(examStore.getInwardSchedules());

  // Edit Expected Count Modal State (Requirement 3)
  const [editingSchedule, setEditingSchedule] = useState<InwardSchedule | null>(null);
  const [newExpectedCountInput, setNewExpectedCountInput] = useState<string>('');
  const [editErrorMsg, setEditErrorMsg] = useState<string>('');

  // In-App Delete Confirmation Modal State (Point 1 Fix)
  const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null);

  const refreshSchedules = () => {
    setSchedules(examStore.getInwardSchedules());
  };

  useEffect(() => {
    const unsub = examStore.subscribe(refreshSchedules);
    return () => unsub();
  }, []);

  const handleAddInward = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMsg('');
    setSuccessMsg('');

    // Class ID and School ID are separate fields
    const cleanClassId = classId.trim().toUpperCase();
    const cleanSchoolId = schoolId.trim().toUpperCase();
    let effectiveScheduledId = scheduledId.trim().toUpperCase();

    if (!cleanClassId) {
      setErrorMsg('Please enter a Class ID (e.g. 1211 or EEE-A)');
      return;
    }

    if (!effectiveScheduledId) {
      // Default to schedule code or class ID if not entered
      effectiveScheduledId = cleanClassId;
    }

    // Expected scripts check
    const count = parseInt(expectedScripts, 10);
    if (isNaN(count) || count <= 0) {
      setErrorMsg('Expected scripts must be a positive integer greater than 0');
      return;
    }

    // Check for duplicate books/schedules under the same university
    const currentUni = university.trim().toUpperCase();
    const isDuplicate = schedules.some(
      s =>
        s.scheduled_id.trim().toUpperCase() === effectiveScheduledId &&
        (s.university || '').trim().toUpperCase() === currentUni
    );
    if (isDuplicate) {
      setErrorMsg(
        `Duplicate Book Prevented: Bundle '${effectiveScheduledId}' is already registered under '${university.trim() || 'this university'}'.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // STRICT REQUIREMENT 1: Store class_id and school_id separately.
      // Both accept identical values (e.g. class_id = '1211' and school_id = '1211' is 100% valid).
      examStore.addInwardEntry({
        session_id: 'ACTIVE_SESSION',
        scheduled_id: effectiveScheduledId,
        school_id: cleanSchoolId || undefined,
        class_id: cleanClassId,
        university: university.trim() || undefined,
        exam_type: examType.trim() || undefined,
        room_number: roomNumber.trim() || 'Room 1',
        subject: subject.trim() || 'General Subject',
        expected_scripts: count,
        number_of_bundles: parseInt(numberOfBundles, 10) || 1,
        received_by: receivedBy.trim(),
        received_time: receivedTime,
      });

      setSuccessMsg(`Bundle ${effectiveScheduledId} logged successfully.`);
      if (showToast) showToast(`Bundle ${effectiveScheduledId} logged successfully.`);

      // Reset form
      setSchoolId('');
      setClassId('');
      setScheduledId('');
      setRoomNumber('');
      setSubject('');
      setExpectedScripts('');
      refreshSchedules();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed logging inward entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Point 1: Robust In-App Modal Delete Handler
  const handleConfirmDelete = () => {
    if (!scheduleToDelete) return;
    examStore.deleteInwardEntry(scheduleToDelete);
    refreshSchedules();
    setSuccessMsg(`Bundle ${scheduleToDelete} deleted successfully.`);
    if (showToast) showToast(`Bundle ${scheduleToDelete} deleted.`);
    setScheduleToDelete(null);
  };

  // Requirement 3: Edit Expected Count logic
  const handleOpenEditExpected = (sch: InwardSchedule) => {
    const validScans = examStore.getScans(sch.scheduled_id).filter(s => s.status === 'VALID');
    setEditingSchedule(sch);
    setNewExpectedCountInput(String(Math.max(sch.expected_scripts, validScans.length + 5)));
    setEditErrorMsg('');
  };

  const handleSaveEditedExpectedCount = () => {
    if (!editingSchedule) return;
    const newCount = parseInt(newExpectedCountInput, 10);
    const validScans = examStore.getScans(editingSchedule.scheduled_id).filter(s => s.status === 'VALID');

    if (isNaN(newCount) || newCount <= 0) {
      setEditErrorMsg('Expected count must be a positive integer.');
      return;
    }

    examStore.updateInwardExpectedCount(editingSchedule.scheduled_id, newCount);
    refreshSchedules();
    if (showToast) {
      showToast(`Expected count for ${editingSchedule.scheduled_id} updated to ${newCount}.`);
    }
    setEditingSchedule(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Form Card */}
      <div className="lg:col-span-5 rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-xs">
        <h2 className="text-sm font-bold text-[#172033] mb-1">Add Inward Entry</h2>
        <p className="text-xs text-[#64748B] mb-4">Register physical exam bundle custody handover.</p>

        {errorMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-[#FEE2E2] text-[#DC2626] text-xs font-medium flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-2.5 rounded-lg bg-[#DCFCE7] text-[#16A34A] text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleAddInward} className="space-y-3.5">
          {/* 1. University Name at top (Custom user input) */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-[#172033] mb-1 h-4">
              <span>University Name</span>
              <span className="text-[11px] font-normal text-[#94A3B8]">Custom</span>
            </div>
            <input
              type="text"
              value={university}
              onChange={e => setUniversity(e.target.value)}
              placeholder="e.g. Osmania University, VIT-AP, JNTUK"
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none shadow-2xs"
            />
          </div>

          {/* 2. Exam Type (Custom user input) */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-[#172033] mb-1 h-4">
              <span>Exam Type</span>
              <span className="text-[11px] font-normal text-[#94A3B8]">Custom</span>
            </div>
            <input
              type="text"
              value={examType}
              onChange={e => setExamType(e.target.value)}
              placeholder="e.g. Regular, Supplementary, Mid-Term, Lab"
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none shadow-2xs"
            />
          </div>

          {/* STRICT REQUIREMENT 1: SEPARATE CLASS ID AND SCHOOL ID FIELDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#172033] mb-1 h-4">
                <span>Class ID <span className="text-[#DC2626]">*</span></span>
                <span className="text-[11px] font-normal text-[#64748B]">Separate Field</span>
              </div>
              <input
                type="text"
                value={classId}
                onChange={e => setClassId(e.target.value)}
                placeholder="e.g. 1211 or EEE-A"
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] uppercase focus:border-[#1565D8] focus:outline-none font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#172033] mb-1 h-4">
                <span>School ID</span>
                <span className="text-[11px] font-normal text-[#64748B]">Separate Field</span>
              </div>
              <input
                type="text"
                value={schoolId}
                onChange={e => setSchoolId(e.target.value)}
                placeholder="e.g. 1211 (Accepts Class ID value)"
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] uppercase focus:border-[#1565D8] focus:outline-none font-mono"
              />
            </div>
          </div>

          <p className="text-[11px] text-[#64748B] -mt-1 bg-slate-50 p-2 rounded border border-slate-200">
            ℹ️ <strong>Separate Fields:</strong> Class ID and School ID are stored independently. Both accept identical values (e.g. Class ID: 1211 and School ID: 1211 is completely valid).
          </p>

          {/* Schedule ID / Bundle Identifier */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-[#172033] mb-1 h-4">
              <span>Schedule ID / Bundle Code</span>
              <span className="text-[11px] font-normal text-[#94A3B8]">Optional (Defaults to Class ID)</span>
            </div>
            <input
              type="text"
              value={scheduledId}
              onChange={e => setScheduledId(e.target.value)}
              placeholder="e.g. 1211 or SCH10245"
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] uppercase focus:border-[#1565D8] focus:outline-none font-mono"
            />
          </div>

          {/* Room Number */}
          <div className="grid grid-cols-1 gap-3 items-start">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#172033] mb-1 h-4">
                <span className="truncate">Room Number</span>
                <span className="text-[11px] font-normal text-[#94A3B8] shrink-0">Optional</span>
              </div>
              <input
                type="text"
                value={roomNumber}
                onChange={e => setRoomNumber(e.target.value)}
                placeholder="e.g. A201"
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none"
              />
            </div>
          </div>

          {/* Subject (Optional) with matching header height */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-[#172033] mb-1 h-4">
              <span>Subject</span>
              <span className="text-[11px] font-normal text-[#94A3B8]">Optional</span>
            </div>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Power Systems"
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none"
            />
          </div>

          {/* Expected Scripts & Number of Bundles with pixel-perfect alignment */}
          <div className="grid grid-cols-2 gap-3 items-start">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#172033] mb-1 h-4">
                <span className="truncate">Expected Scripts <span className="text-[#DC2626]">*</span></span>
              </div>
              <input
                type="number"
                min="1"
                value={expectedScripts}
                onChange={e => setExpectedScripts(e.target.value)}
                placeholder="e.g. 60"
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none"
              />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-[#172033] mb-1 h-4">
                <span className="truncate">Number of Bundles</span>
              </div>
              <input
                type="number"
                min="1"
                value={numberOfBundles}
                onChange={e => setNumberOfBundles(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs text-[#172033] focus:border-[#1565D8] focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 mt-2 rounded-lg bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] disabled:opacity-50 transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? <span>Logging Bundle...</span> : <span>Add Inward Entry</span>}
          </button>
        </form>
      </div>

      {/* Active Schedules Table */}
      <div className="lg:col-span-7 rounded-lg border border-[#E2E8F0] bg-white p-5 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[#172033]">Inward Schedules Log</h2>
            <span className="text-xs font-mono font-bold text-[#1565D8]">{schedules.length} Logged</span>
          </div>

          {schedules.length === 0 ? (
            <div className="p-8 text-center text-[#64748B] text-xs">
              No bundle inward records logged yet. Add your first received bundle on the left.
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {schedules.map(sch => {
                const validScans = examStore
                  .getScans(sch.scheduled_id)
                  .filter(s => s.status === 'VALID');
                const isReached = validScans.length >= sch.expected_scripts && sch.expected_scripts > 0;

                return (
                  <div
                    key={sch.id}
                    className="p-3 rounded-lg border border-[#E2E8F0] bg-slate-50/60 hover:bg-slate-50 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-[#1565D8]">{sch.scheduled_id}</span>
                        {sch.university && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-medium">
                            {sch.university}
                          </span>
                        )}
                        {sch.exam_type && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">
                            {sch.exam_type}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium font-mono">
                          Class: {sch.class_id}
                        </span>
                        {sch.school_id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-medium font-mono">
                            School: {sch.school_id}
                          </span>
                        )}
                        <span className="font-medium text-[#172033] truncate">
                          Room {sch.room_number || 'General'}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#64748B] mt-1 truncate">
                        {sch.subject || 'General'} • Class ID: <span className="font-mono font-semibold text-slate-700">{sch.class_id}</span> • School ID: <span className="font-mono font-semibold text-slate-700">{sch.school_id || 'N/A'}</span> • {validScans.length} / {sch.expected_scripts} scripts (
                        {sch.number_of_bundles} bundle{sch.number_of_bundles > 1 ? 's' : ''})
                      </div>
                    </div>

                    {/* Actions: Green tick or Scan button + Edit Symbol */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isReached ? (
                        <div
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#DCFCE7] border border-[#BBF7D0] text-[#16A34A] text-xs font-bold shadow-2xs"
                          title="Expected count reached"
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#16A34A]" />
                          <span>Done ({validScans.length}/{sch.expected_scripts})</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenScanning(sch.scheduled_id)}
                          className="px-2.5 py-1 rounded-md bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] transition-colors shadow-2xs cursor-pointer"
                        >
                          Scan ({validScans.length}/{sch.expected_scripts})
                        </button>
                      )}

                      {/* Edit Symbol next to Scan / Green Tick */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditExpected(sch)}
                        className="p-1.5 rounded-md border border-[#BFDBFE] bg-[#EAF2FF] text-[#1565D8] hover:bg-[#D8E6FC] transition-colors cursor-pointer"
                        title="Edit Expected Count (add scripts / re-scan)"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>

                      {/* Point 1: Reliable In-App Modal Delete Trigger */}
                      <button
                        type="button"
                        onClick={() => setScheduleToDelete(sch.scheduled_id)}
                        className="p-1.5 rounded-md hover:bg-[#FEE2E2] text-[#94A3B8] hover:text-[#DC2626] transition-colors cursor-pointer"
                        title="Remove bundle from log"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Point 1: In-App Delete Confirmation Modal (Guaranteed to work in iframe) */}
      {scheduleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-red-100 text-[#DC2626] shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#172033]">Delete Inward Bundle</h3>
                <p className="text-xs text-[#64748B]">Action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-[#64748B] leading-relaxed">
              Are you sure you want to delete bundle <strong className="text-[#172033] font-mono">{scheduleToDelete}</strong> from inward schedules? All scanned scripts logged under this bundle will also be removed.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 h-10 rounded-lg bg-[#DC2626] text-white text-xs font-bold hover:bg-[#B91C1C] transition-colors shadow-xs cursor-pointer"
              >
                Yes, Delete
              </button>
              <button
                type="button"
                onClick={() => setScheduleToDelete(null)}
                className="px-4 h-10 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-[#64748B] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Requirement 3: Modal to Edit Expected Count and Resume Scanning */}
      {editingSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-[#1565D8]" />
                <h3 className="text-sm font-bold text-[#172033]">Edit Expected Count</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSchedule(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="font-semibold text-[#172033]">
                  Bundle:{' '}
                  <span className="font-mono text-[#1565D8]">{editingSchedule.scheduled_id}</span>
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  Currently Scanned:{' '}
                  <strong>
                    {examStore.getScans(editingSchedule.scheduled_id).filter(s => s.status === 'VALID').length}
                  </strong>{' '}
                  scripts
                </div>
              </div>

              {editErrorMsg && (
                <div className="p-2 rounded bg-rose-50 text-rose-600 text-xs font-medium">
                  {editErrorMsg}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#172033] mb-1">
                  New Expected Scripts Count:
                </label>
                <input
                  type="number"
                  min="1"
                  value={newExpectedCountInput}
                  onChange={e => setNewExpectedCountInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[#BFDBFE] bg-white text-sm font-bold text-[#172033] focus:outline-none focus:border-[#1565D8]"
                />
                <p className="text-[11px] text-[#64748B] mt-1">
                  Increase expected count if you have more scripts to scan. This unlocks the Scan button immediately.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveEditedExpectedCount}
                  className="flex-1 h-10 rounded-lg bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] transition-colors cursor-pointer"
                >
                  Save &amp; Update
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSchedule(null)}
                  className="px-4 h-10 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-[#64748B] hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
