// ==============================================================================
// ExamScan — Scanning Dashboard / Scan Screen
// Implements:
// 1. Blocking State when NO IMPORTED DATA: Camera disabled, Scan button disabled,
//    shows "IMPORT DATA FIRST" & [GO TO IMPORT].
// 2. Continuous Camera Scanner when data exists.
// 3. First Valid Booklet Scan: Immediately validates Class ID & Member ID,
//    records scan as PENDING SAVE, moves Class to TOP, and REDIRECTS AUTOMATICALLY
//    to BUNDLE SCAN page (no "Open Bundle View" click needed).
// 4. Invalid Scans: CLASS NOT IMPORTED / CLASS ID MISMATCH / MEMBER ID NOT FOUND modals,
//    no progress increase, no session created.
// 5. Class Cards sorted with most recently scanned class at the TOP.
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Building,
  CheckCircle2,
  AlertTriangle,
  Download,
  ArrowRight,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  CameraOff,
  Upload,
  Layers,
  AlertOctagon,
  Check,
  FileSpreadsheet,
  LayoutGrid,
  List,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  SessionSummary,
  sanitizeBarcode,
  ScanResult,
} from '../../services/importedService';
import { playScanSuccessSound, playScanWarningSound } from '../../utils/scannerSound';
import { BundleStatisticsView } from '../bundles/BundleStatisticsView';
import {
  requestCameraStream,
  startContinuousDualScanning,
  decodeBarcodeFromImageFile,
  CameraStreamResult,
  BarcodeScanResult,
} from '../../utils/universalBarcodeScanner';

interface ScanningDashboardViewProps {
  onNavigateToImport?: () => void;
  onNavigateToSessions?: () => void;
}

export const ScanningDashboardView: React.FC<ScanningDashboardViewProps> = ({
  onNavigateToImport,
}) => {
  const [bundles, setBundles] = useState<ClassBundle[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [hasImportedData, setHasImportedData] = useState<boolean>(false);

  // Active Class Bundle (when set, immediately renders BUNDLE SCAN for that class)
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [bundleViewMode, setBundleViewMode] = useState<'grid' | 'list'>('grid');
  const [bundleSearch, setBundleSearch] = useState<string>('');

  // Export notifications & feedback
  const [exportNotification, setExportNotification] = useState<string | null>(null);
  const [scanSuccessToast, setScanSuccessToast] = useState<{
    classId: string;
    memberId: string;
  } | null>(null);

  // Modals
  const [unknownClassModal, setUnknownClassModal] = useState<{
    barcode: string;
    classId: string;
  } | null>(null);

  const [classMismatchModal, setClassMismatchModal] = useState<{
    barcode: string;
    currentClass: string;
    detectedClass: string;
  } | null>(null);

  const [unknownMemberModal, setUnknownMemberModal] = useState<{
    barcode: string;
    classId: string;
    memberId: string;
  } | null>(null);

  const [duplicateModal, setDuplicateModal] = useState<{
    barcode: string;
    memberId: string;
    classId: string;
  } | null>(null);

  // Camera States
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [manualInput, setManualInput] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraResultRef = useRef<CameraStreamResult | null>(null);
  const scannerControllerRef = useRef<{ stop: () => void } | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(() => {
    const hasData = importedService.hasImportedData();
    setHasImportedData(hasData);
    const bList = importedService.getClassBundles();
    const sum = importedService.getSessionSummary();
    setBundles(bList);
    setSessionSummary(sum);
  }, []);

  useEffect(() => {
    loadData();
    const unsub = importedService.subscribe(loadData);
    return () => unsub();
  }, [loadData]);

  // Today's formatted date
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Camera Lifecycle:
  // ONLY start camera if hasImportedData IS TRUE and NOT in bundle view! (Requirement 1 & 2)
  useEffect(() => {
    if (hasImportedData && !activeClassId) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [hasImportedData, activeClassId, selectedDeviceId]);

  const stopCamera = () => {
    try {
      if (scannerControllerRef.current) {
        scannerControllerRef.current.stop();
        scannerControllerRef.current = null;
      }
      if (cameraResultRef.current) {
        cameraResultRef.current.stop();
        cameraResultRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } catch (e) {
      console.warn('Stop camera error:', e);
    }
    setCameraActive(false);
    setCameraLoading(false);
    setTorchOn(false);
  };

  const startCamera = async () => {
    if (!hasImportedData) {
      setCameraActive(false);
      return;
    }

    setCameraLoading(true);
    setCameraError(null);

    try {
      stopCamera();

      const camResult = await requestCameraStream(selectedDeviceId || undefined);
      cameraResultRef.current = camResult;
      setHasTorch(camResult.hasTorch);
      if (camResult.devices.length > 0) {
        setAvailableDevices(camResult.devices);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = camResult.stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();

        const controller = startContinuousDualScanning(
          videoRef.current,
          (detected: BarcodeScanResult) => {
            if (detected.text) {
              handleBarcodeScan(detected.text);
            }
          },
          { throttleMs: 70 }
        );
        scannerControllerRef.current = controller;
      }

      setCameraActive(true);
      setCameraLoading(false);
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setCameraLoading(false);
      setCameraActive(false);
      setCameraError(err?.message || 'Camera is in standby. Enter barcodes manually below.');
    }
  };

  const resumeScanning = () => {
    setUnknownClassModal(null);
    setClassMismatchModal(null);
    setUnknownMemberModal(null);
    setDuplicateModal(null);
    isProcessingRef.current = false;
    lastScannedCodeRef.current = null;
    if (hasImportedData && !cameraActive) {
      startCamera();
    }
  };

  /**
   * Barcode Scan Handling on Main Scan Screen (Sections 3, 4, 5, 6, 7)
   */
  const handleBarcodeScan = async (rawCode: string) => {
    const code = sanitizeBarcode(rawCode);
    if (!code) return;

    if (!hasImportedData) return;

    // Debounce duplicate reads within 1.2s
    const now = Date.now();
    if (lastScannedCodeRef.current === code && now - lastScannedTimeRef.current < 1200) {
      return;
    }
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    lastScannedCodeRef.current = code;
    lastScannedTimeRef.current = now;

    try {
      const result: ScanResult = await importedService.processScanningDashboardScan(code);

      // Section 1: No imported data
      if (result.isNoImportedData) {
        playScanWarningSound();
        return;
      }

      // Section 5: CLASS NOT IMPORTED
      if (result.isUnknownClass) {
        playScanWarningSound();
        setUnknownClassModal({
          barcode: code,
          classId: result.detectedClassId || 'UNKNOWN',
        });
        return;
      }

      // Section 5: CLASS ID MISMATCH
      if (result.isWrongClass) {
        playScanWarningSound();
        setClassMismatchModal({
          barcode: code,
          currentClass: result.currentClassId || 'Not selected yet',
          detectedClass: result.detectedClassId || 'UNKNOWN',
        });
        return;
      }

      // Section 5: MEMBER ID NOT FOUND
      if (result.isUnknownMember) {
        playScanWarningSound();
        setUnknownMemberModal({
          barcode: code,
          classId: result.detectedClassId || result.class_id || 'UNKNOWN',
          memberId: result.detectedMemberId || 'UNKNOWN',
        });
        return;
      }

      // Section 5: DUPLICATE BOOKLET
      if (result.isDuplicate) {
        playScanWarningSound();
        setDuplicateModal({
          barcode: code,
          memberId: result.member_id || code,
          classId: result.class_id || 'UNKNOWN',
        });
        return;
      }

      // Section 3 & 4: VALID FIRST SCAN -> AUTOMATIC IMMEDIATE REDIRECT TO BUNDLE SCAN
      if (result.success && result.class_id) {
        playScanSuccessSound();
        setScanSuccessToast({
          classId: result.class_id,
          memberId: result.member_id || code,
        });

        // Move Class to top and update data
        loadData();

        // Stop main camera and immediately redirect to Bundle Scan for that class!
        stopCamera();
        setActiveClassId(result.class_id);
      } else {
        playScanWarningSound();
      }
    } catch (err) {
      console.warn('Scan process error:', err);
    } finally {
      isProcessingRef.current = false;
    }
  };

  const handleToggleTorch = async () => {
    if (!cameraResultRef.current || !hasTorch) return;
    const next = !torchOn;
    const ok = await cameraResultRef.current.toggleTorch(next);
    if (ok) setTorchOn(next);
  };

  const handleCycleCamera = () => {
    if (availableDevices.length <= 1) return;
    const currentIndex = availableDevices.findIndex(d => d.deviceId === selectedDeviceId);
    const nextIndex = (currentIndex + 1) % availableDevices.length;
    setSelectedDeviceId(availableDevices[nextIndex].deviceId);
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const decoded = await decodeBarcodeFromImageFile(file);
      if (decoded && decoded.text) {
        handleBarcodeScan(decoded.text);
      } else {
        alert('Could not decode a barcode from the selected image. Please try a clearer picture.');
      }
    } catch (err: any) {
      alert('Failed to read image file: ' + (err?.message || 'unknown error'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleBarcodeScan(manualInput.trim());
    setManualInput('');
  };

  const handleExportExcel = async () => {
    const uni = sessionSummary?.universityName || importedService.getActiveUniversity();
    try {
      const res = await importedService.exportUniversityExcel(uni);
      if (res.success) {
        setExportNotification(`Exported ${res.filename} successfully!`);
        setTimeout(() => setExportNotification(null), 4000);
      }
    } catch (e: any) {
      alert(e.message || 'Export error');
    }
  };

  // If operator is inside BUNDLE SCAN, render dedicated BUNDLE SCAN screen
  if (activeClassId) {
    return (
      <BundleStatisticsView
        classId={activeClassId}
        onBackToDashboard={() => {
          setActiveClassId(null);
          loadData();
        }}
        onSwitchClass={newCid => setActiveClassId(newCid)}
      />
    );
  }

  // Statistics
  const totalClasses = sessionSummary?.totalClasses || bundles.length;
  const totalExpected = sessionSummary?.totalExpected || 0;
  const totalScanned = sessionSummary?.totalSaved || 0;
  const totalNotScanned = Math.max(0, totalExpected - totalScanned);
  const universityName = sessionSummary?.universityName || importedService.getActiveUniversity();

  // ==============================================================================
  // SECTION 1 & 2: NO IMPORT DATA — BLOCKING STATE
  // ==============================================================================
  if (!hasImportedData || bundles.length === 0) {
    return (
      <div className="space-y-4 font-sans max-w-4xl mx-auto pb-24">
        {/* Header toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#172033]">
              <CalendarIcon className="h-4 w-4 text-[#1565D8]" />
              <span>{todayStr}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#64748B] font-medium border-l border-[#CBD5E1] pl-3">
              <Building className="h-4 w-4 text-[#64748B]" />
              <span className="font-bold text-[#172033]">{universityName}</span>
            </div>
          </div>
        </div>

        {/* Blocking Card: NO IMPORTED DATA / IMPORT DATA FIRST */}
        <div className="bg-white border-2 border-[#CBD5E1] rounded-2xl shadow-sm p-8 text-center max-w-2xl mx-auto mt-6">
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
            Please import your Excel data before starting booklet scanning.
            The camera scanner and barcode detection will be enabled once your Class ID and Member ID dataset is imported.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            {onNavigateToImport && (
              <button
                type="button"
                onClick={onNavigateToImport}
                className="w-full sm:w-auto px-6 py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>GO TO IMPORT</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-center gap-6 text-[11px] text-[#94A3B8]">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              <span>Camera = DISABLED</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              <span>Barcode Detection = DISABLED</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==============================================================================
  // ACTIVE SCAN SCREEN (When Excel Data is Imported)
  // ==============================================================================
  return (
    <div className="space-y-4 font-sans max-w-5xl mx-auto pb-24">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#172033]">
            <CalendarIcon className="h-4 w-4 text-[#1565D8]" />
            <span>{todayStr}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] font-medium border-l border-[#CBD5E1] pl-3">
            <Building className="h-4 w-4 text-[#64748B]" />
            <span className="font-bold text-[#172033]">{universityName}</span>
          </div>
        </div>

        {/* Global Toolbar Actions: Import Data & Export Excel */}
        <div className="flex items-center gap-2">
          {onNavigateToImport && (
            <button
              type="button"
              onClick={onNavigateToImport}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-xs cursor-pointer"
              title="Import Excel Data"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Import Data</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#16A34A] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#15803D] transition-colors shadow-xs cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Alerts / Toasts */}
      {exportNotification && (
        <div className="p-3 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold rounded-xl flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{exportNotification}</span>
        </div>
      )}

      {/* 2. Top Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
            TOTAL CLASSES
          </div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">
            {totalClasses}
          </div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Imported Sessions</div>
        </div>

        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
            EXPECTED BOOKLETS
          </div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">
            {totalExpected}
          </div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Booklets from Excel</div>
        </div>

        <div className="bg-white p-3.5 border border-[#BFDBFE] rounded-xl shadow-xs bg-[#F8FAFC]">
          <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">
            SCANNED
          </div>
          <div className="text-2xl font-black text-[#1565D8] font-tabular mt-1">
            {totalScanned}
          </div>
          <div className="text-[11px] text-[#1565D8] mt-0.5 font-medium">Permanently Saved</div>
        </div>

        <div className="bg-white p-3.5 border border-[#CBD5E1] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">
            NOT SCANNED
          </div>
          <div className="text-2xl font-black text-[#DC2626] font-tabular mt-1">
            {totalNotScanned}
          </div>
          <div className="text-[11px] text-[#DC2626] mt-0.5 font-medium">Pending to Inward</div>
        </div>
      </div>

      {/* 3. FULL-FRAME CAMERA SCANNER */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl shadow-xs overflow-hidden">
        {/* Full Viewport */}
        <div className="relative bg-black w-full aspect-4/3 min-h-[380px] sm:min-h-[460px] max-h-[58vh] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />

          {cameraLoading && (
            <div className="text-center text-white px-4">
              <div className="h-8 w-8 border-3 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-2" />
              <div className="text-xs font-bold uppercase tracking-wider">Initializing Camera...</div>
            </div>
          )}

          {!cameraActive && !cameraLoading && (
            <div className="text-center text-white/80 p-6">
              <CameraOff className="h-9 w-9 mx-auto mb-2 text-white/50" />
              <div className="text-xs font-bold text-white mb-1">Camera Feed Paused</div>
              <div className="text-[11px] text-white/70 max-w-sm mx-auto mb-3">
                {cameraError || 'Camera is in standby. Click below to start scanning or enter barcode manually.'}
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1] transition-colors cursor-pointer"
              >
                Start Camera
              </button>
            </div>
          )}
        </div>

        {/* Small Camera Controls BELOW the camera */}
        <div className="p-3 bg-white border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {hasTorch && (
              <button
                type="button"
                onClick={handleToggleTorch}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors flex items-center gap-1.5 ${
                  torchOn
                    ? 'bg-[#F59E0B] text-black border-[#D97706]'
                    : 'bg-slate-50 text-[#172033] border-[#CBD5E1] hover:bg-slate-100'
                }`}
                title="Toggle Torch/Flashlight"
              >
                {torchOn ? <Flashlight className="h-4 w-4" /> : <FlashlightOff className="h-4 w-4" />}
                <span>{torchOn ? 'Flash On' : 'Flash'}</span>
              </button>
            )}
            {availableDevices.length > 1 && (
              <button
                type="button"
                onClick={handleCycleCamera}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[#CBD5E1] bg-slate-50 text-[#172033] hover:bg-slate-100 transition-colors flex items-center gap-1.5"
                title="Switch Camera Lens"
              >
                <SwitchCamera className="h-4 w-4" />
                <span>Switch Camera</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {cameraActive ? (
              <button
                type="button"
                onClick={stopCamera}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[#CBD5E1] text-[#64748B] hover:text-[#172033] hover:bg-slate-50 transition-colors"
              >
                Pause Camera
              </button>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[#1565D8] text-white hover:bg-[#0D47A1] transition-colors"
              >
                Start Camera
              </button>
            )}
          </div>
        </div>

        {/* Clean Manual Input & Upload Bar directly under camera */}
        <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="Or enter barcode e.g. 003122MIS001..."
              className="flex-1 px-3 py-2 border border-[#CBD5E1] rounded-lg text-xs text-[#172033] bg-white focus:outline-hidden focus:border-[#1565D8] font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1] transition-colors shrink-0"
            >
              Scan
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1.5 shrink-0"
              title="Upload photo of barcode"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Photo</span>
            </button>
          </form>
        </div>
      </div>

      {/* 4. CLASS-WISE CARDS (Sorted with Scanned Class at TOP - Section 6) */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
        <div className="p-3.5 bg-[#F1F5F9] border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-[#172033] flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-[#1565D8]" />
              <span>CLASS-WISE BUNDLES</span>
              <span className="px-2 py-0.5 bg-blue-50 text-[#1565D8] border border-blue-200 rounded-full font-mono text-[10px]">
                {bundles.length} Classes
              </span>
            </h2>
            <div className="text-[11px] text-[#64748B]">
              Scanned classes automatically move to the top. Click any card to open Bundle Scan.
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Filter */}
            <div className="relative">
              <input
                type="text"
                value={bundleSearch}
                onChange={e => setBundleSearch(e.target.value)}
                placeholder="Filter Class ID..."
                className="pl-3 pr-2.5 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white focus:outline-none focus:border-[#1565D8] w-32 sm:w-40 text-[#172033]"
              />
            </div>

            {/* View Mode Toggle: Grid vs List */}
            <div className="flex items-center border border-[#CBD5E1] rounded-lg p-0.5 bg-white shrink-0">
              <button
                type="button"
                onClick={() => setBundleViewMode('grid')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  bundleViewMode === 'grid'
                    ? 'bg-[#1565D8] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
                title="Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setBundleViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  bundleViewMode === 'list'
                    ? 'bg-[#1565D8] text-white shadow-xs'
                    : 'text-[#64748B] hover:text-[#172033]'
                }`}
                title="List View"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
          </div>
        </div>

        {bundles.filter(b => !bundleSearch.trim() || b.classId.toLowerCase().includes(bundleSearch.trim().toLowerCase())).length === 0 ? (
          <div className="p-8 text-center text-xs text-[#64748B]">
            No class bundles found matching "{bundleSearch}".
          </div>
        ) : bundleViewMode === 'grid' ? (
          /* 1. GRID VIEW */
          <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {bundles
              .filter(b => !bundleSearch.trim() || b.classId.toLowerCase().includes(bundleSearch.trim().toLowerCase()))
              .map((b, idx) => {
                let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
                if (b.status === 'COMPLETED') {
                  badgeColor = 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]';
                } else if (b.status === 'IN PROGRESS') {
                  badgeColor = 'bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]';
                } else if (b.status === 'PARTIAL / SAVED') {
                  badgeColor = 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';
                }

                return (
                  <div
                    key={b.classId}
                    onClick={() => setActiveClassId(b.classId)}
                    className={`bg-white border-2 hover:border-[#1565D8] rounded-xl p-4 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group ${
                      idx === 0 && b.status === 'IN PROGRESS' ? 'border-[#1565D8] ring-1 ring-[#1565D8]/20' : 'border-[#CBD5E1]'
                    }`}
                  >
                    {/* Card Header: CLASS ID */}
                    <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                      <div className="font-mono font-black text-sm text-[#172033] group-hover:text-[#1565D8] transition-colors flex items-center gap-1.5">
                        <span>CLASS {b.classId}</span>
                        {idx === 0 && b.status === 'IN PROGRESS' && (
                          <span className="text-[9px] bg-[#1565D8] text-white px-1.5 py-0.5 rounded font-sans font-bold">
                            ACTIVE TOP
                          </span>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider rounded-md ${badgeColor}`}
                      >
                        {b.status}
                      </span>
                    </div>

                    {/* Card Counts */}
                    <div className="py-3 space-y-1.5 text-xs font-tabular">
                      <div className="flex items-center justify-between text-[#64748B]">
                        <span>Expected</span>
                        <span className="font-bold text-[#172033] text-sm">{b.expectedCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-[#1565D8]">
                        <span>Scanned</span>
                        <span className="font-bold text-sm">
                          {b.savedCount}
                          {b.pendingCount > 0 && (
                            <span className="text-[10px] text-[#F59E0B] font-normal ml-1">
                              (+{b.pendingCount} unsaved)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[#DC2626]">
                        <span>Not Scanned</span>
                        <span className="font-bold text-sm">{b.missingCount}</span>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="pt-2 border-t border-[#E2E8F0]">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-[#64748B] font-bold">Progress</span>
                        <span className="font-bold font-tabular text-[#16A34A]">
                          {b.progressPercentage}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                        <div
                          className="h-full bg-[#16A34A] rounded-full"
                          style={{ width: `${Math.min(100, b.progressPercentage)}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 pt-2 text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#1565D8] group-hover:underline inline-flex items-center gap-1">
                        Open Bundle Scan <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : (
          /* 2. LIST VIEW */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] uppercase tracking-wider text-[#64748B] font-bold">
                <tr>
                  <th className="py-2.5 px-4 w-12 text-center">#</th>
                  <th className="py-2.5 px-4">Class ID</th>
                  <th className="py-2.5 px-4 text-center">Status</th>
                  <th className="py-2.5 px-4 text-center">Expected</th>
                  <th className="py-2.5 px-4 text-center">Scanned</th>
                  <th className="py-2.5 px-4 text-center">Not Scanned</th>
                  <th className="py-2.5 px-4 text-center">Progress</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bundles
                  .filter(b => !bundleSearch.trim() || b.classId.toLowerCase().includes(bundleSearch.trim().toLowerCase()))
                  .map((b, idx) => {
                    let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
                    if (b.status === 'COMPLETED') {
                      badgeColor = 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]';
                    } else if (b.status === 'IN PROGRESS') {
                      badgeColor = 'bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]';
                    } else if (b.status === 'PARTIAL / SAVED') {
                      badgeColor = 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';
                    }

                    return (
                      <tr
                        key={b.classId}
                        onClick={() => setActiveClassId(b.classId)}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                      >
                        <td className="py-2.5 px-4 text-center font-mono text-[11px] text-[#64748B]">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="font-mono font-bold text-sm text-[#172033] bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                            {b.classId}
                          </span>
                          {idx === 0 && b.status === 'IN PROGRESS' && (
                            <span className="ml-2 text-[9px] bg-[#1565D8] text-white px-1.5 py-0.5 rounded font-sans font-bold">
                              TOP
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider rounded-md ${badgeColor}`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold text-[#172033]">
                          {b.expectedCount}
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold text-[#1565D8]">
                          {b.savedCount}
                          {b.pendingCount > 0 && (
                            <span className="text-[10px] text-[#F59E0B] font-normal ml-1">
                              (+{b.pendingCount})
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold text-[#DC2626]">
                          {b.missingCount}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                              <div
                                className="h-full bg-[#16A34A] rounded-full"
                                style={{ width: `${Math.min(100, b.progressPercentage)}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-[11px] text-[#16A34A]">
                              {b.progressPercentage}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveClassId(b.classId);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-[#1565D8] hover:bg-blue-50 rounded-lg border border-[#BFDBFE] transition-colors cursor-pointer"
                          >
                            <span>Open Bundle</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 5: CLASS NOT IMPORTED WARNING MODAL */}
      {unknownClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FECACA] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white rounded-xl mx-auto mb-3">
              <AlertOctagon className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#991B1B]">
              CLASS NOT IMPORTED
            </div>

            <div className="text-xs text-[#7F1D1D] mt-2 mb-1">
              Class ID:
            </div>
            <div className="font-mono text-lg font-black text-[#991B1B] bg-red-100 py-1 px-3 rounded-lg border border-red-300 inline-block mb-3">
              {unknownClassModal.classId}
            </div>

            <div className="text-xs font-mono text-[#64748B] bg-slate-100 p-2 border border-slate-200 rounded-lg mb-3">
              Barcode: {unknownClassModal.barcode}
            </div>

            <div className="text-xs text-[#7F1D1D] mb-4 leading-relaxed font-semibold">
              This Class ID is not available in the imported data.
              <span className="block mt-1 font-normal">
                Please scan a valid imported booklet.
              </span>
            </div>

            <button
              type="button"
              onClick={resumeScanning}
              className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold transition-colors uppercase tracking-wider rounded-lg cursor-pointer"
            >
              SCAN AGAIN
            </button>
          </div>
        </div>
      )}

      {/* SECTION 5: CLASS ID MISMATCH MODAL */}
      {classMismatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FECACA] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white rounded-xl mx-auto mb-3">
              <AlertOctagon className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#991B1B]">
              CLASS ID MISMATCH
            </div>

            <div className="text-xs text-[#7F1D1D] mt-3 leading-relaxed">
              CURRENT SCANNING CLASS:
              <div className="font-mono text-sm font-bold bg-blue-100 text-[#1565D8] px-2 py-1 rounded border border-blue-300 mt-1">
                {classMismatchModal.currentClass}
              </div>
            </div>

            <div className="text-xs text-[#7F1D1D] mt-2 leading-relaxed">
              DETECTED CLASS:
              <div className="font-mono text-sm font-bold bg-red-100 text-[#DC2626] px-2 py-1 rounded border border-red-300 mt-1">
                {classMismatchModal.detectedClass}
              </div>
            </div>

            <div className="text-xs text-[#7F1D1D] mt-3 mb-4 leading-relaxed font-semibold">
              This booklet does not belong to the imported scanning data.
              <span className="block mt-1 font-normal">
                Please scan a valid imported booklet.
              </span>
            </div>

            <button
              type="button"
              onClick={resumeScanning}
              className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold transition-colors uppercase tracking-wider rounded-lg cursor-pointer"
            >
              SCAN AGAIN
            </button>
          </div>
        </div>
      )}

      {/* SECTION 5: MEMBER ID NOT FOUND MODAL */}
      {unknownMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FECACA] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white rounded-xl mx-auto mb-3">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#991B1B]">
              MEMBER ID NOT FOUND
            </div>

            <div className="grid grid-cols-2 gap-2 my-3 text-xs">
              <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
                <span className="text-[#64748B] block text-[10px] uppercase font-bold">Class ID</span>
                <span className="font-mono font-bold text-[#172033]">{unknownMemberModal.classId}</span>
              </div>
              <div className="bg-[#FEE2E2] p-2 border border-[#FECACA] rounded-lg">
                <span className="text-[#991B1B] block text-[10px] uppercase font-bold">Member ID</span>
                <span className="font-mono font-bold text-[#991B1B]">
                  {unknownMemberModal.memberId}
                </span>
              </div>
            </div>

            <div className="text-xs text-[#7F1D1D] mb-4">
              This Member ID was not found in the imported Excel data for Class {unknownMemberModal.classId}.
              <span className="block mt-1 font-semibold">The booklet has NOT been marked as received.</span>
            </div>

            <button
              type="button"
              onClick={resumeScanning}
              className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold transition-colors uppercase tracking-wider rounded-lg cursor-pointer"
            >
              SCAN AGAIN
            </button>
          </div>
        </div>
      )}

      {/* DUPLICATE MODAL */}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FDE68A] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#F59E0B] text-white rounded-xl mx-auto mb-3">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#B45309]">
              ALREADY SCANNED
            </div>

            <div className="text-xs text-[#78350F] mt-2 mb-4 leading-relaxed">
              Member ID:{' '}
              <strong className="font-mono text-sm text-[#172033] font-bold">
                {duplicateModal.memberId}
              </strong>{' '}
              in Class{' '}
              <strong className="font-mono text-sm text-[#172033] font-bold">
                {duplicateModal.classId}
              </strong>
              <div className="mt-1 font-semibold">
                This booklet was already scanned. Count remains unchanged.
              </div>
            </div>

            <button
              type="button"
              onClick={resumeScanning}
              className="w-full py-2.5 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold transition-colors uppercase tracking-wider rounded-lg cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
