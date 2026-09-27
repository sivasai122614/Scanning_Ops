// ==============================================================================
// ExamScan — Bundle Scan Screen (Sections 6, 7, 8, 9, 10, 11, 12, 13, 14, 18, 20)
// Active Class Bundle Operational Scanning Workspace:
// 1. Header: ← Back to Scan Dashboard | BUNDLE SCAN | CLASS ID: {classId}
// 2. TWO PRIMARY STATISTICS: SCANNED and NOT SCANNED
// 3. Rectangular Camera Scanner with continuous barcode detection
// 4. Critical Validations:
//    - CLASS ID MISMATCH PROTECTION (Section 9)
//    - MEMBER ID VALIDATION (Section 10)
//    - UNIMPORTED BOOKLET DETECTION & MANUAL SCAN (Sections 11 & 12)
//    - DUPLICATE SCAN PROTECTION (Section 14)
//    - RECEIVED CHECKMARK (Section 13)
// 5. Scanned Booklet List with Eye/Preview Modal (Section 7)
// 6. Automatic Not Scanned calculation (Section 8)
// 7. Soft rounded corners (10px–14px / rounded-xl)
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  Search,
  Users,
  FileSpreadsheet,
  Lock,
  Unlock,
  Save,
  Scan,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  CameraOff,
  Upload,
  Eye,
  X,
  AlertOctagon,
  HelpCircle,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  ImportedRecord,
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
  const [records, setRecords] = useState<ImportedRecord[]>([]);

  // Tabs: [ SCANNED ] | [ NOT SCANNED ] | [ ALL IMPORTED ]
  const [activeTab, setActiveTab] = useState<'scanned' | 'not_scanned' | 'all'>('scanned');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals & Notifications
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [scanSuccessToast, setScanSuccessToast] = useState<{
    classId: string;
    memberId: string;
  } | null>(null);

  // Resume camera scanning after error modal dismissed
  const resumeScanning = () => {
    setClassMismatchModal(null);
    setMemberNotFoundModal(null);
    setUnimportedModal(null);
    setAlreadyScannedModal(null);
    setShowManualScanModal(false);
    isProcessingRef.current = false;
    lastScannedCodeRef.current = null;
    if (!cameraActive) {
      startCamera();
    }
  };

  // Section 7: Eye/View Modal for Scanned Booklet Details
  const [viewingRecord, setViewingRecord] = useState<ImportedRecord | null>(null);

  // Section 9: CLASS ID MISMATCH MODAL
  const [classMismatchModal, setClassMismatchModal] = useState<{
    scannedClassId: string;
    barcode: string;
  } | null>(null);

  // Section 10: MEMBER ID NOT FOUND MODAL
  const [memberNotFoundModal, setMemberNotFoundModal] = useState<{
    memberId: string;
    barcode: string;
  } | null>(null);

  // Section 11: UNIMPORTED BOOKLET MODAL
  const [unimportedModal, setUnimportedModal] = useState<{
    classId: string;
    memberId: string;
    barcode: string;
  } | null>(null);

  // Section 14: DUPLICATE BOOKLET / ALREADY SCANNED MODAL
  const [alreadyScannedModal, setAlreadyScannedModal] = useState<{
    memberId: string;
    barcode: string;
  } | null>(null);

  // Section 12: MANUAL SCAN MODAL
  const [showManualScanModal, setShowManualScanModal] = useState(false);
  const [manualClassId, setManualClassId] = useState(classId);
  const [manualMemberId, setManualMemberId] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [showManualConfirmException, setShowManualConfirmException] = useState(false);

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
    const recs = importedService.getRecords(classId);
    setBundle(b);
    setRecords(recs);
  }, [classId]);

  useEffect(() => {
    loadData();
    const unsub = importedService.subscribe(loadData);
    return () => unsub();
  }, [loadData]);

  // Camera initialization for Bundle Scan
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
              handleBarcodeScan(detected.text);
            }
          },
          { throttleMs: 80 }
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

  /**
   * Barcode Scan Processing within active class bundle
   * Enforces Section 9 (Mismatch), Section 10 (Member not found), Section 14 (Duplicate)
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
      const result: ScanResult = await importedService.processBundleScan(classId, code);

      // Section 9: CLASS ID MISMATCH PROTECTION (CRITICAL)
      if (result.isWrongClass) {
        playScanWarningSound();
        setClassMismatchModal({
          scannedClassId: result.detectedClassId || 'UNKNOWN',
          barcode: code,
        });
        return;
      }

      // Section 10: MEMBER ID NOT FOUND
      if (result.isUnknownMember) {
        playScanWarningSound();
        setMemberNotFoundModal({
          memberId: result.detectedMemberId || code,
          barcode: code,
        });
        return;
      }

      // Section 14: DUPLICATE SCAN PROTECTION
      if (result.isDuplicate) {
        playScanWarningSound();
        setAlreadyScannedModal({
          memberId: result.member_id || code,
          barcode: code,
        });
        return;
      }

      // Section 13: VALID BOOKLET -> MARK RECEIVED ✓
      if (result.success && result.member_id) {
        playScanSuccessSound();
        setScanSuccessToast({
          classId,
          memberId: result.member_id,
        });
        setTimeout(() => setScanSuccessToast(null), 2500);
        loadData();
      } else {
        playScanWarningSound();
      }
    } catch (err) {
      console.warn('Scan bundle error:', err);
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

  // Section 12: Manual Scan Submission
  const handleExecuteManualScan = async (forceException: boolean = false) => {
    setManualError(null);
    const cid = manualClassId.trim();
    const mid = manualMemberId.trim();

    if (!cid || !mid) {
      setManualError('Please provide both Class ID and Member ID.');
      return;
    }

    try {
      const res = await importedService.processManualScan(cid, mid, forceException);

      if (res.isAlreadyScanned) {
        setManualError(`ALREADY SCANNED: Member ${mid} has already been received.`);
        return;
      }

      if (res.isUnimported && !forceException) {
        setShowManualConfirmException(true);
        return;
      }

      if (res.success) {
        playScanSuccessSound();
        setShowManualScanModal(false);
        setShowManualConfirmException(false);
        setManualMemberId('');
        setScanSuccessToast({ classId, memberId: mid });
        setTimeout(() => setScanSuccessToast(null), 3000);
        loadData();
      } else {
        setManualError(res.message || 'Failed to process manual scan.');
      }
    } catch (err: any) {
      setManualError(err?.message || 'Error executing manual scan.');
    }
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

  const importedCount = bundle.expectedCount;
  const scannedCount = bundle.receivedCount;
  const notScannedCount = Math.max(0, importedCount - scannedCount);
  const progressPercentage = importedCount > 0 ? Math.round((scannedCount / importedCount) * 100) : 0;
  const is100Percent = importedCount > 0 && scannedCount >= importedCount;

  // Filter lists
  const scannedRecords = records.filter(
    r => r.scan_status === 'started' || r.scan_status === 'completed'
  );
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
    <div className="space-y-4 font-sans max-w-4xl mx-auto pb-24">
      {/* 1. Header (Section 6) */}
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

        {/* Status Badge & Manual Scan Trigger */}
        <div className="flex items-center gap-2">
          {bundle.status === 'COMPLETED' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-xs font-bold uppercase tracking-wider rounded-lg">
              <CheckCircle2 className="h-4 w-4" />
              COMPLETED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#EFF6FF] border border-[#BFDBFE] text-[#1565D8] text-xs font-bold uppercase tracking-wider rounded-lg">
              IN PROGRESS
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setManualClassId(classId);
              setManualMemberId('');
              setManualError(null);
              setShowManualScanModal(true);
            }}
            className="px-3 py-1.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-slate-50 transition-colors"
          >
            Manual Scan
          </button>
        </div>
      </div>

      {/* 2. TWO PRIMARY STATISTICS (Section 6) */}
      <div className="grid grid-cols-2 gap-3">
        {/* PRIMARY STAT 1: SCANNED */}
        <div className="bg-white p-4 border border-[#BFDBFE] rounded-xl shadow-xs bg-[#F8FAFC]">
          <div className="text-[11px] font-bold text-[#1565D8] uppercase tracking-wider">
            SCANNED
          </div>
          <div className="text-3xl font-black text-[#1565D8] font-tabular mt-1">
            {scannedCount}
          </div>
          <div className="text-[11px] text-[#1565D8] mt-1 font-medium">
            {scannedCount} Booklets Received
          </div>
        </div>

        {/* PRIMARY STAT 2: NOT SCANNED */}
        <div className="bg-white p-4 border border-[#FECACA] rounded-xl shadow-xs">
          <div className="text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">
            NOT SCANNED
          </div>
          <div className="text-3xl font-black text-[#DC2626] font-tabular mt-1">
            {notScannedCount}
          </div>
          <div className="text-[11px] text-[#DC2626] mt-1 font-medium">
            Remaining Expected Booklets
          </div>
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className="bg-white p-4 border border-[#CBD5E1] rounded-xl shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#172033]">
            Class {classId} Progress ({scannedCount} / {importedCount} Scanned)
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

      {/* SECTION 20: CLASS COMPLETED BANNER */}
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
                All expected booklets for Class ID {classId} have been received.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. FULL-FRAME CAMERA SCANNER (Clean, spacious, full-frame detection, NO overlays) */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl shadow-xs overflow-hidden">
        {/* Full Camera Viewport - NO fixed boxes, NO red lines, NO text over video */}
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

        {/* Success Feedback State OUTSIDE/BELOW the camera */}
        {scanSuccessToast && (
          <div className="mx-3 mt-3 p-3 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] rounded-xl flex items-center justify-between shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#16A34A] text-white shrink-0">
                <Check className="h-4 w-4 stroke-[3]" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-[#15803D]">
                  ✓ BOOKLET RECEIVED
                </div>
                <div className="font-mono text-sm font-bold text-[#166534]">
                  {scanSuccessToast.classId} • {scanSuccessToast.memberId}
                </div>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold text-[#15803D] bg-white/90 px-2 py-0.5 rounded border border-[#86EFAC]">
              Ready for Next
            </span>
          </div>
        )}

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

        {/* Quick Manual Entry Bar */}
        <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
          <form onSubmit={handleQuickManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={quickManualInput}
              onChange={e => setQuickManualInput(e.target.value)}
              placeholder={`Enter barcode for Class ${classId}...`}
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

      {/* 4. SCANNED BOOKLET RECORDS & LIST TABS (Section 7 & 8) */}
      <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#CBD5E1] bg-[#F8FAFC] px-4 pt-2 gap-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {/* TAB 1: SCANNED BOOKLETS */}
            <button
              type="button"
              onClick={() => setActiveTab('scanned')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 shrink-0 ${
                activeTab === 'scanned'
                  ? 'border-[#16A34A] text-[#16A34A] bg-white'
                  : 'border-transparent text-[#64748B] hover:text-[#172033]'
              }`}
            >
              SCANNED ({scannedCount})
            </button>

            {/* TAB 2: NOT SCANNED */}
            <button
              type="button"
              onClick={() => setActiveTab('not_scanned')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 shrink-0 ${
                activeTab === 'not_scanned'
                  ? 'border-[#DC2626] text-[#DC2626] bg-white'
                  : 'border-transparent text-[#64748B] hover:text-[#172033]'
              }`}
            >
              NOT SCANNED ({notScannedCount})
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
              ALL IMPORTED ({importedCount})
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

        {/* Member Records List (Section 7: Member ID, Scan Time, Status, Eye icon) */}
        <div className="divide-y divide-[#E2E8F0] max-h-[460px] overflow-y-auto">
          {displayedRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No members found in this view.
            </div>
          ) : (
            displayedRecords.map((r, idx) => {
              const isScanned = r.scan_status === 'started' || r.scan_status === 'completed';

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
                        {isScanned && <Check className="h-3.5 w-3.5 text-[#16A34A] stroke-[3]" />}
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

                    {isScanned ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#DCFCE7] border border-[#86EFAC] text-[#166534] text-[10px] font-bold uppercase tracking-wider rounded-md">
                        Received ✓
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-[10px] font-bold uppercase tracking-wider rounded-md">
                        NOT SCANNED
                      </span>
                    )}

                    {/* Section 7: Eye/View icon opens preview */}
                    <button
                      type="button"
                      onClick={() => setViewingRecord(r)}
                      className="p-1.5 hover:bg-slate-200 border border-[#CBD5E1] text-[#1565D8] rounded-md transition-colors"
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
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
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
                <span className="text-[#64748B]">Member ID:</span>
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
                    viewingRecord.scan_status === 'started' || viewingRecord.scan_status === 'completed'
                      ? 'text-[#16A34A]'
                      : 'text-[#DC2626]'
                  }`}
                >
                  {viewingRecord.scan_status === 'started' || viewingRecord.scan_status === 'completed'
                    ? 'Received ✓'
                    : 'Not Scanned'}
                </span>
              </div>
              {viewingRecord.scanned_at && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-[#64748B]">Scan Time:</span>
                  <span className="text-[#172033]">
                    {new Date(viewingRecord.scanned_at).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setViewingRecord(null)}
              className="w-full mt-3 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* SECTION 9: CLASS ID MISMATCH WARNING MODAL (CRITICAL) */}
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
              You are currently scanning:{' '}
              <strong className="font-mono text-sm bg-blue-100 text-[#1565D8] px-2 py-0.5 rounded border border-blue-300">
                {classId}
              </strong>
            </div>

            <div className="text-xs text-[#7F1D1D] mt-1 leading-relaxed">
              But this booklet belongs to:{' '}
              <strong className="font-mono text-sm bg-red-100 text-[#DC2626] px-2 py-0.5 rounded border border-red-300">
                {classMismatchModal.scannedClassId}
              </strong>
            </div>

            <div className="text-xs font-mono text-[#64748B] bg-slate-100 p-2 border border-slate-200 rounded-lg mt-3">
              Barcode: {classMismatchModal.barcode}
            </div>

            <div className="text-xs text-[#7F1D1D] mt-3 mb-4 font-semibold">
              This booklet has NOT been marked as received.
              <span className="block mt-1 font-normal">
                Please scan a booklet belonging to Class ID {classId}.
              </span>
            </div>

            <button
              type="button"
              onClick={resumeScanning}
              className="w-full py-2.5 bg-[#1565D8] text-white text-xs font-bold hover:bg-[#0D47A1] transition-colors uppercase tracking-wider rounded-lg cursor-pointer"
            >
              SCAN AGAIN
            </button>
          </div>
        </div>
      )}

      {/* SECTION 10: MEMBER ID NOT FOUND MODAL */}
      {memberNotFoundModal && (
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
                <span className="font-mono font-bold text-[#172033]">{classId}</span>
              </div>
              <div className="bg-[#FEE2E2] p-2 border border-[#FECACA] rounded-lg">
                <span className="text-[#991B1B] block text-[10px] uppercase font-bold">Member ID</span>
                <span className="font-mono font-bold text-[#991B1B]">
                  {memberNotFoundModal.memberId}
                </span>
              </div>
            </div>

            <div className="text-xs text-[#7F1D1D] mb-4">
              This Member ID was not found in the imported Excel data for Class ID {classId}.
              <span className="block mt-1 font-semibold">The booklet has NOT been marked as received.</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resumeScanning}
                className="flex-1 py-2.5 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider rounded-lg cursor-pointer"
              >
                SCAN AGAIN
              </button>
              <button
                type="button"
                onClick={() => {
                  const mId = memberNotFoundModal.memberId;
                  resumeScanning();
                  setManualClassId(classId);
                  setManualMemberId(mId);
                  setShowManualScanModal(true);
                }}
                className="flex-1 py-2.5 bg-[#1565D8] text-white text-xs font-bold hover:bg-[#0D47A1] transition-colors uppercase tracking-wider rounded-lg cursor-pointer"
              >
                MANUAL SCAN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 14: ALREADY SCANNED / DUPLICATE BOOKLET MODAL */}
      {alreadyScannedModal && (
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
                {alreadyScannedModal.memberId}
              </strong>
              <div className="mt-1 font-semibold">
                This booklet was already received. Count remains unchanged.
              </div>
            </div>

            <button
              type="button"
              onClick={resumeScanning}
              className="w-full py-2.5 bg-[#D97706] text-white text-xs font-bold hover:bg-[#B45309] transition-colors uppercase tracking-wider rounded-lg cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* SECTION 12: MANUAL SCAN MODAL */}
      {showManualScanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-md bg-white border border-[#CBD5E1] rounded-2xl shadow-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="text-xs font-bold uppercase tracking-wider text-[#172033]">
                MANUAL SCAN INTAKE
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowManualScanModal(false);
                  setShowManualConfirmException(false);
                }}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="py-3 space-y-3">
              {manualError && (
                <div className="p-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg text-xs text-[#991B1B]">
                  {manualError}
                </div>
              )}

              {showManualConfirmException && (
                <div className="p-3 bg-[#FEF3C7] border border-[#FDE68A] rounded-xl text-xs text-[#92400E]">
                  <div className="font-bold uppercase tracking-wider mb-1">UNIMPORTED BOOKLET</div>
                  This booklet does not exist in the imported Excel data. Confirm adding it as an exception?
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleExecuteManualScan(true)}
                      className="px-3 py-1.5 bg-[#D97706] text-white font-bold rounded-lg text-xs"
                    >
                      CONFIRM EXCEPTION
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManualConfirmException(false)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}

              {!showManualConfirmException && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-[#64748B] uppercase mb-1">
                      Class ID
                    </label>
                    <input
                      type="text"
                      value={manualClassId}
                      onChange={e => setManualClassId(e.target.value)}
                      className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#172033]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#64748B] uppercase mb-1">
                      Member ID
                    </label>
                    <input
                      type="text"
                      value={manualMemberId}
                      onChange={e => setManualMemberId(e.target.value)}
                      placeholder="e.g. 22MIS001"
                      className="w-full px-3 py-2 border border-[#CBD5E1] rounded-lg text-xs font-mono text-[#172033]"
                    />
                  </div>
                </>
              )}
            </div>

            {!showManualConfirmException && (
              <div className="flex items-center gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowManualScanModal(false)}
                  className="flex-1 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold uppercase tracking-wider rounded-lg"
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => handleExecuteManualScan(false)}
                  className="flex-1 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1]"
                >
                  PROCESS SCAN
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
