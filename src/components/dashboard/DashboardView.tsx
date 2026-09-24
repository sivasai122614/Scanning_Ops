// ==============================================================================
// ExamScan Dashboard View (Frame 1 Reference Design)
// Real operational metrics, strictly ZERO fake/sample data.
// ==============================================================================

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Scan,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { examStore } from '../../services/examStore';
import { OperationalMetrics, ExamSession, InwardSchedule } from '../../types/exam';
import { KpiCard, SectionHeader, StatusBadge, EmptyState } from '../ui/Elements';

interface DashboardViewProps {
  onNavigateToSessions: () => void;
  onNavigateToScan: () => void;
  onNavigateToCreateSession: () => void;
  onNavigateToExceptions: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToSessions,
  onNavigateToScan,
  onNavigateToCreateSession,
  onNavigateToExceptions,
}) => {
  const [schedules, setSchedules] = useState<InwardSchedule[]>([]);
  const [metrics, setMetrics] = useState<OperationalMetrics>({
    totalScheduled: 0,
    expectedScripts: 0,
    scannedScripts: 0,
    missingScripts: 0,
    duplicateScripts: 0,
    unknownScripts: 0,
    completionRate: 0,
  });

  const loadData = () => {
    const sch = examStore.getInwardSchedules();
    const met = examStore.getMetrics();
    setSchedules(sch);
    setMetrics(met);
  };

  useEffect(() => {
    loadData();
    const unsubscribe = examStore.subscribe(loadData);
    return () => unsubscribe();
  }, []);

  // Today's formatted date
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Schedules with missing scripts or issues
  const attentionItems = schedules.filter(sch => {
    const scans = examStore.getScans(sch.scheduled_id);
    const validCount = scans.filter(s => s.status === 'VALID').length;
    const dupeCount = scans.filter(s => s.status === 'DUPLICATE').length;
    return sch.expected_scripts > validCount || dupeCount > 0;
  });

  return (
    <div className="space-y-4">
      {/* Date Header (Session Dropdown Removed per requirement) */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 h-10 px-3.5 rounded-lg bg-white border border-[#E2E8F0] text-xs font-semibold text-[#172033] shadow-xs">
          <CalendarIcon className="h-4 w-4 text-[#1565D8]" />
          <span>{todayStr}</span>
        </div>
      </div>

      {/* 4-Pack KPI Grid (Reference Frame 1) */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {/* Total Scheduled */}
        <KpiCard
          label="Total Scheduled"
          value={metrics.totalScheduled}
          icon={<CalendarIcon className="h-4 w-4" />}
          iconBgColor="bg-[#F3E8FF]"
          iconTextColor="text-[#9333EA]"
          onClick={onNavigateToSessions}
        />

        {/* Expected Scripts */}
        <KpiCard
          label="Expected Scripts"
          value={metrics.expectedScripts.toLocaleString()}
          icon={<FileText className="h-4 w-4" />}
          iconBgColor="bg-[#DCFCE7]"
          iconTextColor="text-[#16A34A]"
        />

        {/* Scanned */}
        <KpiCard
          label="Scanned"
          value={metrics.scannedScripts.toLocaleString()}
          icon={<Scan className="h-4 w-4" />}
          iconBgColor="bg-[#EAF2FF]"
          iconTextColor="text-[#1565D8]"
          onClick={onNavigateToScan}
        />

        {/* Missing */}
        <KpiCard
          label="Missing"
          value={metrics.missingScripts.toLocaleString()}
          icon={<AlertTriangle className="h-4 w-4" />}
          iconBgColor="bg-[#FEE2E2]"
          iconTextColor="text-[#DC2626]"
          onClick={onNavigateToExceptions}
        />
      </div>

      {/* Today's Progress Card (Matching Frame 1) */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[#172033]">Today's Progress</span>
          <span className="text-sm font-bold font-tabular text-[#16A34A]">{metrics.completionRate}%</span>
        </div>

        {/* Progress Bar */}
        <div className="mt-2.5 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-[#16A34A] rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, metrics.completionRate)}%` }}
          />
        </div>

        <div className="mt-2 text-xs font-tabular text-[#64748B]">
          <span className="font-semibold text-[#172033]">{metrics.scannedScripts.toLocaleString()}</span> /{' '}
          {metrics.expectedScripts.toLocaleString()} scanned
        </div>
      </div>

      {/* Attention Required Section (Matching Frame 1) */}
      <div className="space-y-2">
        <SectionHeader
          title="Attention Required"
          actionLabel="View All"
          onAction={onNavigateToExceptions}
        />

        {attentionItems.length === 0 ? (
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-5 text-center shadow-xs">
            <CheckCircle2 className="h-8 w-8 text-[#16A34A] mx-auto mb-1.5" />
            <div className="text-xs font-semibold text-[#172033]">All Exam Schedules In Good Order</div>
            <div className="text-[11px] text-[#64748B] mt-0.5">
              {schedules.length === 0
                ? 'No exam schedules loaded yet. Add an inward entry to begin tracking.'
                : 'All expected scripts scanned with zero active discrepancies.'}
            </div>
            {schedules.length === 0 && (
              <button
                type="button"
                onClick={onNavigateToSessions}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1565D8] text-white text-xs font-medium hover:bg-[#0D47A1] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Inward Entry</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {attentionItems.slice(0, 5).map(item => {
              const scans = examStore.getScans(item.scheduled_id);
              const validCount = scans.filter(s => s.status === 'VALID').length;
              const missingCount = Math.max(0, item.expected_scripts - validCount);
              const dupeCount = scans.filter(s => s.status === 'DUPLICATE').length;

              return (
                <div
                  key={item.id}
                  onClick={onNavigateToExceptions}
                  className="flex items-center justify-between p-3 rounded-lg bg-white border border-[#E2E8F0] hover:border-slate-300 transition-colors cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#FEE2E2] text-[#DC2626] shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#172033] truncate">
                        {item.scheduled_id}
                      </div>
                      <div className="text-[11px] text-[#64748B] truncate">
                        {item.class_id} | Room {item.room_number} | {item.subject}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {missingCount > 0 && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEE2E2] text-[#DC2626]">
                        {missingCount} Missing
                      </span>
                    )}
                    {dupeCount > 0 && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEF3C7] text-[#D97706]">
                        {dupeCount} Duplicate
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-[#94A3B8]" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
