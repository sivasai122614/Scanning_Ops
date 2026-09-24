// ==============================================================================
// ExamScan Bottom Navigation (Mobile Touch-First 5-Tab Bar)
// Matches Reference: Home | Sessions | Scan | Reports | More
// Active: Primary Blue #1565D8, Inactive: Gray #64748B
// ==============================================================================

import React from 'react';
import { Home, Package, Scan, BarChart2, MoreHorizontal } from 'lucide-react';

export type MainNavTab = 'home' | 'sessions' | 'scan' | 'reports' | 'more';

interface BottomNavigationProps {
  activeTab: MainNavTab;
  onSelectTab: (tab: MainNavTab) => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, onSelectTab }) => {
  const tabs = [
    { id: 'home' as const, label: 'Home', icon: Home },
    { id: 'sessions' as const, label: 'Inward', icon: Package },
    { id: 'scan' as const, label: 'Scan', icon: Scan },
    { id: 'reports' as const, label: 'Reports', icon: BarChart2 },
    { id: 'more' as const, label: 'More', icon: MoreHorizontal },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E2E8F0] shadow-sm select-none">
      <div className="max-w-md mx-auto grid grid-cols-5 h-15 items-center px-1">
        {tabs.map(t => {
          const isActive = activeTab === t.id;
          const Icon = t.icon;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] py-1 transition-colors focus:outline-none ${
                isActive ? 'text-[#1565D8]' : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              <Icon
                className={`h-5 w-5 transition-transform ${
                  isActive ? 'stroke-[2.5] scale-105' : 'stroke-[1.75]'
                }`}
              />
              <span
                className={`text-[11px] tracking-tight mt-1 transition-all ${
                  isActive ? 'font-semibold text-[#1565D8]' : 'font-normal text-[#64748B]'
                }`}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
