// ==============================================================================
// Immutable Audit Log Viewer (Module 1 - Governance & Compliance - Light Theme)
// Append-only chronological stream of authentication & provisioning events
// Honest empty state: "No activity yet" / "No results found"
// ==============================================================================

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { userService } from '../../services/userService';
import { AuditLog, AuditActionType } from '../../types/auth';
import { FileSpreadsheet, Search, Filter, ChevronRight, ChevronDown, RefreshCw, AlertCircle } from 'lucide-react';

export const AuditLogViewer: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionFilter, setSelectedActionFilter] = useState('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadLogs = () => {
    if (!user) return;
    const records = userService.getAuditLogs(user.id, {
      search: searchQuery,
      action: selectedActionFilter,
    });
    setLogs(records);
  };

  useEffect(() => {
    loadLogs();
  }, [user, searchQuery, selectedActionFilter]);

  const actionColors: Record<AuditActionType | string, { bg: string; text: string; border: string }> = {
    USER_CREATED: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    USER_UPDATED: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
    USER_ACTIVATED: { bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200' },
    USER_DEACTIVATED: { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
    ROLE_CHANGED: { bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
    PASSWORD_CHANGED: { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },
    PASSWORD_RESET_REQUESTED: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    LOGIN: { bg: 'bg-cyan-50', text: 'text-cyan-800', border: 'border-cyan-200' },
    LOGOUT: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' },
    SESSION_LOCKED: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    SESSION_UNLOCKED: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    UNAUTHORIZED_ACCESS_ATTEMPT: { bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-300' },
  };

  const isFiltering = searchQuery.trim() !== '' || selectedActionFilter !== 'ALL';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <FileSpreadsheet className="h-6 w-6 text-indigo-600" />
            <span>Immutable Audit Trail</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Append-only regulatory event register. Changes cannot be modified or deleted.
          </p>
        </div>

        <button
          type="button"
          onClick={loadLogs}
          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Stream</span>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by actor email, action type, entity ID..."
              className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedActionFilter}
              onChange={e => setSelectedActionFilter(e.target.value)}
              className="w-full md:w-56 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
            >
              <option value="ALL">All Actions ({logs.length})</option>
              <option value="USER_CREATED">USER_CREATED</option>
              <option value="USER_UPDATED">USER_UPDATED</option>
              <option value="USER_ACTIVATED">USER_ACTIVATED</option>
              <option value="USER_DEACTIVATED">USER_DEACTIVATED</option>
              <option value="ROLE_CHANGED">ROLE_CHANGED</option>
              <option value="PASSWORD_CHANGED">PASSWORD_CHANGED</option>
              <option value="PASSWORD_RESET_REQUESTED">PASSWORD_RESET_REQUESTED</option>
              <option value="LOGIN">LOGIN</option>
              <option value="LOGOUT">LOGOUT</option>
              <option value="SESSION_LOCKED">SESSION_LOCKED</option>
              <option value="SESSION_UNLOCKED">SESSION_UNLOCKED</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-4 py-3.5">Timestamp</th>
                <th className="px-4 py-3.5">Action Code</th>
                <th className="px-4 py-3.5">Actor</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Target Entity</th>
                <th className="px-4 py-3.5">Target ID</th>
                <th className="px-4 py-3.5 text-right">Payload Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <AlertCircle className="h-8 w-8 text-slate-300" />
                      <span className="font-semibold text-sm text-slate-700">
                        {isFiltering ? 'No results found' : 'No activity yet'}
                      </span>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {isFiltering
                          ? 'No audit log entries match the search criteria.'
                          : 'As operational staff log in, rotate passwords, and perform governance events, records will stream here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const cfg = actionColors[log.action] || {
                    bg: 'bg-slate-100',
                    text: 'text-slate-700',
                    border: 'border-slate-200',
                  };
                  const isExpanded = expandedLogId === log.id;
                  const hasDetails = Boolean(log.old_values || log.new_values);

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-slate-500">
                          {new Date(log.created_at).toLocaleString()}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md font-mono text-[11px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
                          >
                            {log.action}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-700">{log.actor_email || 'SYSTEM'}</td>

                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-indigo-700 font-medium">
                            {log.actor_role || 'system'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                            {log.entity_name}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{log.entity_id}</td>

                        <td className="px-4 py-3 text-right">
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                              className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 transition-colors font-medium"
                            >
                              <span>{isExpanded ? 'Hide Diff' : 'View Diff'}</span>
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && hasDetails && (
                        <tr className="bg-slate-50">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                              {log.old_values && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                                  <div className="text-[11px] font-bold text-rose-800 mb-1.5 uppercase">
                                    Before State (Old Values)
                                  </div>
                                  <pre className="text-[11px] text-rose-900 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(log.old_values, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.new_values && (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                                  <div className="text-[11px] font-bold text-emerald-800 mb-1.5 uppercase">
                                    After State (New Values)
                                  </div>
                                  <pre className="text-[11px] text-emerald-900 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(log.new_values, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                            <div className="mt-2 text-[10px] text-slate-400 font-mono">
                              IP: {log.ip_address} • User-Agent: {log.user_agent}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
