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

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { useAuth } from '../../context/AuthContext';
import { normalizeIdentifier } from '../../utils/normalize';

export interface DesktopInwardStationProps {
  onNavigateToImport?: () => void;
  onNavigateToSessions?: () => void;
  isRestrictedInward?: boolean;
}

export const DesktopInwardStation: React.FC<DesktopInwardStationProps> = ({
  onNavigateToImport,
  isRestrictedInward = false,
}) => {
  const { user } = useAuth();
  const currentOperator = user?.username || user?.full_name || user?.email?.split('@')[0] || 'Operator';

  const [bundles, setBundles] = useState<ClassBundle[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('examscan_desktop_selected_class_id');
      if (saved) return normalizeIdentifier(saved);
    }
    return '';
  });
  const [stationStage, setStationStage] = useState<'STAGE_1_CLASS' | 'STAGE_2_BOOKLETS'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('examscan_desktop_selected_class_id');
      if (saved) return 'STAGE_2_BOOKLETS';
    }
    return 'STAGE_1_CLASS';
  });
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [hasImportedData, setHasImportedData] = useState<boolean>(false);
  const [classSearch, setClassSearch] = useState<string>('');

  // Active records for selected bundle
  const [records, setRecords] = useState<BundleRecordView[]>([]);
  const [allCampRecords, setAllCampRecords] = useState<any[]>([]);
  const [activeRecordsTab, setActiveRecordsTab] = useState<'scanned' | 'not_scanned' | 'all' | 'all_camp'>('scanned');

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
    const allSaved = importedService.getSavedScannedRecords();
    setBundles(bList);
    setSessionSummary(sum);
    setAllCampRecords(allSaved);

    // If active class is selected, verify it still exists
    if (selectedClassId && bList.length > 0) {
      const exists = bList.some(b => b.classId.toLowerCase() === selectedClassId.toLowerCase());
      if (!exists) {
        setSelectedClassId('');
        setStationStage('STAGE_1_CLASS');
        try { localStorage.removeItem('examscan_desktop_selected_class_id'); } catch {}
      }
    }
  }, [selectedClassId]);

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

  // Open a specific class bundle (Switches to STAGE 2)
  const openClassBundle = useCallback((classId: string) => {
    const clean = normalizeIdentifier(classId);
    if (!clean) return;
    setSelectedClassId(clean);
    setStationStage('STAGE_2_BOOKLETS');
    try {
      localStorage.setItem('examscan_desktop_selected_class_id', clean);
    } catch {}
    setManualInput('');
  }, []);

  // Back to Stage 1 (Class scanner / bundle list)
  const backToStage1 = useCallback(() => {
    setSelectedClassId('');
    setStationStage('STAGE_1_CLASS');
    try {
      localStorage.removeItem('examscan_desktop_selected_class_id');
    } catch {}
    setManualInput('');
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

    console.log(`[DESKTOP GUN STATION] Stage: ${stationStage} | Processing ${source} scan: ${barcode}`);

    try {
      // =========================================================================
      // STAGE 1: CLASS ID SCANNING (OR SWITCHING)
      // =========================================================================
      if (stationStage === 'STAGE_1_CLASS' || !selectedClassId) {
        // 1. Resolve Class ID from scanned barcode using authoritative imported dataset
        const classRes = await importedService.resolveClassFromBarcode(barcode);
        if (classRes.exists && classRes.classId) {
          openClassBundle(classRes.classId);
          if (soundEnabled) playScanSuccessSound();
          triggerHudFlash({
            type: 'success',
            title: '✓ CLASS BUNDLE OPENED',
            subtitle: `Class ID: ${classRes.classId}`,
            barcode,
            classId: classRes.classId,
            timestamp: Date.now(),
          }, 2200);
          return;
        }

        // 2. Fallback: Check if manual entered Class ID matches any imported class
        const valRes = await importedService.validateClassId(barcode);
        if (valRes.exists && valRes.classId) {
          openClassBundle(valRes.classId);
          if (soundEnabled) playScanSuccessSound();
          triggerHudFlash({
            type: 'success',
            title: '✓ CLASS BUNDLE OPENED',
            subtitle: `Class ID: ${valRes.classId} (${valRes.count} booklets expected)`,
            barcode,
            classId: valRes.classId,
            timestamp: Date.now(),
          }, 2200);
          return;
        }

        // 3. Class does not exist in imported data
        if (soundEnabled) playScanWarningSound();
        triggerHudFlash({
          type: 'not_found',
          title: 'CLASS NOT IMPORTED',
          subtitle: `Barcode "${barcode}" does not match any imported Class ID. SCAN AGAIN.`,
          barcode,
          timestamp: Date.now(),
        }, 2800);
        return;
      }

      // =========================================================================
      // STAGE 2: MEMBER BOOKLET SCANNING FOR ACTIVE CLASS
      // =========================================================================
      const targetClassId = selectedClassId;

      // Check if scanned barcode is actually a different Class ID (e.g. operator switches to another class)
      const cleanBar = normalizeIdentifier(barcode).toLowerCase();
      const directClass = bundles.find(b => normalizeIdentifier(b.classId).toLowerCase() === cleanBar);
      if (directClass && directClass.classId.toLowerCase() !== targetClassId.toLowerCase()) {
        openClassBundle(directClass.classId);
        if (soundEnabled) playScanSuccessSound();
        triggerHudFlash({
          type: 'success',
          title: '✓ SWITCHED CLASS BUNDLE',
          subtitle: `Now inwarding Class ${directClass.classId} (${directClass.expectedCount} booklets expected)`,
          barcode,
          classId: directClass.classId,
          timestamp: Date.now(),
        }, 2200);
        return;
      }

      const lookup = await importedService.lookupImportedRecord(barcode, targetClassId);
      if (lookup?.isClassOnly && lookup.classId && lookup.classId.toLowerCase() !== targetClassId.toLowerCase()) {
        openClassBundle(lookup.classId);
        if (soundEnabled) playScanSuccessSound();
        triggerHudFlash({
          type: 'success',
          title: '✓ SWITCHED CLASS BUNDLE',
          subtitle: `Class ID: ${lookup.classId}`,
          barcode,
          classId: lookup.classId,
          timestamp: Date.now(),
        }, 2200);
        return;
      }

      // Real-Time Member Inwarding: EXACT SAME ENGINE AS MOBILE VIEW
      // Persists directly into Supabase saved_scanned_data
      // Deletes from Supabase yet_to_be_inward
      // Updates imported_inward_data scan_status = 'completed'
      const result: ScanResult = await importedService.processMobileMemberBarcodeScan(
        targetClassId,
        barcode,
        currentOperator
      );

      // Handle Case: Duplicate Inward
      if (result.isDuplicate) {
        if (soundEnabled) playScanWarningSound();
        triggerHudFlash({
          type: 'duplicate',
          title: 'ALREADY INWARDED',
          subtitle: `Booklet ${result.member_id || barcode} was already inwarded for Class ${targetClassId}.`,
          barcode,
          classId: targetClassId,
          memberId: result.member_id,
          timestamp: Date.now(),
        }, 3200);

        setRecentScans(prev => [
          {
            id: String(Date.now()),
            barcode,
            memberId: result.member_id || barcode,
            classId: targetClassId,
            timestamp: new Date(),
            status: 'duplicate',
            message: 'Duplicate inward (Already saved in backend)',
          },
          ...prev.slice(0, 19),
        ]);
        return;
      }

      // Handle Case: Class Mismatch
      if (result.isWrongClass) {
        if (soundEnabled) playScanWarningSound();
        triggerHudFlash({
          type: 'wrong_class',
          title: 'CLASS ID MISMATCH',
          subtitle: `Belongs to Class ${result.detectedClassId || 'UNKNOWN'}, not active Class ${targetClassId}!`,
          barcode,
          classId: targetClassId,
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

      // Handle Case: Member ID Not Found / Not Imported
      if (result.isUnknownMember || result.isNotImported) {
        if (soundEnabled) playScanWarningSound();
        triggerHudFlash({
          type: 'not_found',
          title: 'MEMBER ID NOT FOUND',
          subtitle: `Barcode "${barcode}" not in imported list for Class ${targetClassId}.`,
          barcode,
          classId: targetClassId,
          timestamp: Date.now(),
        }, 3500);

        setRecentScans(prev => [
          {
            id: String(Date.now()),
            barcode,
            memberId: barcode,
            classId: targetClassId,
            timestamp: new Date(),
            status: 'not_found',
            message: 'Member not found in imported dataset',
          },
          ...prev.slice(0, 19),
        ]);
        return;
      }

      // Handle Case: Valid Inward (Saved Real-time to Database)
      if (result.success && result.member_id) {
        if (soundEnabled) playScanSuccessSound();
        const activeBundle = importedService.getClassBundle(targetClassId);
        const currentScanned = (activeBundle?.savedCount || 0) + (activeBundle?.pendingCount || 0);
        const expected = activeBundle?.expectedCount || 0;

        triggerHudFlash({
          type: 'success',
          title: '✓ INWARD SUCCESS (SAVED)',
          subtitle: `Member: ${result.member_id} | Class: ${targetClassId} (${currentScanned} of ${expected})`,
          barcode,
          classId: targetClassId,
          memberId: result.member_id,
          timestamp: Date.now(),
        }, 2200);

        setRecentScans(prev => [
          {
            id: String(Date.now()),
            barcode,
            memberId: result.member_id!,
            classId: targetClassId,
            timestamp: new Date(),
            status: 'success',
            message: 'Inwarded & Persisted to Supabase',
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
  }, [hasImportedData, stationStage, selectedClassId, soundEnabled, triggerHudFlash, showToast, loadData, openClassBundle, bundles, currentOperator]);

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

  // Filtered records inside active bundle or camp-wide
  const displayRecords = useMemo(() => {
    if (activeRecordsTab === 'all_camp') {
      return allCampRecords.map((s, idx) => ({
        id: s.id || `camp_${idx}`,
        class_id: s.class_id,
        member_id: s.member_id,
        barcode: s.barcode || '—',
        scan_status: 'saved' as const,
        scanned_by: s.scanned_by || s.saved_by || 'Operator',
        scanned_at: s.scanned_at || s.saved_at,
        saved_by: s.saved_by,
        saved_at: s.saved_at,
      }));
    }
    return records.filter(r => {
      if (activeRecordsTab === 'scanned') {
        return r.scan_status === 'saved' || r.scan_status === 'pending_save';
      }
      if (activeRecordsTab === 'not_scanned') {
        return r.scan_status === 'not_started';
      }
      return true;
    });
  }, [activeRecordsTab, records, allCampRecords]);

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

      {/* ========================================================================= */}
      {/* 2. DYNAMIC WORKSPACE: STAGE 1 (CLASS SELECTION) VS STAGE 2 (MEMBER SCAN) */}
      {/* ========================================================================= */}
      {stationStage === 'STAGE_1_CLASS' || !selectedClassId ? (
        /* ======================================================================= */
        /* STAGE 1 VIEW: SCAN CLASS ID OR SELECT FROM IMPORTED BUNDLES            */
        /* ======================================================================= */
        <div className="space-y-5 w-full">
          {/* Stage 1 Top Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4.5 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white rounded-2xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/15 rounded-xl border border-white/25">
                <Layers className="h-6 w-6 text-white" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-blue-200">
                  STAGE 1 • CLASS ID DETECTION
                </div>
                <div className="text-lg sm:text-xl font-black tracking-tight">
                  Scan Class ID Barcode with Gun or Select Class Bundle Below
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-white/20 rounded-xl text-xs font-mono font-bold text-white border border-white/30">
                {bundles.length} Class IDs Imported
              </span>
            </div>
          </div>

          {/* Stage 1 Gun Scanner HUD & Manual Entry */}
          <div className="p-8 sm:p-10 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs text-center relative overflow-hidden">
            {/* HUD Flash if active */}
            {hudFlash ? (
              <div className="py-6 px-4 animate-in zoom-in-95 duration-200">
                <div className="relative z-10 flex items-center justify-center mb-3">
                  {hudFlash.type === 'success' ? (
                    <div className="h-16 w-16 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center shadow-lg animate-bounce">
                      <CheckCircle2 className="h-10 w-10 text-emerald-600 stroke-[2.5]" />
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-red-100 border-2 border-red-400 flex items-center justify-center shadow-lg">
                      <AlertTriangle className="h-10 w-10 text-red-600 stroke-[2.5]" />
                    </div>
                  )}
                </div>
                <h3 className="text-2xl font-black text-[#172033] uppercase">{hudFlash.title}</h3>
                <p className="text-sm font-semibold text-slate-600 mt-1">{hudFlash.subtitle}</p>
                <div className="mt-3 font-mono text-xs bg-slate-100 px-4 py-1.5 rounded-full inline-block text-slate-700 border border-slate-200">
                  Barcode: {hudFlash.barcode}
                </div>
              </div>
            ) : (
              <div className="py-6 relative">
                {/* Sonar waves */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-32 h-32 rounded-full border-2 border-cyan-400/50 bg-cyan-400/10 anim-sonar-1" />
                  <div className="w-48 h-48 rounded-full border-2 border-blue-500/40 bg-blue-500/5 anim-sonar-2" />
                </div>

                <div className="relative z-10 flex items-center justify-center mb-3">
                  <div className="relative h-20 w-20 rounded-2xl bg-blue-50 border-2 border-[#1565D8] flex items-center justify-center text-[#1565D8] shadow-md overflow-hidden">
                    <div className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#06b6d4] anim-laser pointer-events-none" />
                    <Scan className="h-10 w-10 stroke-[2.2] animate-pulse" />
                  </div>
                </div>

                <h3 className="relative z-10 text-xl sm:text-2xl font-black text-[#172033]">
                  Point USB Barcode Gun at Class ID Barcode
                </h3>
                <p className="relative z-10 text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Trigger gun on the Class barcode or enter Class ID manually below to open its bundle for inwarding.
                </p>

                {/* Manual Class ID input */}
                <div className="relative z-10 mt-5 max-w-md mx-auto">
                  <form onSubmit={handleManualFormSubmit} className="flex items-center gap-2">
                    <input
                      ref={manualInputRef}
                      type="text"
                      value={manualInput}
                      onChange={e => setManualInput(e.target.value)}
                      placeholder="Enter Class ID (e.g. 0020, 0021)..."
                      className="flex-1 px-4 py-3 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl font-mono text-[#172033] focus:outline-hidden focus:ring-2 focus:ring-[#1565D8]"
                    />
                    <button
                      type="submit"
                      disabled={!manualInput.trim()}
                      className="px-5 py-3 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer shadow-xs active:scale-95"
                    >
                      Open Class ID
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* Imported Class ID Bundles Grid (Interactive) */}
          <div className="p-6 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-black text-[#172033] uppercase tracking-wide flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[#1565D8]" />
                  <span>Imported Class ID Bundles ({bundles.length})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click any bundle card or scan its barcode to enter Stage 2 (Member Booklet Scanning).
                </p>
              </div>

              {/* Search input */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={classSearch}
                  onChange={e => setClassSearch(e.target.value)}
                  placeholder="Filter Class ID..."
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1565D8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredBundles.map(b => {
                let badgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
                if (b.status === 'COMPLETED') {
                  badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                } else if (b.status === 'IN PROGRESS') {
                  badgeClass = 'bg-blue-100 text-blue-800 border-blue-300';
                }

                return (
                  <div
                    key={b.classId}
                    onClick={() => openClassBundle(b.classId)}
                    className="p-4 rounded-xl border border-slate-200 hover:border-[#1565D8] hover:bg-blue-50/40 transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-base font-black font-mono text-[#172033] group-hover:text-[#1565D8]">
                        Class ID: {b.classId}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-black uppercase rounded-md border ${badgeClass}`}>
                        {b.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs py-2 bg-slate-50 rounded-lg border border-slate-100 mb-2.5 font-tabular">
                      <div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase">Expected</div>
                        <div className="font-bold text-[#172033]">{b.expectedCount}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-emerald-600 font-bold uppercase">Inwarded</div>
                        <div className="font-bold text-emerald-700">{b.receivedCount}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-red-600 font-bold uppercase">Pending</div>
                        <div className="font-bold text-red-700">{b.missingCount}</div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200 mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full"
                        style={{ width: `${b.progressPercentage}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>{b.progressPercentage}% Completed</span>
                      <span className="text-[#1565D8] font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        Open Bundle →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* ======================================================================= */
        /* STAGE 2 VIEW: ACTIVE MEMBER BOOKLET SCANNING FOR SELECTED CLASS        */
        /* ======================================================================= */
        <div className="space-y-5 w-full">
          {/* Stage 2 Top Navigation Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4.5 bg-gradient-to-r from-emerald-700 via-teal-600 to-blue-700 text-white rounded-2xl shadow-sm">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={backToStage1}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/30 active:scale-95 shadow-xs"
              >
                <span>← Switch Class ID (Stage 1)</span>
              </button>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-200">
                  STAGE 2 • INWARDING MEMBER BOOKLETS
                </div>
                <div className="text-xl sm:text-2xl font-black tracking-tight font-mono">
                  Active Bundle: Class ID {selectedClassId}
                </div>
              </div>
            </div>

            <div className="text-right">
              <span className="text-2xl sm:text-3xl font-black font-tabular">{activeReceived} / {activeExpected}</span>
              <div className="text-xs font-bold text-emerald-100">{activeProgress}% Inwarded ({activeMissing} Pending)</div>
            </div>
          </div>

          {/* Dual-Pane Operational Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 w-full">
            {/* LEFT PANEL: ACTIVE BUNDLE OVERVIEW & QUICK SWITCHER (4 COLUMNS) */}
            <div className="lg:col-span-4 space-y-5">
              {/* Active Bundle Card */}
              <div className="p-6 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                    ACTIVE INWARD BUNDLE
                  </span>
                  <span className={`px-2.5 py-1 text-[11px] font-black uppercase rounded-lg border ${
                    activeBundle?.status === 'COMPLETED'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : activeBundle?.status === 'IN PROGRESS'
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-slate-100 text-slate-700 border-slate-300'
                  }`}>
                    {activeBundle?.status || 'IN PROGRESS'}
                  </span>
                </div>

                <div className="flex items-baseline justify-between mb-2.5">
                  <div>
                    <span className="text-3xl font-black font-mono tracking-tight text-[#1565D8]">
                      Class ID: {selectedClassId}
                    </span>
                    <div className="text-xs text-slate-500 font-semibold mt-1">
                      Target: {activeExpected} Booklets
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-black font-tabular text-[#16A34A]">
                      {activeReceived} / {activeExpected}
                    </span>
                    <div className="text-xs font-bold text-slate-400 mt-0.5">
                      {activeProgress}% Inwarded
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200 mb-4 relative p-0.5 shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-blue-600 via-cyan-400 to-emerald-500 rounded-full anim-liquid-flow transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(activeProgress > 0 ? 5 : 0, activeProgress)}%` }}
                  />
                </div>

                {/* Stat Counters */}
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

                {/* Save bundle button */}
                <div className="mt-5 pt-3.5 border-t border-slate-100">
                  {saveSuccessMessage && (
                    <div className="mb-2 p-2.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-2">
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
                        ? 'bg-[#1565D8] hover:bg-[#0D47A1] text-white'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Save className="h-4 w-4" />
                    <span>{isSaving ? 'SAVING...' : `SAVE BUNDLE (${activePending} PENDING)`}</span>
                  </button>
                </div>
              </div>

              {/* Quick Class ID Switcher */}
              <div className="p-6 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                    SWITCH CLASS ID BUNDLE
                  </span>
                  <span className="text-xs font-bold text-slate-400">{bundles.length} Class IDs</span>
                </div>

                <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                  {bundles.map(b => {
                    const isSelected = b.classId.toLowerCase() === selectedClassId.toLowerCase();
                    return (
                      <button
                        key={b.classId}
                        type="button"
                        onClick={() => openClassBundle(b.classId)}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 border-[#1565D8] ring-2 ring-[#1565D8]/20'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div>
                          <div className="font-mono font-bold text-xs text-[#172033]">
                            Class ID: {b.classId}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {b.receivedCount} of {b.expectedCount} inwarded
                          </div>
                        </div>
                        <span className="text-xs font-bold font-mono text-[#1565D8]">
                          {b.progressPercentage}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT PANEL: GUN SCANNER HUD ZONE & VERIFICATION TABLE (8 COLUMNS) */}
            <div className="lg:col-span-8 space-y-5">
              {/* Gun HUD Zone */}
              <div className={`p-8 sm:p-10 min-h-[340px] flex flex-col justify-center rounded-2xl border shadow-xs relative overflow-hidden transition-all duration-300 ${
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
                {hudFlash ? (
                  <div className="py-6 px-4 text-center animate-in zoom-in-95 duration-200 relative overflow-hidden">
                    <div className="relative z-10 flex items-center justify-center mb-3">
                      {hudFlash.type === 'success' && (
                        <div className="h-16 w-16 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center shadow-xl animate-bounce">
                          <CheckCircle2 className="h-10 w-10 text-white stroke-[2.5]" />
                        </div>
                      )}
                      {hudFlash.type === 'duplicate' && (
                        <div className="h-16 w-16 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center shadow-xl">
                          <AlertTriangle className="h-10 w-10 text-white stroke-[2.5]" />
                        </div>
                      )}
                      {hudFlash.type === 'wrong_class' && (
                        <div className="h-16 w-16 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center shadow-xl">
                          <AlertOctagon className="h-10 w-10 text-white stroke-[2.5]" />
                        </div>
                      )}
                      {hudFlash.type === 'not_found' && (
                        <div className="h-16 w-16 rounded-full bg-white/25 border-2 border-white/50 flex items-center justify-center shadow-xl">
                          <AlertOctagon className="h-10 w-10 text-white stroke-[2.5]" />
                        </div>
                      )}
                    </div>

                    <h2 className="relative z-10 text-2xl sm:text-3xl font-black uppercase tracking-wider text-white">
                      {hudFlash.title}
                    </h2>
                    <p className="relative z-10 text-sm sm:text-base font-bold text-white/95 mt-1 max-w-xl mx-auto">
                      {hudFlash.subtitle}
                    </p>
                    <div className="relative z-10 mt-3 font-mono text-sm bg-black/30 px-4 py-1.5 rounded-full inline-block text-white border border-white/25">
                      Barcode: <strong>{hudFlash.barcode}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center relative overflow-hidden">
                    {/* Sonar waves */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-32 h-32 rounded-full border-2 border-cyan-400/50 bg-cyan-400/10 anim-sonar-1" />
                      <div className="w-48 h-48 rounded-full border-2 border-blue-500/40 bg-blue-500/5 anim-sonar-2" />
                    </div>

                    <div className="relative z-10 flex items-center justify-center mb-3">
                      <div className="relative h-20 w-20 rounded-2xl bg-gradient-to-b from-blue-50 to-white border-2 border-[#1565D8] flex items-center justify-center text-[#1565D8] shadow-md overflow-hidden">
                        <div className="absolute left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#06b6d4] anim-laser pointer-events-none" />
                        <Scan className="h-10 w-10 stroke-[2.2] animate-pulse" />
                      </div>
                    </div>

                    <div className="relative z-10 inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <span>INWARDING CLASS {selectedClassId} • GUN ARMED</span>
                    </div>

                    <h3 className="relative z-10 text-xl sm:text-2xl font-black text-[#172033]">
                      Trigger Barcode Gun on Answer Booklet
                    </h3>
                    <p className="relative z-10 text-xs text-slate-500 max-w-md mx-auto mt-0.5">
                      Point at the booklet barcode and pull trigger. Real-time inwarding in &lt;0.1s.
                    </p>

                    {/* Manual Fallback Input */}
                    <div className="relative z-10 mt-5 max-w-md mx-auto">
                      <form onSubmit={handleManualFormSubmit} className="flex items-center gap-2">
                        <input
                          ref={manualInputRef}
                          type="text"
                          value={manualInput}
                          onChange={e => setManualInput(e.target.value)}
                          placeholder="Manual entry: type/paste barcode and press Enter..."
                          className="flex-1 px-4 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-[#172033] focus:outline-hidden focus:ring-2 focus:ring-[#1565D8]"
                        />
                        <button
                          type="submit"
                          disabled={!manualInput.trim()}
                          className="px-4 py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 cursor-pointer shadow-xs active:scale-95"
                        >
                          Inward
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>

              {/* Live Inward Stream */}
              <div className="p-5 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-[#1565D8]" />
                    <span className="text-xs font-black uppercase tracking-wider text-[#172033]">
                      Live Inward Stream
                    </span>
                    <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-600">
                      {recentScans.length} scans this session
                    </span>
                  </div>
                  {recentScans.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRecentScans([])}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {recentScans.length === 0 ? (
                  <div className="text-center py-5 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    Ready to inward. Scan any booklet barcode to see instant updates.
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
                    {recentScans.map(item => (
                      <div
                        key={item.id}
                        className={`p-2 rounded-xl border text-xs flex items-center justify-between ${
                          item.status === 'success'
                            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                            : item.status === 'duplicate'
                            ? 'bg-red-50/70 border-red-200 text-red-950'
                            : item.status === 'wrong_class'
                            ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                            : 'bg-rose-50/70 border-rose-200 text-rose-950'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {item.status === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                          {item.status === 'duplicate' && <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                          {item.status === 'wrong_class' && <AlertOctagon className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                          {item.status === 'not_found' && <AlertOctagon className="h-3.5 w-3.5 text-rose-600 shrink-0" />}

                          <div>
                            <span className="font-mono font-bold text-xs text-[#172033] mr-2">
                              {item.memberId}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Class ID: {item.classId} • {item.message}
                            </span>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.timestamp.toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Class Verification & Inwarded Records Table (with All-Camp Tab) */}
              <div className="p-6 rounded-2xl border border-[#CBD5E1] bg-white shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-[#1565D8]" />
                    <span className="text-xs font-black uppercase tracking-wider text-[#172033]">
                      {activeRecordsTab === 'all_camp'
                        ? `All Camp Inwarded Scripts (${allCampRecords.length})`
                        : `Class ID ${selectedClassId} Verification List (${records.length} expected)`}
                    </span>
                  </div>

                  {/* Tabs */}
                  <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setActiveRecordsTab('scanned')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeRecordsTab === 'all'
                          ? 'bg-white text-[#172033] shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Class ID All ({records.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRecordsTab('all_camp')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeRecordsTab === 'all_camp'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      All Camp ({allCampRecords.length})
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto max-h-[320px] border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Member ID</th>
                        <th className="py-2.5 px-3">Barcode</th>
                        <th className="py-2.5 px-3">Class ID</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Operator</th>
                        <th className="py-2.5 px-3">Inwarded Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayRecords.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">
                            No records in this tab.
                          </td>
                        </tr>
                      ) : (
                        displayRecords.map((r: any, idx: number) => (
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
                            <td className="py-2 px-3 font-mono font-semibold text-slate-700">
                              {r.class_id}
                            </td>
                            <td className="py-2 px-3">
                              {r.scan_status === 'saved' && (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold uppercase rounded-md">
                                  ✓ SAVED
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
                            <td className="py-2 px-3 text-slate-600 text-[11px] font-medium">
                              {r.scanned_by || r.saved_by || '—'}
                            </td>
                            <td className="py-2 px-3 text-slate-400 text-[10px] font-mono">
                              {r.scanned_at ? new Date(r.scanned_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
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
      )}
    </div>
  );
};
