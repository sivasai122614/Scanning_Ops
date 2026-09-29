// ==============================================================================
// ExamScan — Mobile Scan Screen (Mobile Only Viewport)
// Implements:
// STAGE 1 — CLASS ID DETECTION (CLASS_MODE):
//   - Camera scans only Class ID
//   - Input placeholder: "Enter Class ID", Button: "OPEN CLASS"
//   - Validates class in imported_inward_data
//   - Opens Class Bundle -> switches to MEMBER_MODE
// STAGE 2 — MEMBER ID DETECTION (MEMBER_MODE):
//   - Camera scans only Member ID
//   - Input placeholder: "Enter Member ID", Button: "INWARD"
//   - Manual Inward inserts into public.manual_inward_data
//   - Validates member belongs to active class
//   - Duplicate protection: "Member already inwarded"
//   - Immediate bundle count update (Inwarded, Not Inwarded, Progress)
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Building,
  CheckCircle2,
  AlertTriangle,
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
  ArrowLeft,
  Search,
  Scan as ScanIcon,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  SessionSummary,
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

interface MobileScanningViewProps {
  onNavigateToImport?: () => void;
  onNavigateToSessions?: () => void;
}

export type ScannerMode = 'CLASS_MODE' | 'MEMBER_MODE';

export const MobileScanningView: React.FC<MobileScanningViewProps> = ({
  onNavigateToImport,
}) => {
  const [scannerMode, setScannerMode] = useState<ScannerMode>('CLASS_MODE');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  // Data states
  const [bundles, setBundles] = useState<ClassBundle[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [hasImportedData, setHasImportedData] = useState<boolean>(false);
  const [bundleRecords, setBundleRecords] = useState<BundleRecordView[]>([]);

  // Member mode tabs: 'inwarded' | 'not_inwarded' | 'all'
  const [memberTab, setMemberTab] = useState<'inwarded' | 'not_inwarded' | 'all'>('inwarded');
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('');

  // Manual input state
  const [manualInput, setManualInput] = useState<string>('');
  const [isSubmittingManual, setIsSubmittingManual] = useState<boolean>(false);

  // Success & notification toasts
  const [successToast, setSuccessToast] = useState<{
    title: string;
    message: string;
    type?: 'inward' | 'class';
  } | null>(null);

  // Error Modals
  const [classNotFoundModal, setClassNotFoundModal] = useState<{
    classId: string;
  } | null>(null);

  const [wrongClassModal, setWrongClassModal] = useState<{
    currentClass: string;
    detectedClass: string;
    memberId?: string;
  } | null>(null);

  const [memberNotFoundModal, setMemberNotFoundModal] = useState<{
    classId: string;
    memberId: string;
  } | null>(null);

  const [duplicateModal, setDuplicateModal] = useState<{
    classId: string;
    memberId: string;
  } | null>(null);

  // Camera States
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraResultRef = useRef<CameraStreamResult | null>(null);
  const scannerControllerRef = useRef<{ stop: () => void } | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active bundle for currently selected class
  const activeBundle = selectedClassId ? importedService.getClassBundle(selectedClassId) : null;

  const loadData = useCallback(() => {
    const hasData = importedService.hasImportedData();
    setHasImportedData(hasData);
    const bList = importedService.getClassBundles();
    const sum = importedService.getSessionSummary();
    setBundles(bList);
    setSessionSummary(sum);

    if (selectedClassId) {
      const recs = importedService.getBundleRecordViews(selectedClassId);
      setBundleRecords(recs);
    } else {
      setBundleRecords([]);
    }
  }, [selectedClassId]);

  useEffect(() => {
    loadData();
    const unsub = importedService.subscribe(loadData);
    return () => unsub();
  }, [loadData]);

  // When class changes in MEMBER_MODE, fetch fresh member records
  useEffect(() => {
    if (selectedClassId) {
      importedService.fetchClassMembers(selectedClassId).then(() => {
        loadData();
      });
    }
  }, [selectedClassId, loadData]);

  // Camera start / stop lifecycle
  useEffect(() => {
    if (hasImportedData) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [hasImportedData, selectedDeviceId]);

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
      console.warn('[MobileScanner] Stop camera error:', e);
    }
    setCameraActive(false);
    setCameraLoading(false);
    setTorchOn(false);
  };

  const startCamera = async () => {
    if (!importedService.hasImportedData()) {
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
              handleCameraBarcodeScan(detected.text);
            }
          },
          { throttleMs: 80 }
        );
        scannerControllerRef.current = controller;
      }

      setCameraActive(true);
      setCameraLoading(false);
    } catch (err: any) {
      console.warn('[MobileScanner] Camera start error:', err);
      setCameraLoading(false);
      setCameraActive(false);
      setCameraError(err?.message || 'Camera is in standby. Enter identifier manually below.');
    }
  };

  const dismissModals = () => {
    setClassNotFoundModal(null);
    setWrongClassModal(null);
    setMemberNotFoundModal(null);
    setDuplicateModal(null);
    isProcessingRef.current = false;
    lastScannedCodeRef.current = null;
  };

  // Open a Class Bundle and transition to MEMBER_MODE
  const openClassBundle = (classId: string) => {
    setSelectedClassId(classId);
    setScannerMode('MEMBER_MODE');
    setManualInput('');
    setMemberTab('inwarded');
    dismissModals();
    setSuccessToast({
      title: `CLASS ${classId} OPENED`,
      message: `Now in Member Scanning mode for Class ${classId}.`,
      type: 'class',
    });
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Exit back to CLASS_MODE
  const backToClassSelection = () => {
    setSelectedClassId(null);
    setScannerMode('CLASS_MODE');
    setManualInput('');
    dismissModals();
  };

  // ==============================================================================
  // STAGE 1 CAMERA SCAN: Detect Class ID
  // ==============================================================================
  const handleStage1ClassScan = async (code: string) => {
    const val = await importedService.validateClassId(code);
    if (val.exists) {
      playScanSuccessSound();
      openClassBundle(val.classId);
    } else {
      playScanWarningSound();
      setClassNotFoundModal({ classId: code });
    }
  };

  // ==============================================================================
  // STAGE 2 CAMERA SCAN: Detect Member ID
  // ==============================================================================
  const handleStage2MemberScan = async (code: string) => {
    if (!selectedClassId) return;

    const result: ScanResult = await importedService.processMobileMemberBarcodeScan(selectedClassId, code);

    if (result.isWrongClass) {
      playScanWarningSound();
      setWrongClassModal({
        currentClass: selectedClassId,
        detectedClass: result.detectedClassId || 'Other Class',
        memberId: result.detectedMemberId || code,
      });
      return;
    }

    if (result.isUnknownMember) {
      playScanWarningSound();
      setMemberNotFoundModal({
        classId: selectedClassId,
        memberId: result.detectedMemberId || code,
      });
      return;
    }

    if (result.isDuplicate) {
      playScanWarningSound();
      setDuplicateModal({
        classId: selectedClassId,
        memberId: result.member_id || code,
      });
      return;
    }

    if (result.success && result.member_id) {
      playScanSuccessSound();
      loadData();
      setSuccessToast({
        title: 'MEMBER INWARDED',
        message: `Member ID: ${result.member_id} successfully inwarded.`,
        type: 'inward',
      });
      setTimeout(() => setSuccessToast(null), 3000);
    }
  };

  // Router for Camera Scan depending on current Scanner Mode
  const handleCameraBarcodeScan = async (rawCode: string) => {
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
      if (scannerMode === 'CLASS_MODE') {
        await handleStage1ClassScan(code);
      } else {
        await handleStage2MemberScan(code);
      }
    } catch (e) {
      console.warn('[MobileScanner] scan error:', e);
    } finally {
      isProcessingRef.current = false;
    }
  };

  // ==============================================================================
  // MANUAL BARCODE / IDENTIFIER ENTRY
  // Context-aware: CLASS_MODE vs MEMBER_MODE
  // Manual Inward inserts strictly into public.manual_inward_data
  // ==============================================================================
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputVal = manualInput.trim();
    if (!inputVal) return;

    setIsSubmittingManual(true);

    try {
      // ----------------------------------------------------
      // CASE 1: CLASS_MODE — Input is for CLASS ID ONLY
      // ----------------------------------------------------
      if (scannerMode === 'CLASS_MODE') {
        const val = await importedService.validateClassId(inputVal);
        if (val.exists) {
          playScanSuccessSound();
          openClassBundle(val.classId);
        } else {
          playScanWarningSound();
          setClassNotFoundModal({ classId: inputVal });
        }
      }
      // ----------------------------------------------------
      // CASE 2: MEMBER_MODE — Input is for MEMBER ID ONLY
      // Validates against imported_inward_data WHERE class_id = selectedClassId AND member_id = enteredMemberId
      // Inserts strictly into public.manual_inward_data
      // ----------------------------------------------------
      else if (scannerMode === 'MEMBER_MODE' && selectedClassId) {
        // Validate against imported data
        const validation = await importedService.validateMemberForClass(selectedClassId, inputVal);

        if (validation.status === 'WRONG_CLASS') {
          playScanWarningSound();
          setWrongClassModal({
            currentClass: selectedClassId,
            detectedClass: validation.actualClassId || 'Other Class',
            memberId: inputVal,
          });
          return;
        }

        if (validation.status === 'NOT_FOUND') {
          playScanWarningSound();
          setMemberNotFoundModal({
            classId: selectedClassId,
            memberId: inputVal,
          });
          return;
        }

        // Duplicate Check
        if (importedService.isMemberAlreadyInwarded(selectedClassId, inputVal)) {
          playScanWarningSound();
          setDuplicateModal({
            classId: selectedClassId,
            memberId: inputVal,
          });
          return;
        }

        // Insert into public.manual_inward_data
        const res = await importedService.recordManualInward(selectedClassId, inputVal);

        if (res.success && res.record) {
          playScanSuccessSound();
          setManualInput('');
          loadData();
          setSuccessToast({
            title: 'MANUAL INWARD SAVED',
            message: `Member ${inputVal} recorded in manual_inward_data for Class ${selectedClassId}.`,
            type: 'inward',
          });
          setTimeout(() => setSuccessToast(null), 3500);
        } else {
          playScanWarningSound();
          alert(res.error || 'Failed to record manual inward.');
        }
      }
    } catch (err: any) {
      console.warn('Manual submit error:', err);
      alert('Error during processing: ' + (err?.message || 'unknown error'));
    } finally {
      setIsSubmittingManual(false);
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
        handleCameraBarcodeScan(decoded.text);
      } else {
        alert('Could not decode a barcode from the photo. Please enter identifier manually.');
      }
    } catch (err: any) {
      alert('Failed to read image file: ' + (err?.message || 'unknown error'));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Today's formatted date
  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const universityName = sessionSummary?.universityName || importedService.getActiveUniversity();

  // Statistics
  const totalClasses = sessionSummary?.totalClasses || bundles.length;
  const totalExpected = sessionSummary?.totalExpected || 0;
  const totalInwarded = sessionSummary?.totalSaved || 0;
  const totalNotInwarded = Math.max(0, totalExpected - totalInwarded);

  // Active bundle stats (MEMBER_MODE)
  const bundleExpected = activeBundle?.expectedCount || 0;
  const bundleInwarded = activeBundle?.savedCount || 0;
  const bundlePending = activeBundle?.pendingCount || 0;
  const bundleTotalInwarded = bundleInwarded + bundlePending;
  const bundleNotInwarded = Math.max(0, bundleExpected - bundleTotalInwarded);
  const bundleProgress = bundleExpected > 0 ? Math.round((bundleTotalInwarded / bundleExpected) * 100) : 0;

  // Filtered member records for active bundle
  const filteredMemberRecords = bundleRecords.filter(r => {
    if (memberSearch.trim()) {
      const q = memberSearch.trim().toLowerCase();
      const matchMid = r.member_id.toLowerCase().includes(q);
      const matchBar = r.barcode && r.barcode.toLowerCase().includes(q);
      if (!matchMid && !matchBar) return false;
    }
    if (memberTab === 'inwarded') {
      return r.scan_status === 'saved' || r.scan_status === 'pending_save';
    }
    if (memberTab === 'not_inwarded') {
      return r.scan_status === 'not_started';
    }
    return true; // 'all'
  });

  const inwardedListCount = bundleRecords.filter(r => r.scan_status === 'saved' || r.scan_status === 'pending_save').length;
  const notInwardedListCount = bundleRecords.filter(r => r.scan_status === 'not_started').length;

  // ==============================================================================
  // BLOCKING STATE: NO IMPORTED DATA
  // ==============================================================================
  if (!hasImportedData || bundles.length === 0) {
    return (
      <div className="space-y-4 font-sans max-w-md mx-auto pb-24 px-3 pt-2">
        <div className="bg-white p-3 border border-[#CBD5E1] rounded-xl shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#172033]">
            <CalendarIcon className="h-4 w-4 text-[#1565D8]" />
            <span>{todayStr}</span>
          </div>
          {universityName ? (
            <div className="text-xs text-[#64748B] font-medium flex items-center gap-1.5">
              <Building className="h-3.5 w-3.5 text-[#64748B]" />
              <span className="font-bold text-[#172033]">{universityName}</span>
            </div>
          ) : null}
        </div>

        <div className="bg-white border-2 border-[#CBD5E1] rounded-2xl shadow-sm p-6 text-center mt-4">
          <div className="flex h-14 w-14 items-center justify-center bg-[#EFF6FF] text-[#1565D8] rounded-2xl mx-auto mb-3 border border-[#BFDBFE]">
            <FileSpreadsheet className="h-7 w-7" />
          </div>

          <h2 className="text-lg font-black text-[#172033] uppercase tracking-wide">
            IMPORT DATA FIRST
          </h2>
          <div className="text-xs font-bold text-[#DC2626] uppercase tracking-wider mt-1">
            NO IMPORTED DATA
          </div>
          <p className="text-xs text-[#64748B] mt-2.5 leading-relaxed">
            Please import your Excel data before starting booklet scanning.
            The camera scanner and barcode detection will be enabled once your Class ID and Member ID dataset is imported.
          </p>

          <div className="mt-5">
            {onNavigateToImport && (
              <button
                type="button"
                onClick={onNavigateToImport}
                className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>GO TO IMPORT</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==============================================================================
  // ACTIVE MOBILE SCAN SCREEN (STAGE 1 OR STAGE 2)
  // ==============================================================================
  return (
    <div className="space-y-3.5 font-sans max-w-md mx-auto pb-28 px-3 pt-2">
      {/* 1. Header & Active Mode Indicator */}
      <div className="bg-white p-3 border border-[#CBD5E1] rounded-xl shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#172033]">
            <CalendarIcon className="h-4 w-4 text-[#1565D8]" />
            <span>{todayStr}</span>
          </div>

          {/* Mode Pill Indicator */}
          <div
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
              scannerMode === 'CLASS_MODE'
                ? 'bg-blue-50 text-[#1565D8] border-blue-200'
                : 'bg-emerald-50 text-[#16A34A] border-emerald-200'
            }`}
          >
            {scannerMode === 'CLASS_MODE' ? 'STAGE 1: CLASS ID' : 'STAGE 2: MEMBER ID'}
          </div>
        </div>

        {universityName && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-100 flex items-center gap-1.5 text-xs text-[#64748B]">
            <Building className="h-3.5 w-3.5 text-[#64748B]" />
            <span className="font-bold text-[#172033]">{universityName}</span>
          </div>
        )}
      </div>

      {/* MEMBER_MODE BANNER: Active Class ID */}
      {scannerMode === 'MEMBER_MODE' && selectedClassId && (
        <div className="bg-[#1565D8] text-white p-3 rounded-xl shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase font-bold text-blue-200 tracking-wider">
              CURRENT CLASS BUNDLE
            </div>
            <div className="text-base font-black font-mono tracking-wide">
              CLASS {selectedClassId}
            </div>
          </div>
          <button
            type="button"
            onClick={backToClassSelection}
            className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors border border-white/20 flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Change Class</span>
          </button>
        </div>
      )}

      {/* Success / Notification Toasts */}
      {successToast && (
        <div
          className={`p-3 border text-xs font-bold rounded-xl flex items-center gap-2.5 shadow-xs animate-in fade-in duration-150 ${
            successToast.type === 'class'
              ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
              : 'bg-[#DCFCE7] border-[#86EFAC] text-[#166534]'
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <div>
            <div className="text-[11px] font-black uppercase tracking-wider">{successToast.title}</div>
            <div className="text-[11px] font-normal mt-0.5">{successToast.message}</div>
          </div>
        </div>
      )}

      {/* Statistics Row: Updates immediately */}
      {scannerMode === 'CLASS_MODE' ? (
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white p-2.5 border border-[#CBD5E1] rounded-xl text-center shadow-xs">
            <div className="text-[9px] font-bold text-[#64748B] uppercase">CLASSES</div>
            <div className="text-base font-black text-[#172033] font-tabular mt-0.5">{totalClasses}</div>
          </div>
          <div className="bg-white p-2.5 border border-[#CBD5E1] rounded-xl text-center shadow-xs">
            <div className="text-[9px] font-bold text-[#64748B] uppercase">EXPECTED</div>
            <div className="text-base font-black text-[#172033] font-tabular mt-0.5">{totalExpected}</div>
          </div>
          <div className="bg-[#F0FDF4] p-2.5 border border-[#BBF7D0] rounded-xl text-center shadow-xs">
            <div className="text-[9px] font-bold text-[#16A34A] uppercase">INWARDED</div>
            <div className="text-base font-black text-[#16A34A] font-tabular mt-0.5">{totalInwarded}</div>
          </div>
          <div className="bg-white p-2.5 border border-[#CBD5E1] rounded-xl text-center shadow-xs">
            <div className="text-[9px] font-bold text-[#DC2626] uppercase">NOT INWARDED</div>
            <div className="text-base font-black text-[#DC2626] font-tabular mt-0.5">{totalNotInwarded}</div>
          </div>
        </div>
      ) : (
        /* MEMBER_MODE Class Bundle Statistics */
        <div className="bg-white p-3 border border-[#CBD5E1] rounded-xl shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-[#172033]">
            <span>Class {selectedClassId} Statistics</span>
            <span className="font-mono text-xs text-[#16A34A] font-black">
              {bundleTotalInwarded} / {bundleExpected} ({bundleProgress}%)
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
              <div className="text-[9px] font-bold text-[#64748B] uppercase">Expected</div>
              <div className="text-sm font-black text-[#172033] font-mono">{bundleExpected}</div>
            </div>
            <div className="bg-[#F0FDF4] p-2 border border-[#BBF7D0] rounded-lg">
              <div className="text-[9px] font-bold text-[#16A34A] uppercase">Inwarded</div>
              <div className="text-sm font-black text-[#16A34A] font-mono">{bundleTotalInwarded}</div>
            </div>
            <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
              <div className="text-[9px] font-bold text-[#DC2626] uppercase">Not Inwarded</div>
              <div className="text-sm font-black text-[#DC2626] font-mono">{bundleNotInwarded}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 mt-1">
            <div
              className="h-full bg-[#16A34A] rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, bundleProgress)}%` }}
            />
          </div>
        </div>
      )}

      {/* 2. CAMERA VIEWFINDER */}
      <div className="bg-white border border-[#CBD5E1] rounded-2xl shadow-xs overflow-hidden">
        {/* Mode Header over Camera */}
        <div className="px-3 py-2 bg-[#0F172A] text-white flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold">
            <ScanIcon className="h-4 w-4 text-[#60A5FA]" />
            <span>
              {scannerMode === 'CLASS_MODE' ? 'Scan Class ID' : `Scan Member ID (Class ${selectedClassId})`}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {cameraActive ? 'CAMERA ACTIVE' : 'STANDBY'}
          </span>
        </div>

        {/* Viewport */}
        <div className="relative bg-black w-full aspect-4/3 min-h-[260px] max-h-[40vh] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />

          {cameraLoading && (
            <div className="text-center text-white px-4">
              <div className="h-7 w-7 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-2" />
              <div className="text-xs font-bold uppercase tracking-wider">Starting Camera...</div>
            </div>
          )}

          {!cameraActive && !cameraLoading && (
            <div className="text-center text-white/80 p-5">
              <CameraOff className="h-8 w-8 mx-auto mb-2 text-white/50" />
              <div className="text-xs font-bold text-white mb-1">Camera Paused</div>
              <div className="text-[11px] text-white/70 max-w-xs mx-auto mb-3">
                {cameraError || 'Tap below to scan or enter barcode manually.'}
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-1.5 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#0D47A1] transition-colors cursor-pointer"
              >
                Start Camera
              </button>
            </div>
          )}
        </div>

        {/* Camera Controls toolbar */}
        <div className="p-2.5 bg-white border-t border-[#E2E8F0] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {hasTorch && (
              <button
                type="button"
                onClick={handleToggleTorch}
                className={`p-2 text-xs font-bold rounded-lg border transition-colors flex items-center gap-1 ${
                  torchOn
                    ? 'bg-[#F59E0B] text-black border-[#D97706]'
                    : 'bg-slate-50 text-[#172033] border-[#CBD5E1]'
                }`}
                title="Flashlight"
              >
                {torchOn ? <Flashlight className="h-3.5 w-3.5" /> : <FlashlightOff className="h-3.5 w-3.5" />}
              </button>
            )}

            {availableDevices.length > 1 && (
              <button
                type="button"
                onClick={handleCycleCamera}
                className="p-2 text-xs font-bold rounded-lg border border-[#CBD5E1] bg-slate-50 text-[#172033]"
                title="Switch Lens"
              >
                <SwitchCamera className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div>
            {cameraActive ? (
              <button
                type="button"
                onClick={stopCamera}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-[#CBD5E1] text-[#64748B]"
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[#1565D8] text-white"
              >
                Start Camera
              </button>
            )}
          </div>
        </div>

        {/* 3. DYNAMIC CONTEXT-AWARE MANUAL INPUT BAR */}
        <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
          <div className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>
              {scannerMode === 'CLASS_MODE' ? 'Manual Class ID Entry' : `Manual Inward into Class ${selectedClassId}`}
            </span>
            <span className="text-[9px] text-[#1565D8] font-normal">
              {scannerMode === 'CLASS_MODE' ? 'Stage 1' : 'Stage 2'}
            </span>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder={
                scannerMode === 'CLASS_MODE' ? 'Enter Class ID' : 'Enter Member ID'
              }
              className="flex-1 px-3 py-2 border border-[#CBD5E1] rounded-lg text-xs text-[#172033] bg-white focus:outline-hidden focus:border-[#1565D8] font-mono uppercase"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />

            <button
              type="submit"
              disabled={isSubmittingManual || !manualInput.trim()}
              className={`px-4 py-2 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shrink-0 cursor-pointer disabled:opacity-50 ${
                scannerMode === 'CLASS_MODE'
                  ? 'bg-[#1565D8] hover:bg-[#0D47A1]'
                  : 'bg-[#16A34A] hover:bg-[#15803D]'
              }`}
            >
              {scannerMode === 'CLASS_MODE' ? 'OPEN CLASS' : 'INWARD'}
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
              className="px-2.5 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold rounded-lg hover:bg-slate-100 shrink-0"
              title="Upload photo"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>

      {/* 4. CONTENT AREA: CLASS LIST (CLASS_MODE) VS MEMBER LIST (MEMBER_MODE) */}
      {scannerMode === 'CLASS_MODE' ? (
        /* STAGE 1: CLASS-WISE BUNDLES */
        <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
          <div className="p-3 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#172033] flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-[#1565D8]" />
              <span>CLASS-WISE BUNDLES</span>
              <span className="px-1.5 py-0.5 bg-blue-50 text-[#1565D8] border border-blue-200 rounded font-mono text-[10px]">
                {bundles.length}
              </span>
            </h2>

            {/* Quick Class Filter */}
            <input
              type="text"
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              placeholder="Filter Class..."
              className="px-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white w-28 text-[#172033]"
            />
          </div>

          <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
            {bundles
              .filter(b => !classFilter.trim() || b.classId.toLowerCase().includes(classFilter.trim().toLowerCase()))
              .map(b => {
                let badgeColor = 'bg-slate-100 text-slate-700 border-slate-300';
                if (b.status === 'COMPLETED') {
                  badgeColor = 'bg-[#DCFCE7] text-[#166534] border-[#86EFAC]';
                } else if (b.status === 'IN PROGRESS') {
                  badgeColor = 'bg-[#EFF6FF] text-[#1D4ED8] border-[#93C5FD]';
                }

                return (
                  <div
                    key={b.classId}
                    onClick={() => openClassBundle(b.classId)}
                    className="p-3 hover:bg-blue-50/50 transition-colors cursor-pointer flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-[#172033]">
                          CLASS {b.classId}
                        </span>
                        <span className={`px-1.5 py-0.2 text-[9px] font-bold uppercase rounded border ${badgeColor}`}>
                          {b.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#64748B] mt-1 flex items-center gap-2 font-tabular">
                        <span>Exp: <strong className="text-[#172033]">{b.expectedCount}</strong></span>
                        <span>•</span>
                        <span>Inwarded: <strong className="text-[#16A34A]">{b.savedCount + b.pendingCount}</strong></span>
                        <span>•</span>
                        <span>Pending: <strong className="text-[#DC2626]">{b.missingCount}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-[#16A34A]">
                        {b.progressPercentage}%
                      </span>
                      <ArrowRight className="h-4 w-4 text-[#1565D8]" />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        /* STAGE 2: MEMBER TABS (INWARDED / NOT INWARDED) FOR ACTIVE CLASS */
        <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
          {/* Member Tabs */}
          <div className="flex items-center border-b border-[#CBD5E1] bg-[#F8FAFC] px-2 pt-1 gap-1">
            <button
              type="button"
              onClick={() => setMemberTab('inwarded')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 shrink-0 ${
                memberTab === 'inwarded'
                  ? 'border-[#16A34A] text-[#16A34A] bg-white'
                  : 'border-transparent text-[#64748B]'
              }`}
            >
              Inwarded ({inwardedListCount})
            </button>

            <button
              type="button"
              onClick={() => setMemberTab('not_inwarded')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 shrink-0 ${
                memberTab === 'not_inwarded'
                  ? 'border-[#DC2626] text-[#DC2626] bg-white'
                  : 'border-transparent text-[#64748B]'
              }`}
            >
              Not Inwarded ({notInwardedListCount})
            </button>

            <button
              type="button"
              onClick={() => setMemberTab('all')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 shrink-0 ${
                memberTab === 'all'
                  ? 'border-[#1565D8] text-[#1565D8] bg-white'
                  : 'border-transparent text-[#64748B]'
              }`}
            >
              All ({bundleRecords.length})
            </button>
          </div>

          {/* Search bar inside tab */}
          <div className="p-2 border-b border-slate-100 bg-white">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#64748B]" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search member..."
                className="w-full pl-8 pr-2 py-1 text-xs border border-[#CBD5E1] rounded-lg bg-white text-[#172033]"
              />
            </div>
          </div>

          {/* Member List */}
          <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
            {filteredMemberRecords.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#64748B]">
                No members found in this view.
              </div>
            ) : (
              filteredMemberRecords.map(r => {
                const isInwarded = r.scan_status === 'saved' || r.scan_status === 'pending_save';
                const isManual = r.scanned_by?.includes('Manual') || r.saved_by?.includes('Manual');

                return (
                  <div key={r.id} className="p-2.5 hover:bg-slate-50 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-mono font-bold text-[#172033] flex items-center gap-1.5">
                        <span>{r.member_id}</span>
                        {isManual && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-sans font-bold border border-amber-300">
                            Manual Inward
                          </span>
                        )}
                      </div>
                      {r.barcode && (
                        <div className="text-[10px] font-mono text-[#64748B]">
                          Barcode: {r.barcode}
                        </div>
                      )}
                    </div>

                    <div>
                      {isInwarded ? (
                        <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] rounded-full text-[10px] font-bold uppercase">
                          Inwarded
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-300 rounded-full text-[10px] font-bold uppercase">
                          Not Inwarded
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* ERROR MODALS */}
      {/* ============================================================================== */}

      {/* 1. CLASS ID NOT FOUND */}
      {classNotFoundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-sm bg-white border border-[#FECACA] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white rounded-xl mx-auto mb-3">
              <AlertOctagon className="h-6 w-6" />
            </div>

            <div className="text-base font-extrabold uppercase text-[#991B1B]">
              Class ID not found
            </div>

            <div className="text-xs text-[#7F1D1D] mt-2 mb-2">
              Entered Class ID:
            </div>
            <div className="font-mono text-base font-black text-[#991B1B] bg-red-50 py-1 px-3 rounded-lg border border-red-200 inline-block mb-3">
              {classNotFoundModal.classId}
            </div>

            <div className="text-xs text-[#64748B] mb-5">
              No matching records exist in the imported Excel data for this Class ID.
            </div>

            <button
              type="button"
              onClick={dismissModals}
              className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* 2. MEMBER BELONGS TO ANOTHER CLASS */}
      {wrongClassModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-sm bg-white border border-[#FECACA] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white rounded-xl mx-auto mb-3">
              <AlertOctagon className="h-6 w-6" />
            </div>

            <div className="text-base font-extrabold uppercase text-[#991B1B]">
              Member belongs to another Class
            </div>

            <div className="text-xs text-[#7F1D1D] mt-3 space-y-2">
              <div>
                CURRENT SELECTED CLASS:
                <div className="font-mono text-sm font-bold bg-blue-100 text-[#1565D8] px-2 py-0.5 rounded border border-blue-200 mt-0.5">
                  {wrongClassModal.currentClass}
                </div>
              </div>

              <div>
                ACTUAL CLASS:
                <div className="font-mono text-sm font-bold bg-red-100 text-[#DC2626] px-2 py-0.5 rounded border border-red-200 mt-0.5">
                  {wrongClassModal.detectedClass}
                </div>
              </div>
            </div>

            <div className="text-xs text-[#7F1D1D] mt-3 mb-5 font-semibold">
              This member cannot be inwarded into Class {wrongClassModal.currentClass}.
            </div>

            <button
              type="button"
              onClick={dismissModals}
              className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* 3. MEMBER ID NOT FOUND IN THIS CLASS */}
      {memberNotFoundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-sm bg-white border border-[#FECACA] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#EF4444] text-white rounded-xl mx-auto mb-3">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div className="text-base font-extrabold uppercase text-[#991B1B]">
              Not Imported
            </div>

            <div className="my-3 text-xs space-y-1">
              <div className="font-mono text-sm font-bold text-[#172033] bg-slate-100 p-1.5 rounded border border-slate-200">
                {memberNotFoundModal.memberId}
              </div>
              <div className="text-[#64748B]">
                Class: <strong className="text-[#172033]">{memberNotFoundModal.classId}</strong>
              </div>
            </div>

            <div className="text-xs text-[#7F1D1D] mb-5">
              This barcode was not found in the imported dataset.
            </div>

            <button
              type="button"
              onClick={dismissModals}
              className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}

      {/* 4. MEMBER ALREADY INWARDED */}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 font-sans">
          <div className="w-full max-w-sm bg-white border border-[#FDE68A] rounded-2xl shadow-2xl p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center bg-[#F59E0B] text-white rounded-xl mx-auto mb-3">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div className="text-base font-extrabold uppercase text-[#B45309]">
              Member already inwarded
            </div>

            <div className="text-xs text-[#78350F] my-3 leading-relaxed">
              Member ID:{' '}
              <strong className="font-mono text-sm text-[#172033] block mt-1 font-bold">
                {duplicateModal.memberId}
              </strong>
              in Class <strong>{duplicateModal.classId}</strong>
              <div className="mt-2 font-semibold">
                This member has already been recorded. Count remains unchanged.
              </div>
            </div>

            <button
              type="button"
              onClick={dismissModals}
              className="w-full py-2.5 bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold uppercase tracking-wider rounded-lg cursor-pointer"
            >
              DISMISS
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
