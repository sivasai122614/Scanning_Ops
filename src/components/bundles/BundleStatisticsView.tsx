// ==============================================================================
// ExamScan — Bundle Scan Screen (Sections 6, 7, 8, 9, 10, 11, 12, 13, 14, 30)
// Active Class Bundle Operational Scanning Workspace:
// 1. Header: ← Back to Scan Dashboard | BUNDLE SCAN | CLASS ID: {classId}
// 2. SAVE BUTTON: Enabled when pending unsaved scans exist. Shows "SAVING...",
//    persists final records into saved_scanned_data, updates dashboard/reports,
//    prevents duplicate saving.
// 3. Clear distinction between SCANNED / PENDING SAVE and PERMANENTLY SAVED.
// 4. Rectangular Camera Scanner with continuous barcode detection.
// 5. Validations: Class Mismatch, Member Not Found, Duplicate Protection.
// 6. Detailed Scanned Booklet List with Eye/View Modal.
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  Search,
  Save,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  CameraOff,
  Upload,
  Eye,
  X,
  AlertOctagon,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  BundleRecordView,
  sanitizeBarcode,
  ScanResult,
} from '../../services/importedService';
import { playScanSuccessSound, playScanWarningSound } from '../../utils/scannerSound';
import {
  requestCameraStream,
  startContinuousDualScanning,
  decodeBarcodeFromImageFile,
  CameraStreamResult,
  BarcodeScanResult,
} from '../../utils/universalBarcodeScanner';
import { ScannerTopToast, ScannerToastData } from '../scanner/ScannerTopToast';

interface BundleStatisticsViewProps {
  classId: string;
  onBackToDashboard: () => void;
  onSwitchClass?: (newClassId: string) => void;
}

export const BundleStatisticsView: React.FC<BundleStatisticsViewProps> = ({
  classId,
  onBackToDashboard,
}) => {
  const [bundle, setBundle] = useState<ClassBundle | null>(null);
  const [records, setRecords] = useState<BundleRecordView[]>([]);

  // Tabs: [ SCANNED ] | [ NOT SCANNED ] | [ ALL IMPORTED ]
  const [activeTab, setActiveTab] = useState<'scanned' | 'not_scanned' | 'all'>('scanned');
  const [searchTerm, setSearchTerm] = useState('');

  // Save Button States (Sections 9, 10, 11, 12)
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Top Toast Notification state (Non-blocking, auto-dismissing, Part 10-12)
  const [topToast, setTopToast] = useState<ScannerToastData | null>(null);

  const showToast = useCallback((toastData: ScannerToastData) => {
    setTopToast({
      ...toastData,
      id: Date.now(),
    });
  }, []);

  // Eye/View Modal for Booklet Record Details
  const [viewingRecord, setViewingRecord] = useState<BundleRecordView | null>(null);

  // Camera States
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [quickManualInput, setQuickManualInput] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraResultRef = useRef<CameraStreamResult | null>(null);
  const scannerControllerRef = useRef<{ stop: () => void } | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(() => {
    const b = importedService.getClassBundle(classId);
    const recs = importedService.getBundleRecordViews(classId);
    setBundle(b);
    setRecords(recs);
  }, [classId]);

  useEffect(() => {
    // Authoritative fetch from Supabase imported_inward_data when class opens
    importedService.fetchClassMembers(classId).then(() => {
      loadData();
    });
    loadData();
    const unsub = importedService.subscribe(loadData);
    return () => unsub();
  }, [classId, loadData]);

  // Camera lifecycle for Bundle Scan
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [classId, selectedDeviceId]);

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
              handleBarcodeScan(detected);
            }
          },
          { throttleMs: 25 }
        );
        scannerControllerRef.current = controller;
      }

      setCameraActive(true);
      setCameraLoading(false);
    } catch (err: any) {
      console.warn('Bundle camera error:', err);
      setCameraLoading(false);
      setCameraActive(false);
      setCameraError(err?.message || 'Camera is in standby. Enter barcodes manually below.');
    }
  };

  const resumeScanning = () => {
    isProcessingRef.current = false;
    lastScannedCodeRef.current = null;
    if (!cameraActive) {
      startCamera();
    }
  };

  /**
   * Barcode Scan Processing within active class bundle
   */
  const handleBarcodeScan = async (detectedOrRaw: BarcodeScanResult | string) => {
    const rawCode = typeof detectedOrRaw === 'string' ? detectedOrRaw : detectedOrRaw.text;
    const perfInfo = typeof detectedOrRaw === 'object' ? detectedOrRaw.perf : undefined;
    const formatInfo = typeof detectedOrRaw === 'object' ? detectedOrRaw.format : 'code_39';

    const code = sanitizeBarcode(rawCode);
    if (!code) return;

    // STEP 15: Debounce duplicate reads of the exact SAME barcode while it stays in front of the lens (1.5s)
    const now = Date.now();
    if (lastScannedCodeRef.current === code && now - lastScannedTimeRef.current < 1500) {
      return;
    }
    if (isProcessingRef.current) return;

    // STEP 12: Lightweight processing lock
    isProcessingRef.current = true;
    lastScannedCodeRef.current = code;
    lastScannedTimeRef.current = now;

    const tProcStart = performance.now();

    try {
      const result: ScanResult = await importedService.processBundleScan(classId, code);

      // Section 9: CLASS ID MISMATCH PROTECTION
      if (result.isWrongClass) {
        playScanWarningSound();
        showToast({
          type: 'warning',
          title: '⚠ Wrong Class ID',
          subtitle: `Belongs to Class ${result.detectedClassId || 'Other Class'}`,
        });
        return;
      }

      // Section 10: MEMBER ID NOT FOUND
      if (result.isUnknownMember) {
        playScanWarningSound();
        showToast({
          type: 'error',
          title: '✕ Member Not Found',
          subtitle: result.detectedMemberId || code,
        });
        return;
      }

      // Section 14: DUPLICATE SCAN PROTECTION
      if (result.isDuplicate) {
        playScanWarningSound();
        showToast({
          type: 'warning',
          title: '⚠ Already Inwarded',
          subtitle: result.member_id || code,
        });
        return;
      }

      // Section 13: VALID BOOKLET -> STAGED AS PENDING SAVE
      if (result.success && result.member_id) {
        playScanSuccessSound();
        showToast({
          type: 'success',
          title: '✓ Member Inwarded Successfully',
          subtitle: result.member_id,
        });
        loadData();
      } else {
        playScanWarningSound();
        showToast({
          type: 'error',
          title: '✕ Inward Failed',
          subtitle: 'Please try again',
        });
      }

      // STEP 19: Performance metrics in console
      const procMs = Math.round(performance.now() - tProcStart);
      const detMs = perfInfo?.detectionMs ?? 0;
      const engine = perfInfo?.engine ?? 'direct';
      console.log(`[SCAN PERF] ========================================`);
      console.log(`[SCAN PERF] BUNDLE SCAN:  ${code} (${formatInfo})`);
      console.log(`[SCAN PERF] Engine:       ${engine}`);
      console.log(`[SCAN PERF] Detection:    ${detMs}ms`);
      console.log(`[SCAN PERF] Validation:   ${procMs}ms`);
      console.log(`[SCAN PERF] Total Time:   ${detMs + procMs}ms`);
      console.log(`[SCAN PERF] ========================================`);
    } catch (err) {
      console.warn('Scan bundle error:', err);
      showToast({
        type: 'error',
        title: '✕ Inward Failed',
        subtitle: 'Please try again',
      });
    } finally {
      // STEP 11 & 12: Camera continuously available, immediately ready for next scan
      isProcessingRef.current = false;
    }
  };

  /**
   * SAVE BUTTON ACTION (Sections 9, 10, 11, 12)
   */
  const handleSaveScans = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveSuccessMessage(null);

    try {
      // Simulate quick confirmation state per Section 11: SAVING...
      await new Promise(r => setTimeout(r, 450));
      const res = await importedService.saveActiveBundle(classId);

      if (res.success) {
        playScanSuccessSound();
        setSaveSuccessMessage(`${res.savedCount} booklets saved successfully.`);
        setTimeout(() => setSaveSuccessMessage(null), 4000);
        loadData();
      }
    } catch (err: any) {
      alert(err.message || 'Error saving scanned booklets');
    } finally {
      setIsSaving(false);
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
        alert('Could not decode a barcode from the photo. Please try a clearer image.');
      }
    } catch (err: any) {
      alert('Photo read error: ' + (err?.message || 'unknown'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleQuickManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickManualInput.trim()) return;
    handleBarcodeScan(quickManualInput.trim());
    setQuickManualInput('');
  };

  if (!bundle) {
    return (
      <div className="p-6 bg-white border border-[#CBD5E1] rounded-xl text-center font-sans max-w-4xl mx-auto my-6">
        <AlertTriangle className="h-10 w-10 text-[#F59E0B] mx-auto mb-2" />
        <h2 className="text-base font-bold text-[#172033]">Class Bundle Not Found</h2>
        <p className="text-xs text-[#64748B] mt-1 mb-4">
          No records or bundle data found for Class ID "{classId}".
        </p>
        <button
          type="button"
          onClick={onBackToDashboard}
          className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1]"
        >
          ← Back to Scan Dashboard
        </button>
      </div>
    );
  }

  const expectedCount = bundle.expectedCount;
  const savedCount = bundle.savedCount;
  const pendingCount = bundle.pendingCount;
  const totalScanned = bundle.receivedCount; // savedCount + pendingCount
  const notScannedCount = bundle.missingCount;
  const progressPercentage = expectedCount > 0 ? Math.round((totalScanned / expectedCount) * 100) : 0;
  const is100Percent = expectedCount > 0 && savedCount >= expectedCount;

  // Filter lists
  const scannedRecords = records.filter(r => r.scan_status === 'saved' || r.scan_status === 'pending_save');
  const notScannedRecords = records.filter(r => r.scan_status === 'not_started');

  const displayedRecords = (
    activeTab === 'scanned'
      ? scannedRecords
      : activeTab === 'not_scanned'
      ? notScannedRecords
      : records
  ).filter(r => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      r.member_id.toLowerCase().includes(q) ||
      (r.barcode && r.barcode.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4 font-sans max-w-4xl mx-auto pb-24 relative">
      {/* PART 10, 11, 12: Fixed Small Success & Error Top Toast */}
      <ScannerTopToast toast={topToast} onDismiss={() => setTopToast(null)} duration={1800} />

      {/* 1. Header (Sections 6 & 9) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 border border-[#CBD5E1] rounded-xl shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToDashboard}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#172033] text-xs font-bold transition-colors uppercase tracking-wider border border-[#CBD5E1] rounded-lg cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          <div className="h-5 w-px bg-[#CBD5E1] hidden sm:block" />
          <div>
            <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
              BUNDLE SCAN
            </div>
            <h1 className="text-xl font-black text-[#172033] tracking-tight">
              CLASS ID: {classId}
            </h1>
          </div>
        </div>

        {/* SECTION 9: VISIBLE SAVE BUTTON */}
        <div className="flex items-center gap-2">
          {pendingCount > 0 ? (
            <button
              type="button"
              onClick={handleSaveScans}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 bg-[#16A34A] hover:bg-[#15803D] active:scale-95 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer animate-pulse"
              title={`${pendingCount} scanned records ready to be saved permanently`}
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'SAVING...' : `SAVE (${pendingCount} READY)`}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-[#64748B] border border-slate-300 text-xs font-bold uppercase tracking-wider rounded-xl cursor-default"
            >
              <Check className="h-4 w-4 text-[#16A34A]" />
              <span>ALL RECORDS SAVED</span>
            </button>
          )}
        </div>
      </div>

      {/* Save Success Banner */}
      {saveSuccessMessage && (
        <div className="p-3.5 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] rounded-xl text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[#16A34A]" />
            <span>{saveSuccessMessage}</span>
          </div>
          <span className="text-[10px] uppercase font-bold text-[#15803D] bg-white px-2 py-0.5 rounded border border-[#86EFAC]">
            Database Updated
          </span>
        </div>
      )}

      {/* 2. PRIMARY STATISTICS & COUNTERS (Section 9 & 30) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* STAT 1: INWARDED (With breakdown between Saved and Pending Save) */}
        <div className="bg-white p-4 border border-[#BFDBFE] rounded-xl shadow-xs bg-[#F8FAFC]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">
              INWARDED
            </div>
            {pendingCount > 0 && (
              <span className="text-[9px] bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] px-1.5 py-0.5 rounded font-bold uppercase">
                {pendingCount} Pending Save
              </span>
            )}
          </div>
          <div className="text-3xl font-black text-[#1565D8] font-tabular mt-1">
            {totalScanned}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 font-medium flex items-center gap-1.5">
            <span className="font-bold text-[#16A34A]">{savedCount} Inwarded</span>
            <span>•</span>
            <span className="font-bold text-[#D97706]">{pendingCount} Pending Save</span>
          </div>
        </div>

        {/* STAT 2: NOT INWARDED */}
        <div className="bg-white p-4 border border-[#FECACA] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">
            NOT INWARDED
          </div>
          <div className="text-3xl font-black text-[#DC2626] font-tabular mt-1">
            {notScannedCount}
          </div>
          <div className="text-[11px] text-[#DC2626] mt-1 font-medium">
            Remaining Expected Booklets
          </div>
        </div>

        {/* STAT 3: TOTAL EXPECTED */}
        <div className="bg-white p-4 border border-[#CBD5E1] rounded-xl shadow-xs col-span-2 sm:col-span-1">
          <div className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider">
            TOTAL EXPECTED
          </div>
          <div className="text-3xl font-black text-[#172033] font-tabular mt-1">
            {expectedCount}
          </div>
          <div className="text-[11px] text-[#64748B] mt-1 font-medium">
            Imported for Class {classId}
          </div>
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className="bg-white p-4 border border-[#CBD5E1] rounded-xl shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">
            Class {classId} Progress ({savedCount} Saved / {expectedCount} Expected)
          </span>
          <span className="text-sm font-black font-tabular text-[#16A34A]">
            {progressPercentage}%
          </span>
        </div>

        <div className="mt-2 h-2.5 w-full bg-slate-100 overflow-hidden rounded-full border border-[#CBD5E1]">
          <div
            className="h-full bg-[#16A34A] transition-all duration-300 rounded-full"
            style={{ width: `${Math.min(100, progressPercentage)}%` }}
          />
        </div>
      </div>

      {/* CLASS COMPLETED BANNER */}
      {is100Percent && (
        <div className="p-4 bg-[#DCFCE7] border-2 border-[#16A34A] rounded-xl text-[#14532D] flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-[#16A34A] text-white rounded-xl shrink-0">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>
            <div>
              <div className="text-base font-extrabold uppercase tracking-wide">
                CLASS COMPLETED
              </div>
              <div className="text-xs text-[#166534] font-medium">
                All {expectedCount} expected booklets for Class ID {classId} have been permanently saved!
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. FULL-FRAME CAMERA SCANNER */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl shadow-xs overflow-hidden">
        <div className="relative bg-black w-full aspect-4/3 min-h-[380px] sm:min-h-[460px] max-h-[58vh] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />

          {/* PART 7: Targeted Barcode Aiming Guide Overlay */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-[80%] h-[40%] rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                {/* Corner Reticle Accents */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
                {/* Subtle Red Aiming Laser Line */}
                <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-0.5 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse" />
                <div className="absolute -bottom-6 inset-x-0 text-center text-[10px] font-mono text-emerald-300 font-bold uppercase tracking-wider drop-shadow-md">
                  Align Code 39 Barcode
                </div>
              </div>
            </div>
          )}

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

        {/* Camera Controls */}
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

        {/* Quick Manual Entry Bar */}
        <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
          <form onSubmit={handleQuickManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={quickManualInput}
              onChange={e => setQuickManualInput(e.target.value)}
              placeholder={`Enter barcode for Class ${classId} (e.g. ${classId}22MIS001)...`}
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

      {/* 4. SCANNED BOOKLETS & TABS (Sections 7, 8, 9, 10) */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#CBD5E1] bg-[#F8FAFC] px-4 pt-2 gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {/* TAB 1: INWARDED BOOKLETS */}
            <button
              type="button"
              onClick={() => setActiveTab('scanned')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 shrink-0 ${
                activeTab === 'scanned'
                  ? 'border-[#16A34A] text-[#16A34A] bg-white'
                  : 'border-transparent text-[#64748B] hover:text-[#172033]'
              }`}
            >
              INWARDED ({totalScanned})
            </button>

            {/* TAB 2: NOT INWARDED */}
            <button
              type="button"
              onClick={() => setActiveTab('not_scanned')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 shrink-0 ${
                activeTab === 'not_scanned'
                  ? 'border-[#DC2626] text-[#DC2626] bg-white'
                  : 'border-transparent text-[#64748B] hover:text-[#172033]'
              }`}
            >
              NOT INWARDED ({notScannedCount})
            </button>

            {/* TAB 3: ALL IMPORTED */}
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 shrink-0 ${
                activeTab === 'all'
                  ? 'border-[#1565D8] text-[#1565D8] bg-white'
                  : 'border-transparent text-[#64748B] hover:text-[#172033]'
              }`}
            >
              ALL IMPORTED ({expectedCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="pb-2 w-full sm:w-48">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#64748B]" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search member..."
                className="w-full pl-8 pr-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white focus:outline-hidden focus:border-[#1565D8]"
              />
            </div>
          </div>
        </div>

        {/* Member Records List */}
        <div className="divide-y divide-[#E2E8F0] max-h-[460px] overflow-y-auto">
          {displayedRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No members found in this view.
            </div>
          ) : (
            displayedRecords.map((r, idx) => {
              const isSaved = r.scan_status === 'saved';
              const isPending = r.scan_status === 'pending_save';

              return (
                <div
                  key={r.id || `${r.member_id}_${idx}`}
                  className="p-3 px-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-[#64748B] w-6">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <div className="font-mono font-bold text-xs text-[#172033] flex items-center gap-1.5">
                        {isSaved && <Check className="h-3.5 w-3.5 text-[#16A34A] stroke-[3]" />}
                        {isPending && <Clock className="h-3.5 w-3.5 text-[#D97706]" />}
                        <span>{r.member_id}</span>
                      </div>
                      {r.barcode && (
                        <div className="font-mono text-[10px] text-[#64748B]">
                          Barcode: {r.barcode}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {r.scanned_at && (
                      <span className="text-[11px] text-[#64748B] font-mono hidden sm:inline">
                        {new Date(r.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}

                    {isSaved ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-[10px] font-bold uppercase tracking-wider rounded-md">
                        Inwarded ✓
                      </span>
                    ) : isPending ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-[10px] font-bold uppercase tracking-wider rounded-md">
                        Pending Save
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-[10px] font-bold uppercase tracking-wider rounded-md">
                        NOT INWARDED
                      </span>
                    )}

                    {/* Eye/View icon opens preview */}
                    <button
                      type="button"
                      onClick={() => setViewingRecord(r)}
                      className="p-1.5 hover:bg-slate-200 border border-[#CBD5E1] text-[#1565D8] rounded-md transition-colors cursor-pointer"
                      title="View booklet details"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* SECTION 7: EYE / PREVIEW DETAILS MODAL */}
      {viewingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-sm bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="text-xs font-bold uppercase tracking-wider text-[#172033]">
                Booklet Record Details
              </div>
              <button
                type="button"
                onClick={() => setViewingRecord(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="py-3 space-y-2.5 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Class ID:</span>
                <span className="font-bold text-[#172033]">{viewingRecord.class_id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Unique Member ID (unqid):</span>
                <span className="font-bold text-[#1565D8]">{viewingRecord.member_id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Barcode:</span>
                <span className="font-bold text-[#172033]">{viewingRecord.barcode || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Status:</span>
                <span
                  className={`font-bold uppercase ${
                    viewingRecord.scan_status === 'saved'
                      ? 'text-[#16A34A]'
                      : viewingRecord.scan_status === 'pending_save'
                      ? 'text-[#D97706]'
                      : 'text-[#DC2626]'
                  }`}
                >
                  {viewingRecord.scan_status === 'saved'
                    ? 'Saved ✓'
                    : viewingRecord.scan_status === 'pending_save'
                    ? 'Scanned (Pending Save)'
                    : 'Not Scanned'}
                </span>
              </div>
              {viewingRecord.scanned_by && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B]">Scanned By:</span>
                  <span className="text-[#172033]">{viewingRecord.scanned_by}</span>
                </div>
              )}
              {viewingRecord.scanned_at && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B]">Scanned Time:</span>
                  <span className="text-[#172033]">
                    {new Date(viewingRecord.scanned_at).toLocaleString()}
                  </span>
                </div>
              )}
              {viewingRecord.saved_by && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B]">Saved By:</span>
                  <span className="text-[#172033]">{viewingRecord.saved_by}</span>
                </div>
              )}
              {viewingRecord.saved_at && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B]">Saved Time:</span>
                  <span className="text-[#172033]">
                    {new Date(viewingRecord.saved_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setViewingRecord(null)}
              className="w-full mt-3 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1] cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
