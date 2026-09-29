// ==============================================================================
// Exam Scanning & Script Verification Operations System
// Core App Orchestrator - Enterprise Role-Based Access Control (RBAC)
// Strictly enforces Supabase Auth + public.profiles roles ('admin' vs 'inward')
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/auth/LoginScreen';
import { InactivityLockScreen } from './components/auth/InactivityLockScreen';
import { ForcedPasswordChangeModal } from './components/auth/ForcedPasswordChangeModal';
import { AppHeader } from './components/layout/AppHeader';
import { AppSidebar, DesktopNavTarget } from './components/layout/AppSidebar';
import { BottomNavigation, MainNavTab } from './components/layout/BottomNavigation';
import { DashboardView } from './components/dashboard/DashboardView';
import { ScanningDashboardView } from './components/dashboard/ScanningDashboardView';
import { SessionsManagerView } from './components/sessions/SessionsManagerView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { ImportDataView } from './components/importData/ImportDataView';
import { UserManagementView } from './components/users/UserManagementView';
import { RolePermissionsMatrixModal } from './components/matrix/RolePermissionsMatrixModal';
import { AuditLogViewer } from './components/audit/AuditLogViewer';
import { ScenarioTestingConsole } from './components/testing/ScenarioTestingConsole';
import { UserProfileView } from './components/profile/UserProfileView';
import { CreateUserModal } from './components/users/CreateUserModal';
import { MobileScanningView } from './components/scanner/MobileScanningView';
import { PageContainer } from './components/ui/Elements';
import { ScanLine, LogOut, ShieldAlert } from 'lucide-react';

type ActiveView =
  | 'home'
  | 'import-data'
  | 'sessions'
  | 'scan'
  | 'reports'
  | 'more'
  | 'users-directory'
  | 'role-permissions'
  | 'audit-logs'
  | 'test-suite'
  | 'my-profile';

const PATH_TO_VIEW_MAP: Record<string, ActiveView> = {
  '/admin': 'home',
  '/admin/dashboard': 'home',
  '/admin/import': 'import-data',
  '/import': 'import-data',
  '/admin/sessions': 'sessions',
  '/sessions': 'sessions',
  '/admin/scan': 'scan',
  '/scan': 'scan',
  '/admin/reports': 'reports',
  '/reports': 'reports',
  '/admin/settings': 'more',
  '/more': 'more',
  '/admin/users': 'users-directory',
  '/users-directory': 'users-directory',
  '/admin/roles': 'role-permissions',
  '/role-permissions': 'role-permissions',
  '/admin/audit': 'audit-logs',
  '/audit-logs': 'audit-logs',
  '/admin/test-suite': 'test-suite',
  '/test-suite': 'test-suite',
  '/admin/profile': 'my-profile',
  '/my-profile': 'my-profile',
};

const VIEW_TO_PATH_MAP: Record<ActiveView, string> = {
  'home': '/admin/dashboard',
  'import-data': '/admin/import',
  'sessions': '/admin/sessions',
  'scan': '/admin/scan',
  'reports': '/admin/reports',
  'more': '/admin/settings',
  'users-directory': '/admin/users',
  'role-permissions': '/admin/roles',
  'audit-logs': '/admin/audit',
  'test-suite': '/admin/test-suite',
  'my-profile': '/admin/profile',
};

// ==============================================================================
// 1. INWARD RESTRICTED APPLICATION WORKFLOW (/inward/scan)
// STRICT REQUIREMENT #4:
// Only allowed:
//   - Camera / Barcode scanner
//   - Class ID scanning
//   - Class-specific inward data
//   - Inward processing
//   - Save button
//   - Return to Class ID scanner
//   - Logout
// Prohibited:
//   - Admin dashboard, Import, Reports, Users, Admin settings, Database management
//   - Any Admin-only route
// ==============================================================================
const InwardScannerApp: React.FC = () => {
  const { user, logout } = useAuth();
  const [deniedToast, setDeniedToast] = useState<string | null>(null);

  // Enforce /inward/scan route guard and deny admin URL manipulation
  useEffect(() => {
    const enforceInwardUrl = () => {
      const currentPath = window.location.pathname;
      if (currentPath !== '/inward/scan') {
        setDeniedToast(`Access Denied: Inward role cannot access "${currentPath}". Redirected to /inward/scan.`);
        window.history.replaceState(null, '', '/inward/scan');
        setTimeout(() => setDeniedToast(null), 4000);
      }
    };

    enforceInwardUrl();
    window.addEventListener('popstate', enforceInwardUrl);
    return () => window.removeEventListener('popstate', enforceInwardUrl);
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#172033] flex flex-col font-sans">
      {/* Dedicated Inward Header with Logout */}
      <header className="sticky top-0 z-40 w-full bg-[#1565D8] text-white shadow-sm">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-[#1565D8] shadow-xs">
              <ScanLine className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="text-sm font-bold text-white tracking-tight leading-tight">
                ExamScan • Inward Station
              </div>
              <div className="text-[10px] text-blue-100 font-medium">
                Operator: <span className="font-bold text-white">{user?.username || user?.email?.split('@')[0] || 'Inward Staff'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-500/25 border border-emerald-300/40 text-emerald-100 text-[10px] font-black uppercase tracking-wider rounded-md">
              INWARD
            </span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-bold transition-all shadow-xs cursor-pointer focus:outline-hidden"
              title="Sign Out of Terminal"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Access Denied Warning Toast if user attempted to type an Admin URL */}
      {deniedToast && (
        <div className="max-w-md mx-auto px-4 mt-2 w-full animate-in fade-in duration-200">
          <div className="p-3 bg-red-100 border border-red-300 rounded-xl text-xs text-red-800 flex items-center gap-2 shadow-xs">
            <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
            <span className="font-semibold">{deniedToast}</span>
          </div>
        </div>
      )}

      {/* Inward Restricted Scanning Viewport */}
      <main className="flex-1 overflow-y-auto">
        <MobileScanningView isRestrictedInward={true} />
      </main>
    </div>
  );
};

// ==============================================================================
// 2. AUTHENTICATED ADMIN APPLICATION
// STRICT REQUIREMENT #5: Only profiles.role = 'admin' may receive Admin access
// ==============================================================================
const AuthenticatedAdminApp: React.FC = () => {
  const { isLocked, mustChangePassword } = useAuth();

  // Restore current route from window.location.pathname on mount/refresh
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      if (PATH_TO_VIEW_MAP[currentPath]) {
        return PATH_TO_VIEW_MAP[currentPath];
      }
      const saved = localStorage.getItem('examscan_mobile_active_view');
      const validViews: ActiveView[] = [
        'home',
        'import-data',
        'sessions',
        'scan',
        'reports',
        'more',
        'users-directory',
        'role-permissions',
        'audit-logs',
        'test-suite',
        'my-profile',
      ];
      if (saved && validViews.includes(saved as ActiveView)) {
        return saved as ActiveView;
      }
    }
    return 'home';
  });

  const [previousView, setPreviousView] = useState<ActiveView>('home');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [, setScannerTargetSchedule] = useState<string | undefined>(undefined);
  const [sessionsInitialMode] = useState<'list' | 'details' | 'inward' | 'create'>('list');

  const navigateTo = useCallback((view: ActiveView) => {
    setPreviousView(activeView);
    setActiveView(view);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('examscan_mobile_active_view', view);
        const targetPath = VIEW_TO_PATH_MAP[view] || '/admin/dashboard';
        if (window.location.pathname !== targetPath) {
          window.history.pushState(null, '', targetPath);
        }
      } catch {}
    }
  }, [activeView]);

  // Sync state when browser Back / Forward buttons are used
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (PATH_TO_VIEW_MAP[path]) {
        setActiveView(PATH_TO_VIEW_MAP[path]);
      } else if (path === '/admin' || path === '/admin/dashboard') {
        setActiveView('home');
      }
    };

    // Ensure initial URL is mapped properly if currently generic
    const currentPath = window.location.pathname;
    if (currentPath === '/' || currentPath === '/login') {
      const initialPath = VIEW_TO_PATH_MAP[activeView] || '/admin/dashboard';
      window.history.replaceState(null, '', initialPath);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeView]);

  // Determine title and back button state for AppHeader
  const getHeaderConfig = () => {
    switch (activeView) {
      case 'home':
        return { title: 'Admin Dashboard', isRoot: true };
      case 'import-data':
        return { title: 'Import Data', isRoot: true };
      case 'sessions':
        return { title: 'Manual Inwarding', isRoot: true };
      case 'scan':
        return { title: 'Scanning Dashboard', isRoot: true };
      case 'reports':
        return { title: 'Reports', isRoot: true };
      case 'more':
        return { title: 'Settings', isRoot: true };
      case 'users-directory':
        return { title: 'Staff Registry', isRoot: false };
      case 'role-permissions':
        return { title: 'Roles & Permissions', isRoot: false };
      case 'audit-logs':
        return { title: 'Audit Trail', isRoot: false };
      case 'test-suite':
        return { title: 'Verification Suite', isRoot: false };
      case 'my-profile':
        return { title: 'Staff Profile', isRoot: false };
      default:
        return { title: 'Admin Dashboard', isRoot: true };
    }
  };

  const headerCfg = getHeaderConfig();

  // Bottom Navigation tab mapping
  const currentBottomTab: MainNavTab =
    activeView === 'users-directory' ||
    activeView === 'role-permissions' ||
    activeView === 'audit-logs' ||
    activeView === 'test-suite' ||
    activeView === 'my-profile' ||
    activeView === 'sessions'
      ? 'more'
      : (activeView as MainNavTab);

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#172033] flex flex-col selection:bg-[#1565D8] selection:text-white font-sans">
      {/* 1. Inactivity Lock Screen Takeover (if inactive for 45 mins) */}
      {isLocked && <InactivityLockScreen />}

      {/* 2. Mandatory First-Time Password Rotation Modal */}
      {mustChangePassword && <ForcedPasswordChangeModal />}

      {/* 3. Global App Header */}
      <AppHeader
        title={headerCfg.title}
        showBackButton={!headerCfg.isRoot}
        onBack={() => navigateTo(headerCfg.isRoot ? 'home' : 'more')}
        onOpenProfile={() => navigateTo('my-profile')}
        onOpenNotifications={() => navigateTo('home')}
        onNavigateToImport={() => navigateTo('import-data')}
      />

      {/* 4. Main Body: Desktop Sidebar + Dynamic Operational Workspace */}
      <div className="flex-1 flex flex-row overflow-hidden min-h-[calc(100vh-56px)]">
        {/* Desktop Sidebar Navigation */}
        <AppSidebar
          currentTab={activeView as DesktopNavTarget}
          onSelectTab={tab => navigateTo(tab)}
          onOpenCreateUser={() => setIsCreateModalOpen(true)}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto bg-[#F5F7FA]">
          <PageContainer>
            {/* FRAME 1: DASHBOARD */}
            {activeView === 'home' && (
              <DashboardView
                onNavigateToSessions={() => navigateTo('sessions')}
                onNavigateToScan={() => navigateTo('scan')}
                onNavigateToCreateSession={() => navigateTo('sessions')}
                onNavigateToExceptions={() => navigateTo('scan')}
                onNavigateToImport={() => navigateTo('import-data')}
              />
            )}

            {/* FRAME 2: IMPORT DATA FOR INWARDING */}
            {activeView === 'import-data' && (
              <ImportDataView
                onNavigateToScan={() => navigateTo('scan')}
                onNavigateToManualInward={() => navigateTo('sessions')}
                onNavigateToDashboard={() => navigateTo('home')}
              />
            )}

            {/* FRAME 3: EXAM SESSIONS & MANUAL INWARD INTAKE */}
            {activeView === 'sessions' && (
              <SessionsManagerView
                initialMode={sessionsInitialMode}
                onNavigateToScan={scheduleId => {
                  setScannerTargetSchedule(scheduleId);
                  navigateTo('scan');
                }}
              />
            )}

            {/* MAIN OPERATIONAL WORKSPACE: SCANNING DASHBOARD */}
            {activeView === 'scan' && (
              <ScanningDashboardView
                onNavigateToImport={() => navigateTo('import-data')}
                onNavigateToSessions={() => navigateTo('sessions')}
              />
            )}

            {/* FRAME 4: REPORTS & EXPORT */}
            {activeView === 'reports' && <ReportsView />}

            {/* FRAME 5: SETTINGS / USERS / AUDIT HUB */}
            {activeView === 'more' && (
              <SettingsView
                onNavigateToUsers={() => navigateTo('users-directory')}
                onNavigateToAudit={() => navigateTo('audit-logs')}
                onNavigateToRoles={() => navigateTo('role-permissions')}
                onNavigateToDiagnostics={() => navigateTo('test-suite')}
                onNavigateToProfile={() => navigateTo('my-profile')}
              />
            )}

            {/* MODULE 1: STAFF DIRECTORY */}
            {activeView === 'users-directory' && (
              <UserManagementView
                isCreateModalOpen={isCreateModalOpen}
                setIsCreateModalOpen={setIsCreateModalOpen}
              />
            )}

            {/* MODULE 1: ROLES & PERMISSIONS MATRIX */}
            {activeView === 'role-permissions' && <RolePermissionsMatrixModal />}

            {/* MODULE 1: AUDIT TRAIL */}
            {activeView === 'audit-logs' && <AuditLogViewer />}

            {/* MODULE 1: DIAGNOSTIC / VERIFICATION TEST SUITE */}
            {activeView === 'test-suite' && <ScenarioTestingConsole />}

            {/* MODULE 1: STAFF PROFILE */}
            {activeView === 'my-profile' && <UserProfileView />}
          </PageContainer>
        </main>
      </div>

      {/* 5. Mobile Touch Bottom Navigation (Fixed, 5 Tabs) */}
      <BottomNavigation
        activeTab={currentBottomTab}
        onSelectTab={tab => navigateTo(tab)}
      />

      {/* 6. Global Provision User Modal */}
      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onUserCreated={() => {
          navigateTo('users-directory');
        }}
      />
    </div>
  );
};

// ==============================================================================
// 3. MAIN ROUTER & ROUTE GUARDS
// STRICT REQUIREMENT #5, #6, #7, #10
// ==============================================================================
const MainRouter: React.FC = () => {
  const { isAuthenticated, isLoading, appRole, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-[#F5F7FA] flex flex-col items-center justify-center text-[#64748B]">
        <div className="h-8 w-8 border-2 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin mb-4"></div>
        <div className="text-xs font-semibold tracking-wider uppercase text-[#172033]">
          Verifying Institutional Session Integrity...
        </div>
      </div>
    );
  }

  // Not authenticated -> Show Login
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // STRICT REQUIREMENT #4 & #5: Route strictly according to profiles.role
  if (appRole === 'admin') {
    return <AuthenticatedAdminApp />;
  }

  if (appRole === 'inward') {
    return <InwardScannerApp />;
  }

  // Unknown role -> sign out and deny access
  logout();
  return <LoginScreen />;
};

export function App() {
  return (
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  );
}

export default App;
