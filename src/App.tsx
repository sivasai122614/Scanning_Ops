// ==============================================================================
// Exam Scanning & Script Verification Operations System
// Core App Orchestrator - 8-Module Light Theme Architecture
// Matches Reference Image: 390px Mobile Viewport & Desktop Adaptive Layout
// ==============================================================================

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/auth/LoginScreen';
import { InactivityLockScreen } from './components/auth/InactivityLockScreen';
import { ForcedPasswordChangeModal } from './components/auth/ForcedPasswordChangeModal';
import { AppHeader } from './components/layout/AppHeader';
import { AppSidebar, DesktopNavTarget } from './components/layout/AppSidebar';
import { BottomNavigation, MainNavTab } from './components/layout/BottomNavigation';
import { DashboardView } from './components/dashboard/DashboardView';
import { SessionsManagerView } from './components/sessions/SessionsManagerView';
import { BarcodeScannerView } from './components/scanner/BarcodeScannerView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { ImportDataView } from './components/importData/ImportDataView';
import { UserManagementView } from './components/users/UserManagementView';
import { RolePermissionsMatrixModal } from './components/matrix/RolePermissionsMatrixModal';
import { AuditLogViewer } from './components/audit/AuditLogViewer';
import { ScenarioTestingConsole } from './components/testing/ScenarioTestingConsole';
import { UserProfileView } from './components/profile/UserProfileView';
import { CreateUserModal } from './components/users/CreateUserModal';
import { PageContainer } from './components/ui/Elements';

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

const AuthenticatedApp: React.FC = () => {
  const { isLocked, mustChangePassword } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>('home');
  const [previousView, setPreviousView] = useState<ActiveView>('home');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [scannerTargetSchedule, setScannerTargetSchedule] = useState<string | undefined>(undefined);
  const [sessionsInitialMode, setSessionsInitialMode] = useState<'list' | 'details' | 'inward' | 'create'>('list');

  const navigateTo = (view: ActiveView) => {
    setPreviousView(activeView);
    setActiveView(view);
  };

  // Determine title and back button state for AppHeader
  const getHeaderConfig = () => {
    switch (activeView) {
      case 'home':
        return { title: 'ExamScan', isRoot: true };
      case 'import-data':
        return { title: 'Import Data for Inwarding', isRoot: true };
      case 'sessions':
        return { title: 'Manual Inwarding', isRoot: true };
      case 'scan':
        return { title: 'Scan Scripts', isRoot: true };
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
        return { title: 'ExamScan', isRoot: true };
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
    activeView === 'scan'
      ? 'more'
      : (activeView as MainNavTab);

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#172033] flex flex-col selection:bg-[#1565D8] selection:text-white font-sans">
      {/* 1. Inactivity Lock Screen Takeover (if inactive for 45 mins) */}
      {isLocked && <InactivityLockScreen />}

      {/* 2. Mandatory First-Time Password Rotation Modal */}
      {mustChangePassword && <ForcedPasswordChangeModal />}

      {/* 3. Global App Header (Blue #1565D8 matching reference) */}
      <AppHeader
        title={headerCfg.title}
        showBackButton={!headerCfg.isRoot}
        onBack={() => navigateTo(headerCfg.isRoot ? 'home' : 'more')}
        onOpenProfile={() => navigateTo('my-profile')}
        onOpenNotifications={() => navigateTo('home')}
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
              />
            )}

            {/* NEW SECTION 2: IMPORT DATA FOR INWARDING & BARCODE SCANNER */}
            {activeView === 'import-data' && (
              <ImportDataView
                onNavigateToManualInward={() => navigateTo('sessions')}
              />
            )}

            {/* FRAMES 2 & 3: EXAM SESSIONS & MANUAL INWARD INTAKE */}
            {activeView === 'sessions' && (
              <SessionsManagerView
                initialMode={sessionsInitialMode}
                onNavigateToScan={scheduleId => {
                  setScannerTargetSchedule(scheduleId);
                  navigateTo('scan');
                }}
              />
            )}

            {/* FRAMES 4, 5, 6: BARCODE SCANNER, VERIFICATION & MISSING SCRIPTS */}
            {activeView === 'scan' && (
              <BarcodeScannerView
                initialScheduleId={scannerTargetSchedule}
                onNavigateToSessions={() => {
                  setSessionsInitialMode('list');
                  navigateTo('sessions');
                }}
                onNavigateToInward={() => {
                  setSessionsInitialMode('inward');
                  navigateTo('sessions');
                }}
              />
            )}

            {/* FRAME 7: REPORTS & EXPORT */}
            {activeView === 'reports' && <ReportsView />}

            {/* FRAME 8: SETTINGS / USERS / AUDIT HUB */}
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

const MainRouter: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full bg-[#F5F7FA] flex flex-col items-center justify-center text-[#64748B]">
        <div className="h-8 w-8 border-2 border-[#1565D8]/20 border-t-[#1565D8] rounded-full animate-spin mb-4"></div>
        <div className="text-xs font-medium tracking-wider uppercase text-[#172033]">
          Verifying Institutional Session Integrity...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <AuthenticatedApp />;
};

export function App() {
  return (
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  );
}

export default App;
