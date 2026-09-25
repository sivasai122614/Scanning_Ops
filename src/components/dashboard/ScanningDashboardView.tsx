// ==============================================================================
// ExamScan — Scanning Dashboard View (Sections 4, 5, 6, 7, 8, 9, 10, 11, 14)
// The MAIN OPERATIONAL SCREEN for the exam inwarding workflow.
// - Reuses existing Home visual language (Date, University, Statistics)
// - Class-wise data showing every imported Class ID, counts, progress, and statuses
// - Camera embedded BELOW the class-wise data with a controlled rectangular frame
// - Instant redirect to dedicated Bundle Statistics screen when a valid class is scanned
// - "CLASS ID NOT IMPORTED" warning when a foreign/unimported barcode is scanned
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
  Maximize2,
  RotateCcw,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  CameraOff,
  Upload,
  Layers,
  Sparkles,
  AlertOctagon,
  X,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  SessionSummary,
  sanitizeBarcode,
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

  // Active Class Bundle (when not null, renders the dedicated Bundle Statistics screen without camera)
  const [activeClassId, setActiveClassId] = useState<string | null>(null);

  // Modal / Notifications
  const [isSessionSummaryOpen, setIsSessionSummaryOpen] = useState(false);
  const [exportNotification, setExportNotification] = useState<string | null>(null);

  // Section 11: "CLASS ID NOT IMPORTED" Modal State
  const [unrecognizedClassError, setUnrecognizedClassError] = useState<{
    barcode: string;
    detectedClassId: string;
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
  const [scanFeedback, setScanFeedback] = useState<{ text: string; type: 'success' | 'warning' } | null>(null);

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

  // Camera lifecycle: start when on Scanning Dashboard, stop when inside Bundle Statistics screen
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
    setScanFeedback(null);

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
      console.warn('Camera error:', err);
      setCameraLoading(false);
      setCameraActive(false);
      setCameraError(err?.message || 'Camera standby. Enter barcode manually below.');
    }
  };

  /**
   * Barcode -> Class ID Detection logic (Sections 9, 10, 11)
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
      // 1. Detect Class ID from code
      const detectedClassId = importedService.detectClassId(code);
      const allBundles = importedService.getClassBundles();
      const matchingBundle = allBundles.find(
        b => detectedClassId && b.classId.toLowerCase() === detectedClassId.toLowerCase()
      );

      // SECTION 11: IMPORTED CLASS ID NOT FOUND
      if (!detectedClassId || !matchingBundle) {
        playScanWarningSound();
        setUnrecognizedClassError({
          barcode: code,
          detectedClassId: detectedClassId || 'UNKNOWN',
        });
        return;
      }

      // SECTION 10: IMPORTED CLASS ID FOUND!
      // Immediately open BUNDLE STATISTICS — CLASS {classId}
      playScanSuccessSound();
      stopCamera();

      // Process first booklet scan for this class if record matches
      try {
        await importedService.processFirstBooklet(code);
      } catch {}

      setActiveClassId(matchingBundle.classId);
    } catch (err) {
      console.warn('Barcode scan error:', err);
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

  // If operator has drilled down into a specific Class Bundle, render dedicated screen (Section 4 & 12)
  // CAMERA MUST NOT APPEAR ON THIS SCREEN
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

  const totalClasses = sessionSummary?.totalClasses || bundles.length;
  const totalExpected = sessionSummary?.totalExpected || 0;
  const totalReceived = sessionSummary?.totalReceived || 0;
  const totalMissing = sessionSummary?.totalMissing || 0;
  const completionRate = sessionSummary?.overallCompletion || 0;
  const universityName = sessionSummary?.universityName || 'General University';

  // Quick test sample barcodes from current imported bundles
  const sampleTestBarcodes = bundles.slice(0, 4).map(b => {
    const recs = importedService.getRecords(b.classId);
    const firstUnscanned = recs.find(r => r.scan_status === 'not_started');
    return {
      classId: b.classId,
      code: firstUnscanned ? firstUnscanned.member_id : `${b.classId}MEM001`,
    };
  });

  return (
    <div className="space-y-4 font-sans max-w-5xl mx-auto pb-12">
      {/* 1. Header Toolbar (Section 5) */}
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

      {/* Export Alert */}
      {exportNotification && (
        <div className="p-3 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{exportNotification}</span>
        </div>
      )}

      {/* 2. KPI Statistics Grid (Section 5) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 border border-[#CBD5E1] shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Total Classes</div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{totalClasses}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Imported Sessions</div>
        </div>

        <div className="bg-white p-3.5 border border-[#CBD5E1] shadow-xs">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">Expected Booklets</div>
          <div className="text-2xl font-black text-[#172033] font-tabular mt-1">{totalExpected}</div>
          <div className="text-[11px] text-[#64748B] mt-0.5">Calculated from Excel</div>
        </div>

        <div className="bg-white p-3.5 border border-[#BFDBFE] shadow-xs bg-[#F8FAFC]">
          <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">Received Booklets</div>
          <div className="text-2xl font-black text-[#1565D8] font-tabular mt-1">{totalReceived}</div>
          <div className="text-[11px] text-[#1565D8] mt-0.5 font-medium">Inwarded / Verified</div>
        </div>

        <div className="bg-white p-3.5 border border-[#FECACA] shadow-xs">
          <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">Missing Booklets</div>
          <div className="text-2xl font-black text-[#DC2626] font-tabular mt-1">{totalMissing}</div>
          <div className="text-[11px] text-[#DC2626] mt-0.5 font-medium">Remaining to Inward</div>
        </div>
      </div>

      {/* 3. Today's Progress Card (Section 5) */}
      <div className="bg-white p-4 border border-[#CBD5E1] shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">Today's Progress</span>
          <span className="text-sm font-black font-tabular text-[#16A34A]">{completionRate}%</span>
        </div>

        <div className="mt-2 h-2.5 w-full bg-slate-100 overflow-hidden border border-[#CBD5E1]">
          <div
            className="h-full bg-[#16A34A] transition-all duration-300"
            style={{ width: `${Math.min(100, completionRate)}%` }}
          />
        </div>

        <div className="mt-2 text-xs font-tabular text-[#64748B] flex items-center justify-between">
          <span>
            <strong className="text-[#172033] font-black">{totalReceived}</strong> / {totalExpected} scanned
          </span>
          <span className="text-[11px] font-semibold text-[#64748B]">
            {bundles.filter(b => b.status === 'COMPLETED').length} of {bundles.length} Classes Completed
          </span>
        </div>
      </div>

      {/* 4. CLASS-WISE SCANNING DATA (Section 6 & 14) */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs overflow-hidden">
        <div className="p-3.5 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-[#172033]">
              Scanning Dashboard — Class-Wise
            </h2>
            <div className="text-[11px] text-[#64748B]">
              Class ID | Expected | Received | Remaining | Progress | Status
            </div>
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
          <div className="divide-y divide-[#E2E8F0]">
            {bundles.map(b => {
              const isStarted = b.receivedCount > 0 && b.status !== 'NOT STARTED';
              const isCompleted = b.status === 'COMPLETED';

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
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="px-3 py-1 bg-slate-100 border border-slate-300 font-mono font-bold text-sm text-[#172033]">
                      Class {b.classId}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-tabular">
                      <div>
                        <span className="text-[#64748B] text-[11px] block">Expected</span>
                        <span className="font-bold text-[#172033]">{b.expectedCount}</span>
                      </div>
                      <div>
                        <span className="text-[#64748B] text-[11px] block">Received</span>
                        <span className="font-bold text-[#1565D8]">{b.receivedCount}</span>
                      </div>
                      <div>
                        <span className="text-[#64748B] text-[11px] block">Remaining</span>
                        <span className="font-bold text-[#DC2626]">{b.missingCount}</span>
                      </div>
                      <div className="min-w-[70px]">
                        <span className="text-[#64748B] text-[11px] block">Progress</span>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-12 bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-[#16A34A]"
                              style={{ width: `${Math.min(100, b.progressPercentage)}%` }}
                            />
                          </div>
                          <span className="font-bold text-[#16A34A] text-[11px]">
                            {b.progressPercentage}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-1 border text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}
                    >
                      {b.status}
                    </span>

                    {/* SECTION 6 & 14: ALREADY STARTED CLASS WORKFLOW */}
                    {isStarted && !isCompleted ? (
                      <button
                        type="button"
                        onClick={() => setActiveClassId(b.classId)}
                        className="px-3 py-1.5 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors flex items-center gap-1"
                      >
                        <span>Continue Bundle</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    ) : isCompleted ? (
                      <button
                        type="button"
                        onClick={() => setActiveClassId(b.classId)}
                        className="px-3 py-1.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition-colors flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" />
                        <span>View Bundle</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveClassId(b.classId)}
                        className="px-3 py-1.5 bg-slate-100 border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider hover:bg-[#1565D8] hover:text-white transition-colors"
                      >
                        Open Bundle
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. CAMERA PREVIEW MUST BE INSIDE SCANNING DASHBOARD (Section 7 & 8) */}
      {/* Placed BELOW the imported statistics and class-wise data */}
      <div className="bg-white border border-[#CBD5E1] shadow-xs overflow-hidden">
        {/* Camera Header Banner */}
        <div className="p-3.5 bg-[#1565D8] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">Scan Booklet</div>
              <div className="text-[11px] text-white/80">
                Scan first booklet to detect Class ID and immediately open Bundle Statistics
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

        {/* Viewfinder Container: Controlled frame, centered, object-fit: cover, responsive width (Section 8) */}
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
              <div className="text-xs font-bold uppercase tracking-wider">Activating Scanner Viewfinder...</div>
              <div className="text-[11px] text-white/70 mt-1">Calibrating wide barcode reader</div>
            </div>
          )}

          {!cameraActive && !cameraLoading && (
            <div className="text-center text-white/80 p-6">
              <CameraOff className="h-10 w-10 mx-auto mb-2 text-white/50" />
              <div className="text-sm font-bold text-white mb-1">Camera Standby</div>
              <div className="text-xs text-white/70 max-w-sm mx-auto mb-3">
                {cameraError || 'Camera feed is paused. You can restart or enter barcodes below.'}
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

          {/* Guide Reticle: Clear scan boundary optimized for horizontal 1D barcodes (Section 8) */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Horizontal Rectangular Scan Frame */}
              <div className="w-[88%] sm:w-[82%] h-[32%] sm:h-[28%] border-2 border-dashed border-[#22C55E] relative flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                {/* 4 Sharp Corner Brackets */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-white" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-white" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-white" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-white" />

                {/* Sweeping Laser Line across full horizontal width */}
                <div className="absolute left-2 right-2 h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />

                <span className="text-[10px] sm:text-[11px] font-bold text-white bg-black/75 px-2.5 py-0.5 uppercase tracking-widest border border-white/30">
                  SCAN BOOKLET BARCODE HERE
                </span>
              </div>
              <div className="text-[10px] text-white/80 font-medium mt-3 bg-black/60 px-3 py-1 uppercase tracking-wider">
                Align booklet barcode horizontally inside the green rectangle
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
              placeholder="Or enter barcode e.g. 1211MEM001, 1211-001..."
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
            Scanning detects Class ID. If valid, opens Bundle Statistics immediately.
          </div>
        </div>
      </div>

      {/* SECTION 11: CLASS ID NOT IMPORTED WARNING MODAL */}
      {unrecognizedClassError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white rounded-none border border-[#FECACA] shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#EF4444] text-white mx-auto mb-3">
              <AlertOctagon className="h-7 w-7" />
            </div>

            <div className="text-base font-extrabold tracking-wide uppercase text-[#991B1B]">
              ⚠ CLASS ID NOT IMPORTED
            </div>

            <div className="text-xs text-[#7F1D1D] mt-2 leading-relaxed">
              The scanned Class ID:{' '}
              <span className="font-mono font-bold text-[#172033] bg-[#FEE2E2] px-1.5 py-0.5">
                {unrecognizedClassError.detectedClassId}
              </span>{' '}
              was not found in the imported Excel data.
            </div>

            <div className="text-xs font-mono text-[#64748B] bg-slate-100 p-2 border border-slate-200 mt-2">
              Barcode: {unrecognizedClassError.barcode}
            </div>

            <div className="text-[11px] text-[#64748B] mt-2 mb-5">
              This booklet cannot be added to the current scanning session.
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUnrecognizedClassError(null)}
                className="flex-1 py-2.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
              >
                Scan Again
              </button>
              <button
                type="button"
                onClick={() => setUnrecognizedClassError(null)}
                className="flex-1 py-2.5 bg-[#1565D8] text-white text-xs font-bold hover:bg-[#0D47A1] transition-colors uppercase tracking-wider"
              >
                Back to Dashboard
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
