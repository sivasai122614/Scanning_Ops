// ==============================================================================
// Role & Permission Matrix View (Module 1 - Access Governance - Light Theme)
// Transparent institutional inspection of the 7 PRD roles & 40 permissions
// ==============================================================================

import React, { useState } from 'react';
import { SYSTEM_ROLES, SYSTEM_PERMISSIONS, ROLE_PERMISSION_MAP } from '../../data/seedData';
import { RoleBadge } from '../common/StatusBadge';
import { ShieldCheck, Check, X, Filter } from 'lucide-react';

export const RolePermissionsMatrixModal: React.FC = () => {
  const [selectedModule, setSelectedModule] = useState('ALL');

  const modules = Array.from(new Set(SYSTEM_PERMISSIONS.map(p => p.module)));

  const filteredPermissions =
    selectedModule === 'ALL'
      ? SYSTEM_PERMISSIONS
      : SYSTEM_PERMISSIONS.filter(p => p.module === selectedModule);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
            <span>Role-Based Access Control (RBAC) Matrix</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Enforced at the PostgreSQL Row-Level Security layer via{' '}
            <span className="font-mono text-indigo-700 font-medium">auth.has_permission(code)</span>
          </p>
        </div>

        {/* Filter by Module */}
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <select
            value={selectedModule}
            onChange={e => setSelectedModule(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/20 shadow-xs"
          >
            <option value="ALL">All Modules ({SYSTEM_PERMISSIONS.length} Permissions)</option>
            {modules.map(mod => (
              <option key={mod} value={mod}>
                {mod}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Role Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {SYSTEM_ROLES.map(role => {
          const permCount = (ROLE_PERMISSION_MAP[role.code] || []).length;
          return (
            <div
              key={role.id}
              className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col justify-between shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <RoleBadge roleCode={role.code} roleName={role.name} size="sm" />
                  <span className="font-mono text-[11px] text-indigo-700 font-semibold">
                    {permCount} Perms
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                  {role.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Matrix Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-3.5 font-bold uppercase tracking-wider text-[11px] min-w-[240px]">
                  Permission Action Code
                </th>
                <th className="px-3 py-3.5 font-bold uppercase tracking-wider text-[11px] min-w-[130px]">
                  Module
                </th>
                {SYSTEM_ROLES.map(role => (
                  <th
                    key={role.id}
                    className="px-2.5 py-3.5 text-center font-bold uppercase tracking-wider text-[10px] min-w-[110px]"
                  >
                    <div className="truncate text-slate-800">{role.name.split(' ')[0]}</div>
                    <div className="text-[9px] font-mono text-slate-500 font-normal">
                      {role.code}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredPermissions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No roles found
                  </td>
                </tr>
              ) : (
                filteredPermissions.map(perm => (
                  <tr key={perm.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-mono font-semibold text-slate-900">{perm.code}</div>
                      <div className="text-[11px] text-slate-500">{perm.description}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 font-medium">
                        {perm.module}
                      </span>
                    </td>
                    {SYSTEM_ROLES.map(role => {
                      const rolePerms = ROLE_PERMISSION_MAP[role.code] || [];
                      const isGranted = rolePerms.includes(perm.code);
                      return (
                        <td key={role.id} className="px-2.5 py-2.5 text-center">
                          {isGranted ? (
                            <div className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700">
                              <Check className="h-3.5 w-3.5" />
                            </div>
                          ) : (
                            <div className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-50 text-slate-300">
                              <X className="h-3 w-3" />
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
