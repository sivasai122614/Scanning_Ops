// ==============================================================================
// Module 2: Session List View (Desktop-First Operational Table)
// Search, multi-criteria filters, compact 11-column table, and honest 0 empty state
// Strictly ZERO Hardcoded Mock/Sample Records.
// ==============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  RefreshCw,
  Eye,
  Edit2,
  Scan,
  Calendar,
  Layers,
  AlertCircle,
  Archive,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  LayoutGrid,
  List,
} from 'lucide-react';
import { SessionEntity, SessionStatus } from '../../types/exam';
import { sessionService } from '../../services/sessionService';
import { StatusBadge, EmptyState } from '../ui/Elements';
import { useAuth } from '../../context/AuthContext';

interface SessionListViewProps {
  onCreateSession: () => void;
  onViewDetails: (sessionId: string) => void;
  onEditSession: (session: SessionEntity) => void;
  onOpenScanning: (sessionCode: string) => void;
}

export const SessionListView: React.FC<SessionListViewProps> = ({
  onCreateSession,
  onViewDetails,
  onEditSession,
  onOpenScanning,
}) => {
  const { user, hasPermission } = useAuth();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedExamDate, setSelectedExamDate] = useState<string>('');
  const [selectedCreatedDate, setSelectedCreatedDate] = useState<string>('');
  const [showArchived, setShowArchived] = useState<boolean>(false);

  // View Mode (Cards default to eliminate horizontal scrolling per spec)
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Data & Pagination State
  const [sessions, setSessions] = useState<SessionEntity[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 12;
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const canCreate =
    hasPermission('sessions:create') ||
    user?.role?.code === 'super_admin' ||
    user?.role?.code === 'admin';

  const canEdit =
    hasPermission('sessions:update') ||
    user?.role?.code === 'super_admin' ||
    user?.role?.code === 'admin';

  const loadSessions = async (showLoadingIndicator = true) => {
    if (showLoadingIndicator) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await sessionService.getSessions({
        search: searchQuery,
        status: selectedStatus,
        examDate: selectedExamDate,
        createdDate: selectedCreatedDate,
        showArchived,
        page,
        pageSize,
      });

      setSessions(res.sessions);
      setTotalCount(res.totalCount);
    } catch (err) {
      console.warn('Failed to load sessions from database:', err);
      setSessions([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedStatus, selectedExamDate, selectedCreatedDate, showArchived]);

  useEffect(() => {
    loadSessions();
  }, [searchQuery, selectedStatus, selectedExamDate, selectedCreatedDate, showArchived, page]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const isFiltering =
    searchQuery.trim() !== '' ||
    selectedStatus !== 'ALL' ||
    selectedExamDate !== '' ||
    selectedCreatedDate !== '' ||
    showArchived;

  return (
    <div className="space-y-4">
      {/* 1. Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#172033]">Sessions</h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage examination sessions and scanning batches
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Switcher Toggle */}
          <div className="flex items-center bg-white border border-[#E2E8F0] rounded-lg p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'cards'
                  ? 'bg-[#1565D8] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
              title="Cards View (No horizontal scrolling)"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-[#1565D8] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
              title="Table View"
            >
              <List className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadSessions(false)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-semibold text-[#172033] hover:bg-slate-50 transition-colors shadow-xs"
            title="Refresh database records"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[#64748B] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={onCreateSession}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] active:bg-[#0A3880] transition-colors shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Create Session</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Box */}
          <div className="md:col-span-4 relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[#64748B]">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search Session ID, Exam name, Subject..."
              className="w-full h-10 rounded-lg border border-[#E2E8F0] bg-white pl-9 pr-3 text-xs text-[#172033] placeholder-[#94A3B8] focus:border-[#1565D8] focus:outline-none focus:ring-1 focus:ring-[#1565D8]"
            />
          </div>

          {/* Status Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#172033] focus:border-[#1565D8] focus:outline-none focus:ring-1 focus:ring-[#1565D8]"
            >
              <option value="ALL">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Ready">Ready</option>
              <option value="Scanning">Scanning</option>
              <option value="Verification">Verification</option>
              <option value="Completed">Completed</option>
              <option value="Archived">Archived</option>
            </select>
          </div>

          {/* Exam Date Filter */}
          <div className="md:col-span-2">
            <input
              type="date"
              value={selectedExamDate}
              onChange={e => setSelectedExamDate(e.target.value)}
              className="w-full h-10 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#172033] focus:border-[#1565D8] focus:outline-none focus:ring-1 focus:ring-[#1565D8]"
              title="Filter by Exam Date"
            />
          </div>

          {/* Created Date Filter */}
          <div className="md:col-span-2">
            <input
              type="date"
              value={selectedCreatedDate}
              onChange={e => setSelectedCreatedDate(e.target.value)}
              className="w-full h-10 px-2.5 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#172033] focus:border-[#1565D8] focus:outline-none focus:ring-1 focus:ring-[#1565D8]"
              title="Filter by Creation Date"
            />
          </div>

          {/* Reset Filters / Show Archived */}
          <div className="md:col-span-1 flex items-center justify-end">
            {isFiltering && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedStatus('ALL');
                  setSelectedExamDate('');
                  setSelectedCreatedDate('');
                  setShowArchived(false);
                }}
                className="text-xs text-[#1565D8] hover:text-[#0D47A1] font-semibold transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Show Archived Toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-[#64748B] hover:text-[#172033]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[#E2E8F0] text-[#1565D8] focus:ring-[#1565D8]"
            />
            <span>Show Archived Sessions in default listing</span>
          </label>

          <span className="text-[#64748B] font-medium font-tabular">
            Total Records: <strong className="text-[#172033]">{totalCount}</strong>
          </span>
        </div>
      </div>

      {/* 3. Operational Data Display: Cards View (Default, Zero Horizontal Scroll) or Table View */}
      {viewMode === 'cards' ? (
        <div className="space-y-3">
          {isLoading ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-12 text-center">
              <div className="flex flex-col items-center justify-center gap-2">
                <div className="h-6 w-6 border-2 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin" />
                <span className="text-xs font-semibold text-[#172033]">Loading session records...</span>
              </div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-lg border border-[#E2E8F0] bg-white p-12 text-center">
              <div className="flex flex-col items-center justify-center gap-2">
                <AlertCircle className="h-8 w-8 text-[#94A3B8]" />
                <span className="font-semibold text-sm text-[#172033]">
                  {isFiltering ? 'No matching sessions found' : 'No sessions found'}
                </span>
                <p className="text-xs text-[#64748B] max-w-sm">
                  {isFiltering
                    ? 'Try adjusting your search query, date range, or status filter options.'
                    : 'Create your first examination session to begin the scanning workflow.'}
                </p>
                {canCreate && !isFiltering && (
                  <button
                    type="button"
                    onClick={onCreateSession}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAF2FF] text-[#1565D8] border border-[#BFDBFE] text-xs font-semibold hover:bg-[#D8E6FC] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Session</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {sessions.map(s => (
                <div
                  key={s.id}
                  onClick={() => onViewDetails(s.id)}
                  className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs hover:border-[#1565D8] hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between space-y-3"
                >
                  {/* Top Bar: Session ID & Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-sm font-bold text-[#1565D8]">
                        {s.session_code}
                      </span>
                      {s.session_type && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[#475569] text-[10px] font-semibold uppercase">
                          {s.session_type}
                        </span>
                      )}
                    </div>
                    <StatusBadge status={s.status} />
                  </div>

                  {/* Exam Details */}
                  <div>
                    <h3 className="text-sm font-bold text-[#172033] leading-snug line-clamp-2">
                      {s.exam_name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#64748B] mt-1 flex-wrap">
                      <span className="font-medium text-[#334155]">{s.subject}</span>
                      {s.exam_code && (
                        <>
                          <span>•</span>
                          <span className="font-mono text-[11px]">{s.exam_code}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Date & University */}
                  <div className="flex items-center justify-between text-xs py-2 border-y border-slate-100">
                    <div className="flex items-center gap-1.5 text-[#64748B]">
                      <Calendar className="h-3.5 w-3.5 text-[#1565D8]" />
                      <span className="font-medium text-[#172033]">{s.exam_date}</span>
                    </div>
                    {s.university && (
                      <span className="text-[11px] font-medium text-[#64748B] max-w-[120px] truncate">
                        {s.university}
                      </span>
                    )}
                  </div>

                  {/* 4-Metric Grid */}
                  <div className="grid grid-cols-4 gap-1.5 text-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div>
                      <div className="text-[9px] uppercase font-bold text-[#64748B]">Expected</div>
                      <div className="text-xs font-bold font-tabular text-[#172033] mt-0.5">
                        {s.expected_script_count.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase font-bold text-[#1565D8]">Received</div>
                      <div className="text-xs font-bold font-tabular text-[#1565D8] mt-0.5">
                        {s.received_scripts.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase font-bold text-[#2563EB]">Scanned</div>
                      <div className="text-xs font-bold font-tabular text-[#2563EB] mt-0.5">
                        {s.scanned_scripts.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase font-bold text-[#16A34A]">Verified</div>
                      <div className="text-xs font-bold font-tabular text-[#16A34A] mt-0.5">
                        {s.verified_scripts.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center justify-between pt-1 border-t border-slate-100"
                    onClick={e => e.stopPropagation()}
                  >
                    <span className="text-[10px] text-[#94A3B8]">
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {canEdit && s.status !== 'Archived' && (
                        <button
                          type="button"
                          onClick={() => onEditSession(s)}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-[#64748B] hover:text-[#172033] transition-colors"
                          title="Edit Session"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onViewDetails(s.id)}
                        className="px-2.5 py-1 rounded-md bg-[#EAF2FF] text-[#1565D8] text-xs font-semibold hover:bg-[#D8E6FC] transition-colors"
                      >
                        Details
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenScanning(s.session_code)}
                        className="px-2.5 py-1 rounded-md bg-[#1565D8] text-white hover:bg-[#0D47A1] text-xs font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                      >
                        <Scan className="h-3 w-3" />
                        <span>Scan</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Table View (Alternative) */
        <div className="rounded-lg border border-[#E2E8F0] bg-white overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[#172033]">
              <thead className="border-b border-[#E2E8F0] bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                <tr>
                  <th scope="col" className="px-3.5 py-3">Session ID</th>
                  <th scope="col" className="px-3.5 py-3">Exam Name</th>
                  <th scope="col" className="px-3.5 py-3">Exam Date</th>
                  <th scope="col" className="px-3.5 py-3">Subject</th>
                  <th scope="col" className="px-3.5 py-3 text-right">Expected</th>
                  <th scope="col" className="px-3.5 py-3 text-right">Received</th>
                  <th scope="col" className="px-3.5 py-3 text-right">Scanned</th>
                  <th scope="col" className="px-3.5 py-3 text-right">Verified</th>
                  <th scope="col" className="px-3.5 py-3 text-center">Status</th>
                  <th scope="col" className="px-3.5 py-3">Created At</th>
                  <th scope="col" className="px-3.5 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-[#64748B]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="h-6 w-6 border-2 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin" />
                        <span className="text-xs font-semibold text-[#172033]">Querying session records...</span>
                      </div>
                    </td>
                  </tr>
                ) : sessions.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center text-[#64748B]">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="h-8 w-8 text-[#94A3B8]" />
                        <span className="font-semibold text-sm text-[#172033]">
                          {isFiltering ? 'No matching sessions found' : 'No sessions found'}
                        </span>
                        <p className="text-xs text-[#64748B] max-w-sm">
                          {isFiltering
                            ? 'Try adjusting your search query, date range, or status filter options.'
                            : 'Create your first examination session to begin the scanning workflow.'}
                        </p>
                        {canCreate && !isFiltering && (
                          <button
                            type="button"
                            onClick={onCreateSession}
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAF2FF] text-[#1565D8] border border-[#BFDBFE] text-xs font-semibold hover:bg-[#D8E6FC] transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Create Session</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  sessions.map(s => (
                    <tr
                      key={s.id}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      onClick={() => onViewDetails(s.id)}
                    >
                      {/* 1. Session ID */}
                      <td className="px-3.5 py-3 font-mono font-bold text-[#1565D8]">
                        {s.session_code}
                      </td>

                      {/* 2. Exam Name */}
                      <td className="px-3.5 py-3 font-semibold text-[#172033] max-w-xs truncate">
                        {s.exam_name}
                      </td>

                      {/* 3. Exam Date */}
                      <td className="px-3.5 py-3 text-[#64748B] font-medium whitespace-nowrap">
                        {s.exam_date}
                      </td>

                      {/* 4. Subject */}
                      <td className="px-3.5 py-3 text-[#172033] max-w-xs truncate">
                        {s.subject}
                      </td>

                      {/* 5. Total Expected */}
                      <td className="px-3.5 py-3 text-right font-bold font-tabular text-[#172033]">
                        {s.expected_script_count.toLocaleString()}
                      </td>

                      {/* 6. Received */}
                      <td className="px-3.5 py-3 text-right font-tabular text-[#1565D8] font-medium">
                        {s.received_scripts.toLocaleString()}
                      </td>

                      {/* 7. Scanned */}
                      <td className="px-3.5 py-3 text-right font-tabular text-[#2563EB] font-medium">
                        {s.scanned_scripts.toLocaleString()}
                      </td>

                      {/* 8. Verified */}
                      <td className="px-3.5 py-3 text-right font-tabular text-[#16A34A] font-bold">
                        {s.verified_scripts.toLocaleString()}
                      </td>

                      {/* 9. Status */}
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <StatusBadge status={s.status} />
                      </td>

                      {/* 10. Created At */}
                      <td className="px-3.5 py-3 text-[#64748B] whitespace-nowrap text-[11px]">
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>

                      {/* 11. Actions */}
                      <td
                        className="px-3.5 py-3 text-right whitespace-nowrap"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewDetails(s.id)}
                            className="p-1.5 rounded-md hover:bg-[#EAF2FF] text-[#1565D8] transition-colors"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {canEdit && s.status !== 'Archived' && (
                            <button
                              type="button"
                              onClick={() => onEditSession(s)}
                              className="p-1.5 rounded-md hover:bg-slate-100 text-[#64748B] hover:text-[#172033] transition-colors"
                              title="Edit Session"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onOpenScanning(s.session_code)}
                            className="px-2.5 py-1 rounded-md bg-[#1565D8] text-white hover:bg-[#0D47A1] text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-2xs"
                            title="Open Session for Scanning"
                          >
                            <Scan className="h-3 w-3" />
                            <span>Open</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

        {/* Pagination Footer */}
        {totalCount > pageSize && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#E2E8F0] bg-white text-xs">
            <span className="text-[#64748B]">
              Showing <strong className="text-[#172033]">{(page - 1) * pageSize + 1}</strong> to{' '}
              <strong className="text-[#172033]">{Math.min(page * pageSize, totalCount)}</strong> of{' '}
              <strong className="text-[#172033]">{totalCount}</strong> sessions
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-md border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#172033] disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 font-medium font-tabular text-[#172033]">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-md border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#172033] disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };
