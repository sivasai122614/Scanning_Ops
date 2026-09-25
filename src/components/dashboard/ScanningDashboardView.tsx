// ==============================================================================
// ExamScan — Scanning Dashboard View (Sections 1, 2, 3, 4, 5, 13, 14, 15, 16-25, 29)
// The PRIMARY OPERATIONAL SCREEN for ExamScan.
// 1. Session Info (Date, University)
// 2. Overall Statistics (Total Classes, Expected / Imported, Scanned, Not Scanned, Progress)
// 3. Class-Wise Cards (One card per UNIQUE Class ID with Imported, Scanned, Not Scanned, Progress, Status)
//    - Entire card is clickable to open Class Bundle Detail screen!
// 4. Camera Preview (Below Class Cards)
//    - Green dashed rectangular scan boundary
//    - Red horizontal center line
//    - Clear instruction: "HOLD BOOKLET BARCODE HORIZONTALLY INSIDE THE GREEN RECTANGLE"
//    - Preserves natural camera aspect ratio with object-fit: cover
// 5. Barcode Scan Protection & Flow:
//    - Class ID Not Imported warning (Section 17)
//    - Member ID Not Imported warning (Section 19)
//    - Duplicate Booklet warning (Section 20)
//    - Valid first booklet opens Class Bundle screen immediately (Section 16)
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Building,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Scan,
  Download,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  CameraOff,
  Upload,
  Layers,
  AlertOctagon,
  X,
  Check,
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
import { SessionSummaryModal } from '../bundles/SessionSummaryModal';
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

  // Active Class Bundle (when set, opens Class Bundle Detail screen without camera)
  const [activeClassId, setActiveClassId] = useState<string | null>(null);

  // Session Summary Modal & Notifications
  const [isSessionSummaryOpen, setIsSessionSummaryOpen] = useState(false);
  const [exportNotification, setExportNotification] = useState<string | null>(null);
  const [scanSuccessToast, setScanSuccessToast] = useState<string | null>(null);

  // Scan Error Modals
  // Section 17: CLASS ID NOT IMPORTED
  const [unknownClassModal, setUnknownClassModal] = useState<{
    barcode: string;
    classId: string;
  } | null>(null);

  // Section 19: MEMBER ID NOT IMPORTED
  const [unknownMemberModal, setUnknownMemberModal] = useState<{
    barcode: string;
    classId: string;
    memberId: string;
  } | null>(null);

  // Section 20: DUPLICATE BOOKLET
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

  // Camera lifecycle: start when on Scanning Dashboard, stop when inside Class Bundle screen
  useEffect(() => {
    if (!activeClassId) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeClassId, selectedDeviceId]);

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

  /**
   * Barcode Scan Handling on Scanning Dashboard (Sections 16, 17, 18, 19, 20)
   */
  const handleBarcodeScan = async (rawCode: string) => {
    const code = sanitizeBarcode(rawCode);
    if (!code) return;

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

      // Section 17: CLASS ID NOT IMPORTED
      if (result.isUnknownClass) {
        playScanWarningSound();
        setUnknownClassModal({
          barcode: code,
          classId: result.detectedClassId || 'UNKNOWN',
        });
        return;
      }

      // Section 19: MEMBER ID NOT IMPORTED
      if (result.isUnknownMember) {
        playScanWarningSound();
        setUnknownMemberModal({
          barcode: code,
          classId: result.detectedClassId || result.class_id || 'UNKNOWN',
          memberId: result.detectedMemberId || 'UNKNOWN',
        });
        return;
      }

      // Section 20: DUPLICATE BOOKLET
      if (result.isDuplicate) {
        playScanWarningSound();
        setDuplicateModal({
          barcode: code,
          memberId: result.member_id || code,
          classId: result.class_id || 'UNKNOWN',
        });
        return;
      }

      // Section 16 & 18: VALID SCAN
      if (result.success && result.class_id) {
        playScanSuccessSound();
        setScanSuccessToast(`✓ Scanned Member ${result.member_id} for Class ${result.class_id}`);
        setTimeout(() => setScanSuccessToast(null), 3500);

        // Section 16: Automatically redirect to Class Bundle screen, camera disappears!
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
        alert('Could not decode a barcode from the selected image. Please try a clearer picture or enter manually.');
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

  const handleExportExcel = () => {
    const res = importedService.exportClassWiseExcel();
    if (res.success) {
      setExportNotification(`Exported ${res.filename} with live database records!`);
      setTimeout(() => setExportNotification(null), 4000);
    }
  };

  // If operator has selected a Class Bundle card or scanned a valid booklet,
  // render the dedicated Class Bundle Detail screen WITHOUT camera (Section 6, 7, 15)
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

  // Calculate real-time overall statistics (Section 4)
  const totalClasses = sessionSummary?.totalClasses || bundles.length;
  const totalExpected = sessionSummary?.totalExpected || 0;
  const totalScanned = sessionSummary?.totalReceived || 0;
  const totalNotScanned = sessionSummary?.totalMissing || 0;
  const overallProgress = sessionSummary?.overallCompletion || 0;
  const universityName = sessionSummary?.universityName || 'General University';

  // Quick test sample barcodes from current imported bundles
  const sampleTestBarcodes = bundles.slice(0, 4).map(b => {
    const recs = importedService.getRecords(b.classId);
    const firstUnscanned = recs.find(r => r.scan_status === 'not_started');
    return {
      classId: b.classId,
      code: firstUnscanned ? `${b.classId}${firstUnscanned.member_id}` : `${b.classId}MEM001`,
      memberOnly: firstUnscanned ? firstUnscanned.member_id : 'MEM001',
    };
  });

  return (
    <div className="space-y-4 font-sans max-w-5xl mx-auto pb-12">
      {/* 1. Header Toolbar (Section 3 & 29) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 h-9 px-3 bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-semibold text-[#172033]">
            <CalendarIcon className="h-4 w-4 text-[#1565D8]" />
            <span>{todayStr}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#64748B] font-medium border-l border-[#CBD5E1] pl-3">
            <Building className="h-4 w-4 text-[#64748B]" />
            <span className="font-bold text-[#172033]">{universityName}</span>
          </div>
        </div>

        {/* Global Toolbar Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSessionSummaryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ShieldCheck className="h-4 w-4 text-[#1565D8]" />
            <span>Session Summary</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#16A34A] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#15803D] transition-colors shadow-xs"
          >
            <Download className="h-4 w-4" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Alerts / Toasts */}
      {exportNotification && (
        <div className="p-3 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{exportNotification}</span>
        </div>
      )}

      {scanSuccessToast && (
        <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] text-[#1565D8] text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <Check className="h-4 w-4 shrink-0 text-[#16A34A]" />
          <span>{scanSuccessToast}</span>
        </div>
      )}

      {/* 2. OVERALL STATISTICS (Section 4 & 29) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 border border-[#CBD5E1] shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
            TOTAL CLASSES
          </div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">
            {totalClasses}
          </div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Imported Sessions</div>
        </div>

        <div className="bg-white p-3.5 border border-[#CBD5E1] shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
            EXPECTED / IMPORTED
          </div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">
            {totalExpected}
          </div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Booklets from Excel</div>
        </div>

        <div className="bg-white p-3.5 border border-[#BFDBFE] shadow-xs bg-[#F8FAFC]">
          <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">
            SCANNED
          </div>
          <div className="text-2xl font-black text-[#1565D8] font-tabular mt-1">
            {totalScanned}
          </div>
          <div className="text-[11px] text-[#1565D8] mt-0.5 font-medium">Inwarded / Verified</div>
        </div>

        <div className="bg-white p-3.5 border border-[#FECACA] shadow-xs">
          <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">
            NOT SCANNED
          </div>
          <div className="text-2xl font-black text-[#DC2626] font-tabular mt-1">
            {totalNotScanned}
          </div>
          <div className="text-[11px] text-[#DC2626] mt-0.5 font-medium">Remaining to Inward</div>
        </div>
      </div>

      {/* OVERALL PROGRESS BAR */}
      <div className="bg-white p-4 border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">
            Overall Progress ({totalScanned} / {totalExpected} Scanned)
          </span>
          <span className="text-sm font-black font-tabular text-[#16A34A]">
            {overallProgress}%
          </span>
        </div>

        <div className="mt-2 h-2.5 w-full bg-slate-100 overflow-hidden border border-[#CBD5E1]">
          <div
            className="h-full bg-[#16A34A] transition-all duration-300"
            style={{ width: `${Math.min(100, overallProgress)}%` }}
          />
        </div>
      </div>

      {/* 3. CLASS-WISE CARDS (Section 2, 5, 25, 29) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs overflow-hidden">
        <div className="p-3.5 bg-[#F1F5F9] border-b border-[#E2E8F0]">
          <h2 className="text-xs font-black uppercase tracking-wider text-[#172033]">
            SCANNING DASHBOARD — CLASS WISE
          </h2>
          <div className="text-[11px] text-[#64748B]">
            One card per unique Class ID. Click any card to inspect and manage that class bundle.
          </div>
        </div>

        {bundles.length === 0 ? (
          <div className="p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EAF2FF] text-[#1565D8] mx-auto mb-2">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-[#172033]">No Imported Classes Found</h3>
            <p className="text-xs text-[#64748B] max-w-sm mx-auto mt-1 mb-4">
              Please import an Excel file containing Class ID and Member ID to view and scan class bundles.
            </p>
            {onNavigateToImport && (
              <button
                type="button"
                onClick={onNavigateToImport}
                className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors"
              >
                Go to Import Data
              </button>
            )}
          </div>
        ) : (
          <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {bundles.map(b => {
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
                  className="bg-white border-2 border-[#CBD5E1] hover:border-[#1565D8] p-4 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                >
                  {/* Card Header: CLASS ID */}
                  <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                    <div className="font-mono font-black text-sm text-[#172033] group-hover:text-[#1565D8] transition-colors">
                      CLASS {b.classId}
                    </div>
                    <span
                      className={`px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}
                    >
                      {b.status}
                    </span>
                  </div>

                  {/* Card Counts: Imported, Scanned, Not Scanned */}
                  <div className="py-3 space-y-1.5 text-xs font-tabular">
                    <div className="flex items-center justify-between text-[#64748B]">
                      <span>Imported</span>
                      <span className="font-bold text-[#172033] text-sm">{b.expectedCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#1565D8]">
                      <span>Scanned</span>
                      <span className="font-bold text-sm">{b.receivedCount}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#DC2626]">
                      <span>Not Scanned</span>
                      <span className="font-bold text-sm">{b.missingCount}</span>
                    </div>
                  </div>

                  {/* Card Progress */}
                  <div className="pt-2 border-t border-[#E2E8F0]">
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-[#64748B] font-bold">Progress</span>
                      <span className="font-bold font-tabular text-[#16A34A]">{b.progressPercentage}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-[#16A34A]"
                        style={{ width: `${Math.min(100, b.progressPercentage)}%` }}
                      />
                    </div>
                  </div>

                  {/* Click affordance indicator */}
                  <div className="mt-3 pt-2 text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#1565D8] group-hover:underline inline-flex items-center gap-1">
                      Open Bundle Detail <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. CAMERA SCANNER SECTION (Below Class-Wise Cards) (Sections 13, 14, 15, 29) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs overflow-hidden">
        {/* Camera Section Header */}
        <div className="p-3.5 bg-[#1565D8] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">SCAN BOOKLET</div>
              <div className="text-[11px] text-white/80">
                Hold booklet barcode horizontally inside the green rectangle
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasTorch && (
              <button
                type="button"
                onClick={handleToggleTorch}
                className={`p-1.5 rounded-none text-xs font-bold flex items-center gap-1 transition-colors ${
                  torchOn ? 'bg-[#F59E0B] text-black' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
                title="Toggle Torch/Flashlight"
              >
                {torchOn ? <Flashlight className="h-4 w-4" /> : <FlashlightOff className="h-4 w-4" />}
              </button>
            )}
            {availableDevices.length > 1 && (
              <button
                type="button"
                onClick={handleCycleCamera}
                className="p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-none text-xs font-bold flex items-center gap-1 transition-colors"
                title="Switch Camera Lens"
              >
                <SwitchCamera className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Viewfinder: Preserving natural aspect ratio with object-fit: cover, no distortion (Section 13 & 14) */}
        <div className="relative bg-black w-full aspect-16/10 sm:aspect-16/9 min-h-[260px] max-h-[420px] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />

          {cameraLoading && (
            <div className="text-center text-white px-4">
              <div className="h-9 w-9 border-3 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-2" />
              <div className="text-xs font-bold uppercase tracking-wider">Initializing Camera...</div>
              <div className="text-[11px] text-white/70 mt-1">Calibrating horizontal barcode scanner</div>
            </div>
          )}

          {!cameraActive && !cameraLoading && (
            <div className="text-center text-white/80 p-6">
              <CameraOff className="h-10 w-10 mx-auto mb-2 text-white/50" />
              <div className="text-sm font-bold text-white mb-1">Camera Feed Paused</div>
              <div className="text-xs text-white/70 max-w-sm mx-auto mb-3">
                {cameraError || 'Camera is in standby. Click below to start scanning or enter barcode manually.'}
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors"
              >
                Start Camera
              </button>
            </div>
          )}

          {/* Guide Reticle: Section 13 & 14 WIDE HORIZONTAL BARCODE ALIGNMENT AREA */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              {/* Green Dashed Rectangular Scan Boundary */}
              <div className="w-[88%] sm:w-[82%] h-[32%] sm:h-[28%] border-2 border-dashed border-[#22C55E] relative flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                {/* 4 Corner Markers */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-white" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-white" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-white" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-white" />

                {/* Red Horizontal Center Line */}
                <div className="absolute left-2 right-2 h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />

                <span className="text-[10px] sm:text-[11px] font-bold text-white bg-black/75 px-2.5 py-0.5 uppercase tracking-widest border border-white/30">
                  WIDE BARCODE ALIGNMENT ZONE
                </span>
              </div>

              {/* Instructional Text */}
              <div className="text-[10px] sm:text-xs text-white font-bold mt-3 bg-black/70 px-3 py-1 uppercase tracking-wider border border-white/20">
                HOLD BOOKLET BARCODE HORIZONTALLY INSIDE THE GREEN RECTANGLE
              </div>
            </div>
          )}
        </div>

        {/* Manual Barcode Input & Upload Fallback */}
        <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="Or enter barcode e.g. 0021MEM001, 0021-001..."
              className="flex-1 px-3 py-2 border border-[#CBD5E1] text-xs text-[#172033] bg-white focus:outline-hidden focus:border-[#1565D8] font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors shrink-0"
            >
              Scan Barcode
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
              className="px-3 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition-colors flex items-center gap-1.5 shrink-0"
              title="Upload image or photo of barcode"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Photo</span>
            </button>
          </form>

          {/* Quick Click-to-Test helper for imported classes */}
          {sampleTestBarcodes.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-[#64748B]">Quick Test Barcodes:</span>
              {sampleTestBarcodes.map(st => (
                <button
                  key={st.code}
                  type="button"
                  onClick={() => handleBarcodeScan(st.code)}
                  className="px-2 py-0.5 bg-white border border-[#CBD5E1] hover:border-[#1565D8] hover:bg-blue-50 text-[11px] font-mono text-[#1565D8] font-semibold transition-colors"
                >
                  Class {st.classId} ({st.code})
                </button>
              ))}
            </div>
          )}

          <div className="text-[11px] text-[#64748B] mt-1.5">
            Valid scan moves member from Not Scanned → Scanned and opens Class Bundle Detail screen.
          </div>
        </div>
      </div>

      {/* SECTION 17: CLASS ID NOT IMPORTED WARNING MODAL */}
      {unknownClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FECACA] shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white mx-auto mb-3">
              <AlertOctagon className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#991B1B]">
              ⚠ CLASS ID NOT IMPORTED
            </div>

            <div className="text-xs text-[#7F1D1D] mt-2 leading-relaxed">
              Scanned Class ID:{' '}
              <span className="font-mono font-bold text-[#172033] bg-[#FEE2E2] px-2 py-0.5 border border-[#FECACA]">
                {unknownClassModal.classId}
              </span>
            </div>

            <div className="text-xs font-mono text-[#64748B] bg-slate-100 p-2 border border-slate-200 mt-2">
              Barcode: {unknownClassModal.barcode}
            </div>

            <div className="text-xs text-[#7F1D1D] mt-2 mb-4 font-medium">
              This Class ID does not exist in the imported Excel data. This booklet cannot be added to the current scanning session.
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUnknownClassModal(null)}
                className="flex-1 py-2.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
              >
                SCAN AGAIN
              </button>
              <button
                type="button"
                onClick={() => setUnknownClassModal(null)}
                className="flex-1 py-2.5 bg-[#1565D8] text-white text-xs font-bold hover:bg-[#0D47A1] transition-colors uppercase tracking-wider"
              >
                BACK TO DASHBOARD
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 19: MEMBER ID NOT IMPORTED WARNING MODAL */}
      {unknownMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FECACA] shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white mx-auto mb-3">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#991B1B]">
              ⚠ MEMBER ID NOT IMPORTED
            </div>

            <div className="grid grid-cols-2 gap-2 my-3 text-xs">
              <div className="bg-slate-50 p-2 border border-slate-200">
                <span className="text-[#64748B] block text-[10px] uppercase font-bold">Class ID</span>
                <span className="font-mono font-bold text-[#172033]">{unknownMemberModal.classId}</span>
              </div>
              <div className="bg-[#FEE2E2] p-2 border border-[#FECACA]">
                <span className="text-[#991B1B] block text-[10px] uppercase font-bold">Member ID</span>
                <span className="font-mono font-bold text-[#991B1B]">{unknownMemberModal.memberId}</span>
              </div>
            </div>

            <div className="text-xs text-[#7F1D1D] mb-4">
              This Member ID was not found in the imported Excel data.
            </div>

            <button
              type="button"
              onClick={() => setUnknownMemberModal(null)}
              className="w-full py-2.5 bg-[#1565D8] text-white text-xs font-bold hover:bg-[#0D47A1] transition-colors uppercase tracking-wider"
            >
              SCAN AGAIN
            </button>
          </div>
        </div>
      )}

      {/* SECTION 20: DUPLICATE BOOKLET WARNING MODAL */}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#FDE68A] shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#F59E0B] text-white mx-auto mb-3">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#B45309]">
              ⚠ DUPLICATE BOOKLET
            </div>

            <div className="text-xs text-[#78350F] mt-2 mb-4 leading-relaxed">
              Member <strong className="font-mono text-sm text-[#172033] font-bold">{duplicateModal.memberId}</strong> has already been scanned in Class{' '}
              <strong className="font-mono text-sm text-[#172033] font-bold">{duplicateModal.classId}</strong>.
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                className="flex-1 py-2.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
              >
                DISMISS
              </button>
              <button
                type="button"
                onClick={() => setDuplicateModal(null)}
                className="flex-1 py-2.5 bg-[#D97706] text-white text-xs font-bold hover:bg-[#B45309] transition-colors uppercase tracking-wider"
              >
                SCAN ANOTHER
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Summary Modal */}
      {isSessionSummaryOpen && (
        <SessionSummaryModal
          isOpen={isSessionSummaryOpen}
          onClose={() => setIsSessionSummaryOpen(false)}
          onSelectClass={cid => {
            setIsSessionSummaryOpen(false);
            setActiveClassId(cid);
          }}
        />
      )}
    </div>
  );
};
