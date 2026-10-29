// ==============================================================================
// ExamScan — Dedicated Fullscreen Desktop Inward Station (USB Barcode Gun)
//
// Designed specifically for High-Speed Valuation Centers & Evaluation Camps:
// 1. Zero-Click Hardware Gun Interception (HID Keyboard Wedge).
// 2. Full-width fluid responsive design (No awkward margins/gaps at 75% or 100% zoom).
// 3. Consistent light theme across normal and fullscreen kiosk mode (no dark mode).
// 4. Huge Visual HUD Flash Feedbacks (Green = Valid Inward, Red = Duplicate,
//    Amber = Class Mismatch, Red = Not in Import).
// 5. Real-time Inwarded Stream with instant counter updates.
// 6. Smooth micro-animations, transitions, and audio cues.
// 7. Manual barcode fallback entry for smudged or damaged barcodes.
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scan,
  Zap,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Save,
  Layers,
  ArrowRight,
  Search,
  Check,
  Building,
  Calendar,
  FileSpreadsheet,
  Download,
  Clock,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  BundleRecordView,
  SessionSummary,
  ScanResult,
} from '../../services/importedService';
import { playScanSuccessSound, playScanWarningSound } from '../../utils/scannerSound';
import { useBarcodeGunListener, BarcodeGunScanEvent } from '../../utils/useBarcodeGunListener';
import { ScannerTopToast, ScannerToastData } from '../scanner/ScannerTopToast';

export interface DesktopInwardStationProps {
  onNavigateToImport?: () => void;
  onNavigateToSessions?: () => void;
  isRestrictedInward?: boolean;
}

export const DesktopInwardStation: React.FC<DesktopInwardStationProps> = ({
  onNavigateToImport,
  isRestrictedInward = false,
}) => {
  const [bundles, setBundles] = useState<ClassBundle[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [hasImportedData, setHasImportedData] = useState<boolean>(false);
  const [classSearch, setClassSearch] = useState<string>('');

  // Active records for selected bundle
  const [records, setRecords] = useState<BundleRecordView[]>([]);
  const [activeRecordsTab, setActiveRecordsTab] = useState<'scanned' | 'not_scanned' | 'all'>('scanned');

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const stationContainerRef = useRef<HTMLDivElement | null>(null);

  // Sound chime state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Saving state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Recent Inward Stream
  interface RecentScanItem {
    id: string;
    barcode: string;
    memberId: string;
    classId: string;
    timestamp: Date;
    status: 'success' | 'duplicate' | 'wrong_class' | 'not_found';
    message: string;
  }
  const [recentScans, setRecentScans] = useState<RecentScanItem[]>([]);

  // Large Visual HUD Flash State
  interface HudFlashState {
    type: 'success' | 'duplicate' | 'wrong_class' | 'not_found' | 'info';
    title: string;
    subtitle: string;
    barcode: string;
    classId?: string;
    memberId?: string;
    timestamp: number;
  }
  const [hudFlash, setHudFlash] = useState<HudFlashState | null>(null);
  const flashTimeoutRef = useRef<any>(null);

  // Top Toast Notification
  const [topToast, setTopToast] = useState<ScannerToastData | null>(null);
  const showToast = useCallback((toastData: ScannerToastData) => {
    setTopToast({
      ...toastData,
      id: Date.now(),
    });
  }, []);

  // Manual fallback input
  const [manualInput, setManualInput] = useState<string>('');
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  // Load imported datasets and bundles
  const loadData = useCallback(() => {
    const hasData = importedService.hasImportedData();
    setHasImportedData(hasData);
    const bList = importedService.getClassBundles();
    const sum = importedService.getSessionSummary();
    setBundles(bList);
    setSessionSummary(sum);

    // Pick first class if none selected or invalid
    if (bList.length > 0) {
      setSelectedClassId(prev => {
        const exists = bList.find(b => b.classId.toLowerCase() === prev.toLowerCase());
        if (exists) return prev;
        // Prioritize first in-progress or not-started bundle
        const pending = bList.find(b => b.missingCount > 0);
        return pending ? pending.classId : bList[0].classId;
      });
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = importedService.subscribe(loadData);
    return () => unsub();
  }, [loadData]);

  // Load records for currently selected class
  useEffect(() => {
    if (selectedClassId) {
      const recs = importedService.getBundleRecordViews(selectedClassId);
      setRecords(recs);
    } else {
      setRecords([]);
    }
  }, [selectedClassId, bundles]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!stationContainerRef.current) return;
    if (!document.fullscreenElement) {
      stationContainerRef.current.requestFullscreen?.().catch(err => {
        console.warn('Fullscreen request note:', err);
      });
    } else {
      document.exitFullscreen?.().catch(err => {
        console.warn('Exit fullscreen note:', err);
      });
    }
  };

  // Trigger flash HUD with auto-dismiss
  const triggerHudFlash = useCallback((flash: HudFlashState, durationMs = 2800) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setHudFlash(flash);
    flashTimeoutRef.current = setTimeout(() => {
      setHudFlash(null);
    }, durationMs);
  }, []);

  // Main Barcode Processing Pipeline (Triggered by Physical Gun or Manual Entry)
  const processGunBarcode = useCallback(async (barcodeRaw: string, source: 'gun' | 'manual' = 'gun') => {
    const barcode = barcodeRaw.trim();
    if (!barcode) return;

    if (!hasImportedData) {
      if (soundEnabled) playScanWarningSound();
      showToast({
        type: 'error',
        title: '✕ Import Data First',
        subtitle: 'Please upload Excel data before scanning.',
        duration: 2500,
      });
      return;
    }

    console.log(`[DESKTOP GUN STATION] Processing ${source} scan: ${barcode}`);

    try {
      // 1. Process against selected class if one is active, otherwise process across all classes
      let result: ScanResult;
      if (selectedClassId) {
        result = await importedService.processBundleScan(selectedClassId, barcode);
      } else {
        result = await importedService.processScanningDashboardScan(barcode);
        if (result.class_id) {
          setSelectedClassId(result.class_id);
        }
      }

      // 2. Handle Case: Duplicate Inward
      if (result.isDuplicate) {
        if (soundEnabled) playScanWarningSound();
        triggerHudFlash({
          type: 'duplicate',
          title: 'ALREADY INWARDED',
          subtitle: `Booklet ${result.member_id || barcode} was already scanned.`,
          barcode,
          classId: selectedClassId || result.class_id,
          memberId: result.member_id,
          timestamp: Date.now(),
        }, 3200);

        setRecentScans(prev => [
          {
            id: String(Date.now()),
            barcode,
            memberId: result.member_id || barcode,
            classId: selectedClassId || result.class_id || '—',
            timestamp: new Date(),
            status: 'duplicate',
            message: 'Duplicate inward detected',
          },
          ...prev.slice(0, 19),
        ]);
        return;
      }

      // 3. Handle Case: Class Mismatch
      if (result.isWrongClass) {
        if (soundEnabled) playScanWarningSound();
        triggerHudFlash({
          type: 'wrong_class',
          title: 'CLASS ID MISMATCH',
          subtitle: `Belongs to Class ${result.detectedClassId || 'UNKNOWN'}, not active Class ${selectedClassId}!`,
          barcode,
          classId: selectedClassId,
          timestamp: Date.now(),
        }, 3500);

        setRecentScans(prev => [
          {
            id: String(Date.now()),
            barcode,
            memberId: result.detectedMemberId || barcode,
            classId: result.detectedClassId || 'UNKNOWN',
            timestamp: new Date(),
            status: 'wrong_class',
            message: `Class Mismatch (Belongs to ${result.detectedClassId})`,
          },
          ...prev.slice(0, 19),
        ]);
        return;
      }

      // 4. Handle Case: Member ID Not Found
      if (result.isUnknownMember) {
        if (soundEnabled) playScanWarningSound();
        triggerHudFlash({
          type: 'not_found',
          title: 'MEMBER ID NOT FOUND',
          subtitle: `Barcode "${barcode}" not in imported list for this class.`,
          barcode,
          classId: selectedClassId,
          timestamp: Date.now(),
        }, 3500);

        setRecentScans(prev => [
          {
            id: String(Date.now()),
            barcode,
            memberId: barcode,
            classId: selectedClassId || '—',
            timestamp: new Date(),
            status: 'not_found',
            message: 'Member not found in imported dataset',
          },
          ...prev.slice(0, 19),
        ]);
        return;
      }

      // 5. Handle Case: Valid Inward (Pending Save)
      if (result.success && result.member_id) {
        if (soundEnabled) playScanSuccessSound();
        const activeBundle = importedService.getClassBundle(selectedClassId || result.class_id || '');
        const currentScanned = (activeBundle?.savedCount || 0) + (activeBundle?.pendingCount || 0);
        const expected = activeBundle?.expectedCount || 0;

        triggerHudFlash({
          type: 'success',
          title: '✓ INWARD SUCCESS',
          subtitle: `Member: ${result.member_id} | Class: ${result.class_id || selectedClassId} (${currentScanned} of ${expected})`,
          barcode,
          classId: result.class_id || selectedClassId,
          memberId: result.member_id,
          timestamp: Date.now(),
        }, 2200);

        setRecentScans(prev => [
          {
            id: String(Date.now()),
            barcode,
            memberId: result.member_id!,
            classId: result.class_id || selectedClassId,
            timestamp: new Date(),
            status: 'success',
            message: 'Inwarded (Pending Save)',
          },
          ...prev.slice(0, 19),
        ]);

        // Refresh bundle data & records
        loadData();
      }
    } catch (err: any) {
      console.warn('Gun scan error:', err);
      if (soundEnabled) playScanWarningSound();
      showToast({
        type: 'error',
        title: '✕ Scan Error',
        subtitle: err?.message || 'Unexpected processing error',
        duration: 2000,
      });
    }
  }, [hasImportedData, selectedClassId, soundEnabled, triggerHudFlash, showToast, loadData]);

  // Connect Universal Barcode Gun Hardware Listener
  useBarcodeGunListener({
    enabled: true,
    minBarcodeLength: 3,
    maxKeystrokeIntervalMs: 80,
    onScan: (event: BarcodeGunScanEvent) => {
      processGunBarcode(event.barcode, 'gun');
    },
  });

  // Handle Save Bundle
  const handleSaveActiveBundle = async () => {
    if (!selectedClassId || isSaving) return;
    setIsSaving(true);
    setSaveSuccessMessage(null);

    try {
      await new Promise(r => setTimeout(r, 350));
      const res = await importedService.saveActiveBundle(selectedClassId);

      if (res.success) {
        if (soundEnabled) playScanSuccessSound();
        setSaveSuccessMessage(`✓ Saved ${res.savedCount} booklets permanently into database!`);
        setTimeout(() => setSaveSuccessMessage(null), 4000);
        loadData();
      } else {
        if (soundEnabled) playScanWarningSound();
        showToast({
          type: 'error',
          title: 'Save Incomplete',
          subtitle: res.message || 'Error committing scans to database',
          duration: 3000,
        });
      }
    } catch (e: any) {
      alert(e?.message || 'Error saving bundle');
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    processGunBarcode(manualInput.trim(), 'manual');
    setManualInput('');
  };

  const handleExportExcel = async () => {
    const uni = sessionSummary?.universityName || importedService.getActiveUniversity();
    try {
      const res = await importedService.exportUniversityExcel(uni);
      if (res.success) {
        showToast({
          type: 'success',
          title: 'Excel Exported',
          subtitle: res.filename,
          duration: 3000,
        });
      }
    } catch (e: any) {
      alert(e?.message || 'Export error');
    }
  };

  // Currently active bundle details
  const activeBundle = bundles.find(b => b.classId.toLowerCase() === selectedClassId.toLowerCase()) || bundles[0];
  const activeExpected = activeBundle?.expectedCount || 0;
  const activeSaved = activeBundle?.savedCount || 0;
  const activePending = activeBundle?.pendingCount || 0;
  const activeReceived = activeSaved + activePending;
  const activeMissing = Math.max(0, activeExpected - activeReceived);
  const activeProgress = activeExpected > 0 ? Math.min(100, Math.round((activeReceived / activeExpected) * 100)) : 0;

  // Filtered bundles for sidebar
  const filteredBundles = bundles.filter(b =>
    !classSearch || b.classId.toLowerCase().includes(classSearch.toLowerCase())
  );

  // Filtered records inside active bundle
  const filteredRecords = records.filter(r => {
    if (activeRecordsTab === 'scanned') {
      return r.scan_status === 'saved' || r.scan_status === 'pending_save';
    }
    if (activeRecordsTab === 'not_scanned') {
      return r.scan_status === 'not_started';
    }
    return true;
  });

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const universityName = sessionSummary?.universityName || importedService.getActiveUniversity();

  // ==============================================================================
  // BLOCKING STATE: NO IMPORTED DATA
  // ==============================================================================
  if (!hasImportedData || bundles.length === 0) {
    return (
      <div className="w-full space-y-4 font-sans pb-24">
        <div className="bg-white border-2 border-[#CBD5E1] rounded-2xl shadow-sm p-8 sm:p-12 text-center max-w-2xl mx-auto mt-6 transition-all duration-300">
          <div className="flex h-16 w-16 items-center justify-center bg-[#EFF6FF] text-[#1565D8] rounded-2xl mx-auto mb-4 border border-[#BFDBFE]">
            <FileSpreadsheet className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-black text-[#172033] uppercase tracking-wide">
            IMPORT DATA FIRST
          </h2>
          <div className="text-sm font-semibold text-[#DC2626] uppercase tracking-wider mt-1">
            NO IMPORTED DATA
          </div>
          <p className="text-xs text-[#64748B] max-w-md mx-auto mt-3 leading-relaxed">
            {isRestrictedInward
              ? 'Please contact the examination administrator to import the Class ID and Member ID dataset before starting inward scanning.'
              : 'Please import your examination Excel dataset first. Once imported, the USB Barcode Gun Listener Station will be instantly armed and ready for zero-click scanning.'}
          </p>
          {!isRestrictedInward && onNavigateToImport && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onNavigateToImport}
                className="px-6 py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center gap-2 cursor-pointer hover:shadow-md active:scale-95"
              >
                <span>GO TO IMPORT</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==============================================================================
  // DESKTOP INWARD WORKSTATION (FLUID FULL-WIDTH & CLEAN LIGHT THEME)
  // ==============================================================================
  return (
    <div
      ref={stationContainerRef}
      className={`font-sans relative w-full transition-colors duration-200 ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[#F5F7FA] text-[#172033] overflow-y-auto p-4 sm:p-6 w-full'
          : 'space-y-5 w-full pb-12'
      }`}
    >
      <ScannerTopToast toast={topToast} onDismiss={() => setTopToast(null)} duration={1800} />

      {/* Embedded High-Performance Wave Animation Keyframes */}
      <style>{`
        @keyframes sonar-wave-ring1 {
          0% { transform: scale(0.65); opacity: 0.95; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes sonar-wave-ring2 {
          0% { transform: scale(0.65); opacity: 0.8; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        @keyframes sonar-wave-ring3 {
          0% { transform: scale(0.65); opacity: 0.6; }
          100% { transform: scale(4.2); opacity: 0; }
        }
        @keyframes laser-sweep-vertical {
          0% { top: 6%; opacity: 0.3; }
          50% { top: 90%; opacity: 1; }
          100% { top: 6%; opacity: 0.3; }
        }
        @keyframes soundwave-frequency {
          0%, 100% { transform: scaleY(0.2); opacity: 0.4; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        @keyframes liquid-ocean-stream {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .anim-sonar-1 {
          animation: sonar-wave-ring1 3s cubic-bezier(0.15, 0.85, 0.35, 1) infinite;
        }
        .anim-sonar-2 {
          animation: sonar-wave-ring2 3s cubic-bezier(0.15, 0.85, 0.35, 1) infinite 1s;
        }
        .anim-sonar-3 {
          animation: sonar-wave-ring3 3s cubic-bezier(0.15, 0.85, 0.35, 1) infinite 2s;
        }
        .anim-laser {
          animation: laser-sweep-vertical 2.4s ease-in-out infinite;
        }
        .anim-liquid-flow {
          background-size: 250% 250%;
          animation: liquid-ocean-stream 4s ease infinite;
        }
        .anim-sw-1 { animation: soundwave-frequency 1.1s ease-in-out infinite 0.1s; transform-origin: bottom; }
        .anim-sw-2 { animation: soundwave-frequency 1.3s ease-in-out infinite 0.35s; transform-origin: bottom; }
        .anim-sw-3 { animation: soundwave-frequency 0.9s ease-in-out infinite 0.6s; transform-origin: bottom; }
        .anim-sw-4 { animation: soundwave-frequency 1.4s ease-in-out infinite 0.2s; transform-origin: bottom; }
        .anim-sw-5 { animation: soundwave-frequency 1.2s ease-in-out infinite 0.45s; transform-origin: bottom; }
        .anim-sw-6 { animation: soundwave-frequency 1.0s ease-in-out infinite 0.7s; transform-origin: bottom; }
      `}</style>

      {/* 1. TOP HARDWARE CONTROL & STATUS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-[#CBD5E1] bg-white text-[#172033] shadow-xs transition-all duration-200">
        {/* Left: Gun Status & Mode Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-2 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 shadow-2xs">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span className="text-xs font-black uppercase tracking-wider">
              USB GUN SCANNER: ACTIVE (ZERO-CLICK)
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Calendar className="h-4 w-4 text-[#1565D8]" />
            <span>{todayStr}</span>
            {universityName && (
              <>
                <span className="text-slate-300">•</span>
                <Building className="h-4 w-4 text-[#1565D8]" />
                <span className="font-bold text-[#172033]">{universityName}</span>
              </>
            )}
          </div>
        </div>

        {/* Right: Controls (Sound, Fullscreen, Export) */}
        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer hover:shadow-2xs active:scale-95 ${
              soundEnabled
                ? 'bg-blue-50 border-blue-200 text-[#1565D8]'
                : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
            title={soundEnabled ? 'Mute Beeps' : 'Enable Beeps'}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sound ON' : 'Muted'}</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-300 text-xs font-bold transition-all duration-200 flex items-center gap-1.5 cursor-pointer hover:shadow-2xs active:scale-95"
            title="Toggle Kiosk Fullscreen Mode"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Station'}</span>
          </button>

          {/* Export Excel (if authorized or available) */}
          {!isRestrictedInward && (
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-xs hover:shadow-md active:scale-95"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export Report</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. MAIN DUAL-PANE OPERATIONAL WORKSPACE (FLUID FULL WIDTH) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 w-full">
        {/* ========================================================================= */}
        {/* LEFT PANEL: BUNDLE SELECTOR & PROGRESS (4 COLUMNS) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 space-y-5">
          {/* Active Bundle Overview Card */}
          <div className="p-6 sm:p-7 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs transition-all duration-200 hover:shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                ACTIVE INWARD BUNDLE
              </span>
              <span className={`px-2.5 py-1 text-[11px] font-black uppercase rounded-lg border transition-colors ${
                activeBundle?.status === 'COMPLETED'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  : activeBundle?.status === 'IN PROGRESS'
                  ? 'bg-blue-100 text-blue-800 border-blue-300'
                  : 'bg-slate-100 text-slate-700 border-slate-300'
              }`}>
                {activeBundle?.status || 'SELECT BUNDLE'}
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-2.5">
              <div>
                <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-[#1565D8]">
                  Class {selectedClassId || '—'}
                </span>
                <div className="text-xs text-slate-500 font-semibold mt-1">
                  Target: {activeExpected} Booklets
                </div>
              </div>
              <div className="text-right">
                <span className="text-3xl sm:text-4xl font-black font-tabular text-[#16A34A]">
                  {activeReceived} / {activeExpected}
                </span>
                <div className="text-xs font-bold text-slate-400 mt-0.5">
                  {activeProgress}% Inwarded
                </div>
              </div>
            </div>

            {/* Progress Bar with smooth liquid wave animation */}
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200 mb-4 relative p-0.5 shadow-inner">
              <div
                className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 via-blue-500 to-emerald-500 rounded-full anim-liquid-flow transition-all duration-500 ease-out shadow-xs"
                style={{ width: `${Math.max(activeProgress > 0 ? 5 : 0, activeProgress)}%` }}
              />
            </div>

            {/* Bundle Stat Counters */}
            <div className="grid grid-cols-3 gap-2.5 text-center pt-3 border-t border-slate-100">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500 uppercase">SAVED</div>
                <div className="text-xl font-black text-[#1565D8] font-tabular">{activeSaved}</div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-bold text-amber-600 uppercase">PENDING</div>
                <div className="text-xl font-black text-amber-600 font-tabular">{activePending}</div>
              </div>
              <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                <div className="text-[10px] font-bold text-red-600 uppercase">MISSING</div>
                <div className="text-xl font-black text-red-600 font-tabular">{activeMissing}</div>
              </div>
            </div>

            {/* Save Bundle Action Button */}
            <div className="mt-5 pt-3.5 border-t border-slate-100">
              {saveSuccessMessage && (
                <div className="mb-2 p-2.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{saveSuccessMessage}</span>
                </div>
              )}
              <button
                type="button"
                disabled={activePending === 0 || isSaving}
                onClick={handleSaveActiveBundle}
                className={`w-full py-3 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 shadow-xs cursor-pointer ${
                  activePending > 0
                    ? 'bg-[#1565D8] hover:bg-[#0D47A1] text-white hover:shadow-md active:scale-98'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Save className="h-4 w-4" />
                <span>
                  {isSaving ? 'SAVING BUNDLE...' : `SAVE BUNDLE (${activePending} PENDING)`}
                </span>
              </button>
            </div>
          </div>

          {/* Class Bundle List / Switcher */}
          <div className="p-6 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs transition-all duration-200 hover:shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                SELECT EXAM BUNDLE
              </span>
              <span className="text-xs font-bold text-slate-400">
                {bundles.length} Classes
              </span>
            </div>

            {/* Search filter */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={classSearch}
                onChange={e => setClassSearch(e.target.value)}
                placeholder="Search Class ID..."
                data-ignore-gun-scanner="true"
                className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1565D8] text-[#172033]"
              />
            </div>

            {/* Scrollable bundle list (Generous height to eliminate vertical gaps) */}
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {filteredBundles.map(b => {
                const isSelected = b.classId.toLowerCase() === selectedClassId.toLowerCase();
                return (
                  <button
                    key={b.classId}
                    type="button"
                    onClick={() => setSelectedClassId(b.classId)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all duration-150 flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/90 border-[#1565D8] shadow-xs ring-2 ring-[#1565D8]/20'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-mono font-bold text-sm text-[#172033]">
                        Class {b.classId}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {b.receivedCount} of {b.expectedCount} inwarded
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold font-mono ${
                        b.isCompleted ? 'text-emerald-600' : 'text-blue-600'
                      }`}>
                        {b.progressPercentage}%
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANEL: LIVE GUN TARGET ZONE & INWARD STREAM (8 COLUMNS) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-8 space-y-5">
          {/* A. DEDICATED GUN SCANNER HUD ZONE */}
          <div className={`p-8 sm:p-10 min-h-[400px] flex flex-col justify-center rounded-2xl border shadow-xs relative overflow-hidden transition-all duration-300 ${
            hudFlash?.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500 ring-4 ring-emerald-500/20'
              : hudFlash?.type === 'duplicate'
              ? 'bg-red-600 text-white border-red-500 ring-4 ring-red-500/20'
              : hudFlash?.type === 'wrong_class'
              ? 'bg-amber-600 text-white border-amber-500 ring-4 ring-amber-500/20'
              : hudFlash?.type === 'not_found'
              ? 'bg-rose-700 text-white border-rose-500 ring-4 ring-rose-500/20'
              : 'bg-white border-[#CBD5E1] text-[#172033]'
          }`}>
            {/* If HUD Flash is Active -> Full Banner Alert Display with Shockwave Ripple */}
            {hudFlash ? (
              <div className="py-8 px-4 text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
                {/* Expanding Shockwave Waves */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-36 h-36 rounded-full border-4 border-white/50 animate-ping opacity-75" />
                  <div className="w-64 h-64 rounded-full border-2 border-white/30 animate-ping opacity-40 [animation-delay:200ms]" />
                </div>

                <div className="relative z-10 flex items-center justify-center mb-4">
                  {hudFlash.type === 'success' && (
                    <div className="h-20 w-20 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center shadow-xl animate-bounce">
                      <CheckCircle2 className="h-12 w-12 text-white stroke-[2.5]" />
                    </div>
                  )}
                  {hudFlash.type === 'duplicate' && (
                    <div className="h-20 w-20 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center shadow-xl">
                      <AlertTriangle className="h-12 w-12 text-white stroke-[2.5]" />
                    </div>
                  )}
                  {hudFlash.type === 'wrong_class' && (
                    <div className="h-20 w-20 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center shadow-xl">
                      <AlertOctagon className="h-12 w-12 text-white stroke-[2.5]" />
                    </div>
                  )}
                  {hudFlash.type === 'not_found' && (
                    <div className="h-20 w-20 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center shadow-xl">
                      <AlertOctagon className="h-12 w-12 text-white stroke-[2.5]" />
                    </div>
                  )}
                </div>

                <h2 className="relative z-10 text-3xl sm:text-4xl font-black uppercase tracking-wider text-white drop-shadow-xs">
                  {hudFlash.title}
                </h2>
                <p className="relative z-10 text-base sm:text-lg font-bold text-white/95 mt-2 max-w-xl mx-auto">
                  {hudFlash.subtitle}
                </p>
                <div className="relative z-10 mt-4 font-mono text-base bg-black/30 px-5 py-2 rounded-full inline-block text-white border border-white/25 shadow-sm">
                  Barcode: <strong>{hudFlash.barcode}</strong>
                </div>
              </div>
            ) : (
              /* Idle / Listening Gun Station UI with Sonar Waves & Dynamic Laser Sweep */
              <div className="py-8 text-center relative overflow-hidden">
                {/* 1. Concentric Sonar Wave Ripples radiating from center */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full border-2 border-cyan-400/50 bg-cyan-400/10 anim-sonar-1" />
                  <div className="w-48 h-48 sm:w-60 sm:h-60 rounded-full border-2 border-blue-500/40 bg-blue-500/5 anim-sonar-2" />
                  <div className="w-64 h-64 sm:w-80 sm:h-80 rounded-full border-2 border-indigo-500/30 bg-indigo-500/5 anim-sonar-3" />
                </div>

                {/* 2. Central Scanner Target Frame with Gliding Laser Sweep Wave */}
                <div className="relative z-10 flex items-center justify-center mb-4">
                  <div className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-2xl bg-gradient-to-b from-blue-50 via-white to-blue-50/80 border-2 border-[#1565D8] flex items-center justify-center text-[#1565D8] shadow-lg overflow-hidden">
                    {/* Glowing Laser Sweep Wave Line */}
                    <div className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#06b6d4,0_0_30px_#06b6d4] anim-laser pointer-events-none" />
                    
                    {/* Barcode Scanner Icon */}
                    <Scan className="h-12 w-12 stroke-[2.2] animate-pulse relative z-10" />
                    
                    {/* Corner Reticle Markers */}
                    <span className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-[#1565D8]" />
                    <span className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#1565D8]" />
                    <span className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[#1565D8]" />
                    <span className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-[#1565D8]" />
                  </div>
                </div>

                {/* 3. Hardware Gun Status Badge with Live Radar Pulse */}
                <div className="relative z-10 inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-full text-xs font-black uppercase tracking-wider mb-3 shadow-2xs">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                  <span>HARDWARE GUN SENSORS: ARMED &amp; LISTENING</span>
                </div>

                {/* 4. Dynamic Soundwave Frequency Visualizer Bars */}
                <div className="relative z-10 flex items-center justify-center gap-1.5 my-3 h-8" title="Real-time acoustic sensor waveform">
                  <div className="w-1.5 h-6 rounded-full bg-cyan-400 anim-sw-1" />
                  <div className="w-1.5 h-7 rounded-full bg-blue-500 anim-sw-2" />
                  <div className="w-1.5 h-8 rounded-full bg-indigo-500 anim-sw-3" />
                  <div className="w-1.5 h-7 rounded-full bg-emerald-500 anim-sw-4" />
                  <div className="w-1.5 h-8 rounded-full bg-cyan-500 anim-sw-5" />
                  <div className="w-1.5 h-7 rounded-full bg-blue-600 anim-sw-6" />
                  <div className="w-2 h-2 rounded-full bg-blue-400 mx-1.5 opacity-80" />
                  <div className="w-1.5 h-7 rounded-full bg-blue-600 anim-sw-6" />
                  <div className="w-1.5 h-8 rounded-full bg-cyan-500 anim-sw-5" />
                  <div className="w-1.5 h-7 rounded-full bg-emerald-500 anim-sw-4" />
                  <div className="w-1.5 h-8 rounded-full bg-indigo-500 anim-sw-3" />
                  <div className="w-1.5 h-7 rounded-full bg-blue-500 anim-sw-2" />
                  <div className="w-1.5 h-6 rounded-full bg-cyan-400 anim-sw-1" />
                </div>

                <h3 className="relative z-10 text-2xl font-black text-[#172033] tracking-tight">
                  Point USB Barcode Gun &amp; Trigger Beep
                </h3>
                <p className="relative z-10 text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Zero-click active. Point your handheld scanner gun at the answer booklet barcode and press trigger. Instant inwarding in &lt;0.1s.
                </p>

                {/* Manual Barcode Fallback Input (for damaged / smudged barcodes) */}
                <div className="relative z-10 mt-6 max-w-lg mx-auto">
                  <form onSubmit={handleManualFormSubmit} className="flex items-center gap-2">
                    <input
                      ref={manualInputRef}
                      type="text"
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      placeholder="Manual entry: type/paste barcode and press Enter..."
                      className="flex-1 px-4 py-3 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl font-mono text-[#172033] focus:outline-hidden focus:ring-2 focus:ring-[#1565D8] shadow-2xs"
                    />
                    <button
                      type="submit"
                      disabled={!manualInput.trim()}
                      className="px-5 py-3 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer shadow-xs active:scale-95"
                    >
                      Inward
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* B. RECENT INWARD SCAN FEED (LIVE STREAM) */}
          <div className="p-6 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs transition-all duration-200 hover:shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#1565D8]" />
                <span className="text-xs font-black uppercase tracking-wider text-[#172033]">
                  Live Inward Stream
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-600">
                  {recentScans.length} Scans this session
                </span>
              </div>
              {recentScans.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRecentScans([])}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                >
                  Clear Stream
                </button>
              )}
            </div>

            {recentScans.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs font-medium border border-dashed border-slate-200 rounded-xl">
                Ready to inward. Trigger your barcode gun on any booklet to see it appear in real-time.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {recentScans.map(item => (
                  <div
                    key={item.id}
                    className={`p-2.5 rounded-xl border text-xs flex items-center justify-between transition-all duration-150 animate-in fade-in slide-in-from-top-1 ${
                      item.status === 'success'
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                        : item.status === 'duplicate'
                        ? 'bg-red-50/70 border-red-200 text-red-950'
                        : item.status === 'wrong_class'
                        ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                        : 'bg-rose-50/70 border-rose-200 text-rose-950'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      {item.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
                      {item.status === 'duplicate' && <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />}
                      {item.status === 'wrong_class' && <AlertOctagon className="h-4 w-4 text-amber-600 shrink-0" />}
                      {item.status === 'not_found' && <AlertOctagon className="h-4 w-4 text-rose-600 shrink-0" />}

                      <div>
                        <div className="font-mono font-bold text-xs text-[#172033]">
                          {item.memberId}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Class: {item.classId} • {item.message}
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono text-[10px] text-slate-400">
                      {item.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* C. ACTIVE BUNDLE RECONCILIATION TABLE */}
          <div className="p-6 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs transition-all duration-200 hover:shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#1565D8]" />
                <span className="text-xs font-black uppercase tracking-wider text-[#172033]">
                  Class {selectedClassId} Verification List ({records.length} expected)
                </span>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveRecordsTab('scanned')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                    activeRecordsTab === 'scanned'
                      ? 'bg-white text-[#1565D8] shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Inwarded ({activeReceived})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRecordsTab('not_scanned')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                    activeRecordsTab === 'not_scanned'
                      ? 'bg-white text-red-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Pending ({activeMissing})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveRecordsTab('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                    activeRecordsTab === 'all'
                      ? 'bg-white text-[#172033] shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  All ({records.length})
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-[300px] border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Member ID</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        No records in this tab.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r, idx) => (
                      <tr key={r.id || idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-[#172033]">
                          {r.member_id}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-500">
                          {r.barcode || '—'}
                        </td>
                        <td className="py-2 px-3">
                          {r.scan_status === 'saved' && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold uppercase rounded-md">
                              SAVED
                            </span>
                          )}
                          {r.scan_status === 'pending_save' && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold uppercase rounded-md animate-pulse">
                              PENDING SAVE
                            </span>
                          )}
                          {r.scan_status === 'not_started' && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold uppercase rounded-md">
                              NOT INWARDED
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-500 text-[11px]">
                          {r.scanned_by || r.saved_by || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
