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
  Save,
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
import { normalizeIdentifier } from '../../utils/normalize';
import {
  requestCameraStream,
  startContinuousDualScanning,
  decodeBarcodeFromImageFile,
  CameraStreamResult,
  BarcodeScanResult,
} from '../../utils/universalBarcodeScanner';
import { ScannerTopToast, ScannerToastData } from './ScannerTopToast';

interface MobileScanningViewProps {
  onNavigateToImport?: () => void;
  onNavigateToSessions?: () => void;
  isRestrictedInward?: boolean;
}

export type ScannerMode = 'CLASS_MODE' | 'MEMBER_MODE';

export const MobileScanningView: React.FC<MobileScanningViewProps> = ({
  onNavigateToImport,
  isRestrictedInward = false,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('examscan_mobile_selected_class_id');
      if (saved) {
        return normalizeIdentifier(saved);
      }
    }
    return null;
  });

  const [scannerMode, setScannerMode] = useState<ScannerMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('examscan_mobile_selected_class_id');
      if (saved) {
        return 'MEMBER_MODE';
      }
    }
    return 'CLASS_MODE';
  });

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
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Top Toast Notification state (Non-blocking, auto-dismissing, Part 10-12)
  const [topToast, setTopToast] = useState<ScannerToastData | null>(null);

  const showToast = useCallback((toastData: ScannerToastData) => {
    setTopToast({
      ...toastData,
      id: Date.now(),
    });
  }, []);

  // Synchronous refs for mode & class ID to prevent stale closures during camera loop
  const scannerModeRef = useRef<ScannerMode>('CLASS_MODE');
  const selectedClassIdRef = useRef<string | null>(null);

  useEffect(() => {
    scannerModeRef.current = scannerMode;
  }, [scannerMode]);

  useEffect(() => {
    selectedClassIdRef.current = selectedClassId;
  }, [selectedClassId]);

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

    const curCid = selectedClassIdRef.current || selectedClassId;
    if (curCid) {
      const exists = bList.some(
        b => normalizeIdentifier(b.classId).toLowerCase() === normalizeIdentifier(curCid).toLowerCase()
      );
      if (exists) {
        const recs = importedService.getBundleRecordViews(curCid);
        setBundleRecords(recs);
      } else {
        // Stale or deleted class: reset to CLASS_MODE
        setSelectedClassId(null);
        selectedClassIdRef.current = null;
        setScannerMode('CLASS_MODE');
        scannerModeRef.current = 'CLASS_MODE';
        setBundleRecords([]);
        try {
          localStorage.removeItem('examscan_mobile_selected_class_id');
        } catch {}
      }
    } else {
      setBundleRecords([]);
    }
  }, [selectedClassId]);

  const reconcileLiveStatus = useCallback((_cid?: string) => {
    loadData();
  }, [loadData]);

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
              handleCameraBarcodeScan(detected);
            }
          },
          { throttleMs: 25 }
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
    isProcessingRef.current = false;
    lastScannedCodeRef.current = null;
  };

  // Open a Class Bundle and transition to MEMBER_MODE
  const openClassBundle = (classId: string) => {
    const cleanCid = normalizeIdentifier(classId);
    console.log('[CLASS SCAN] Opening class ID:', cleanCid);
    console.log('[SCAN MODE] Switching to MEMBER_MODE');

    try {
      localStorage.setItem('examscan_mobile_selected_class_id', cleanCid);
    } catch {}

    // 1. Stop / cleanup class scanner
    stopCamera();

    // 2. Set mode to MEMBER_MODE and assign currentClassId synchronously
    setSelectedClassId(cleanCid);
    selectedClassIdRef.current = cleanCid;
    setScannerMode('MEMBER_MODE');
    scannerModeRef.current = 'MEMBER_MODE';

    setManualInput('');
    setMemberTab('inwarded');
    dismissModals();

    showToast({
      type: 'success',
      title: '✓ Class Opened Successfully',
      subtitle: `Class ID: ${cleanCid}`,
    });

    // 3. Re-initialize camera for MEMBER_MODE
    setTimeout(() => {
      startCamera();
    }, 150);
  };

  // Exit back to CLASS_MODE
  const backToClassSelection = () => {
    try {
      localStorage.removeItem('examscan_mobile_selected_class_id');
    } catch {}

    // 1. Stop / cleanup member scanner
    stopCamera();

    // 2. Reset mode to CLASS_MODE and clear class ID
    setSelectedClassId(null);
    selectedClassIdRef.current = null;
    setScannerMode('CLASS_MODE');
    scannerModeRef.current = 'CLASS_MODE';

    setManualInput('');
    dismissModals();

    // 3. Re-initialize camera for CLASS_MODE
    setTimeout(() => {
      startCamera();
    }, 150);
  };

  // ==============================================================================
  // SAVE CLASS INWARD ACTION (STAGE 2)
  // Persists pending scans & finalizes inward operation for the selected Class ID
  // Allows user to click SAVE after class inward operation & continue to next stage
  // ==============================================================================
  const handleSaveClassInward = async () => {
    const curClass = selectedClassIdRef.current || selectedClassId;
    if (!curClass || isSaving) return;

    setIsSaving(true);
    try {
      const res = await importedService.saveActiveBundle(curClass);
      if (res.success) {
        playScanSuccessSound();
        loadData();
        showToast({
          type: 'success',
          title: '✓ Class Inward Saved',
          subtitle: `Class ID: ${curClass}`,
        });
        // Continue to the next stage: return to class list view with updated status
        setTimeout(() => {
          backToClassSelection();
        }, 1200);
      } else {
        playScanWarningSound();
        showToast({
          type: 'error',
          title: '✕ Inward Failed',
          subtitle: res.error || res.message || 'Failed to save class inward',
        });
      }
    } catch (err: any) {
      playScanWarningSound();
      showToast({
        type: 'error',
        title: '✕ Inward Failed',
        subtitle: err?.message || 'Please try again',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ==============================================================================
  // STAGE 1 CAMERA SCAN: Detect Class ID
  // Scanner identifies Class ID based on ADMIN IMPORTED DATA.
  // Searches public.imported_inward_data using actual imported barcode relationship.
  // Does NOT assume first 4 characters = Class ID. Leading zeros preserved strictly.
  // ==============================================================================
  const handleStage1ClassScan = async (rawCode: string) => {
    const rawBarcode = String(rawCode || '').trim();
    if (!rawBarcode) return;

    console.log('[SCAN MODE] CLASS_MODE');
    console.log('[STAGE 1] Raw barcode detected:', rawBarcode);

    const res = await importedService.resolveClassFromBarcode(rawBarcode);

    if (res.exists && res.classId) {
      console.log('[STAGE 1] Matching imported class found:', res.classId);
      playScanSuccessSound();
      openClassBundle(res.classId);
    } else {
      console.warn('[STAGE 1] No matching imported record found for barcode:', rawBarcode);
      playScanWarningSound();
      showToast({
        type: 'error',
        title: 'CLASS NOT IMPORTED',
        subtitle: 'SCAN AGAIN',
        duration: 2000,
      });
    }
  };

  // ==============================================================================
  // MANUAL MEMBER INWARD PROCESSING
  // Used ONLY when operator manually types Member ID and clicks INWARD.
  // Inserts strictly into public.manual_inward_data.
  // Barcode scanning NEVER calls this function!
  // ==============================================================================
  const executeManualMemberInward = async (
    targetClassId: string,
    rawInput: string
  ): Promise<boolean> => {
    const cleanCid = normalizeIdentifier(targetClassId);
    const cleanRaw = sanitizeBarcode(rawInput);
    if (!cleanCid || !cleanRaw) return false;

    // Do NOT derive Member ID from barcode or strip character positions!
    // The entered input is the exact Member ID.
    const enteredMid = cleanRaw;

    console.log('[MANUAL INWARD FLOW] ========================================');
    console.log('[MANUAL INWARD FLOW] Source:            MANUAL');
    console.log('[MANUAL INWARD FLOW] Raw input:         ', cleanRaw);
    console.log('[MANUAL INWARD FLOW] Class ID:          ', cleanCid);
    console.log('[MANUAL INWARD FLOW] Member ID:         ', enteredMid);

    try {
      // 1. Validate strictly against active class and entered member ID
      const validation = await importedService.validateMemberForClass(cleanCid, enteredMid);
      console.log('[MANUAL INWARD FLOW] Validation result: ', validation.status);

      if (validation.status === 'WRONG_CLASS') {
        playScanWarningSound();
        console.warn(`[MANUAL INWARD FLOW] Class mismatch: Belongs to Class ${validation.actualClassId}`);
        showToast({
          type: 'warning',
          title: 'MEMBER / CLASS MISMATCH',
          subtitle: 'This member belongs to another imported class. SCAN AGAIN',
          duration: 2500,
        });
        return false;
      }

      if (validation.status === 'NOT_FOUND') {
        playScanWarningSound();
        console.warn(`[MANUAL INWARD FLOW] Member not found in imported dataset for ${enteredMid}`);
        showToast({
          type: 'error',
          title: 'MEMBER NOT IMPORTED',
          subtitle: 'SCAN AGAIN',
          duration: 2000,
        });
        return false;
      }

      // Exact member ID from imported record
      const canonicalMemberId = validation.record
        ? normalizeIdentifier(validation.record.member_id)
        : enteredMid;
      console.log('[MANUAL INWARD FLOW] Member ID:         ', canonicalMemberId);
      console.log('[MANUAL INWARD FLOW] Validation:        PASS');

      // 2. Duplicate Check
      const alreadyInwarded = importedService.isMemberAlreadyInwarded(cleanCid, canonicalMemberId);
      console.log('[MANUAL INWARD FLOW] Existing inward:   ', alreadyInwarded ? 'YES' : 'NO');

      if (alreadyInwarded) {
        playScanWarningSound();
        showToast({
          type: 'warning',
          title: '⚠ Already Inwarded',
          subtitle: canonicalMemberId,
          duration: 1200,
        });
        return false;
      }

      // 3. Insert strictly into public.manual_inward_data
      const res = await importedService.recordManualInward(cleanCid, canonicalMemberId, {
        notes: 'Mobile Manual Inward',
        bookletBarcode: cleanRaw,
      });

      if (res.success && res.record) {
        console.log('[MANUAL INWARD FLOW] Insert:            PASS');
        console.log('[MANUAL INWARD FLOW] Supabase operation: manual_inward_data insert success');
        console.log('[LIVE STATUS] Inward operation successful');
        playScanSuccessSound();
        setManualInput('');
        reconcileLiveStatus(cleanCid);

        // Immediate fast non-blocking success toast
        showToast({
          type: 'success',
          title: '✓ Member Inwarded',
          subtitle: canonicalMemberId,
          duration: 1100,
        });
        return true;
      } else {
        console.error('[MANUAL INWARD FLOW] Insert:            FAIL');
        console.error('[MANUAL INWARD FLOW] Supabase error:    ', res.error);
        console.error('[MANUAL INWARD FLOW] Error code:        ', res.code || 'INSERT_FAILED');
        console.error('[MANUAL INWARD FLOW] Error message:     ', res.error || 'Failed to insert inward record');
        playScanWarningSound();
        showToast({
          type: 'error',
          title: '✕ Inward Failed',
          subtitle: res.error || canonicalMemberId,
          duration: 2000,
        });
        return false;
      }
    } catch (err: any) {
      console.error('[MANUAL INWARD FLOW] Exception:         ', err?.message || err);
      console.error('[MANUAL INWARD FLOW] Error code:        ', err?.code || 'UNHANDLED_EXCEPTION');
      console.error('[MANUAL INWARD FLOW] Error message:     ', err?.message || err);
      playScanWarningSound();
      showToast({
        type: 'error',
        title: '✕ Inward Failed',
        subtitle: err?.message || cleanRaw,
        duration: 2000,
      });
      return false;
    } finally {
      console.log('[MANUAL INWARD FLOW] ========================================');
    }
  };

  // ==============================================================================
  // STAGE 2 CAMERA SCAN: Detect Member ID
  // Barcode scanning stages scan as PENDING_SAVE in scan_sessions/scan items.
  // Barcode scan NEVER inserts into manual_inward_data!
  // ==============================================================================
  const handleStage2MemberScan = async (code: string) => {
    const activeCid = selectedClassIdRef.current || selectedClassId;
    if (!activeCid) return;

    console.log('[BARCODE FLOW] ========================================');
    console.log('[BARCODE FLOW] Source:            CAMERA');
    console.log('[BARCODE FLOW] Raw barcode:       ', code);
    console.log('[BARCODE FLOW] Class ID:          ', activeCid);

    try {
      const res = await importedService.processMobileMemberBarcodeScan(activeCid, code);

      if (res.isWrongClass) {
        playScanWarningSound();
        console.warn(`[BARCODE FLOW] Class mismatch: Belongs to Class ${res.detectedClassId}`);
        showToast({
          type: 'warning',
          title: 'MEMBER / CLASS MISMATCH',
          subtitle: 'This member belongs to another imported class. SCAN AGAIN',
          duration: 2500,
        });
        return false;
      }

      if (res.isUnknownMember || res.isNotImported) {
        playScanWarningSound();
        console.warn(`[BARCODE FLOW] Member not imported for ${code}`);
        showToast({
          type: 'error',
          title: 'MEMBER NOT IMPORTED',
          subtitle: 'SCAN AGAIN',
          duration: 2000,
        });
        return false;
      }

      if (res.isDuplicate) {
        playScanWarningSound();
        showToast({
          type: 'warning',
          title: '⚠ Already Inwarded',
          subtitle: res.member_id || code,
          duration: 1200,
        });
        return false;
      }

      if (res.success) {
        console.log('[BARCODE FLOW] Staged to pending scans (scan_session_items)');
        playScanSuccessSound();
        reconcileLiveStatus(activeCid);

        showToast({
          type: 'success',
          title: '✓ Member Inwarded',
          subtitle: res.member_id || code,
          duration: 1100,
        });
        return true;
      } else {
        playScanWarningSound();
        showToast({
          type: 'error',
          title: '✕ Inward Failed',
          subtitle: res.message || code,
          duration: 1500,
        });
        return false;
      }
    } catch (err: any) {
      console.error('[BARCODE FLOW] Exception:', err);
      playScanWarningSound();
      showToast({
        type: 'error',
        title: '✕ Inward Failed',
        subtitle: err?.message || 'Processing error',
        duration: 1500,
      });
      return false;
    }
  };

  // Router for Camera Scan depending on current Scanner Mode
  const handleCameraBarcodeScan = async (detectedOrRaw: BarcodeScanResult | string) => {
    const rawCode = typeof detectedOrRaw === 'string' ? detectedOrRaw : detectedOrRaw.text;
    const perfInfo = typeof detectedOrRaw === 'object' ? detectedOrRaw.perf : undefined;
    const formatInfo = typeof detectedOrRaw === 'object' ? detectedOrRaw.format : 'code_39';

    const code = sanitizeBarcode(rawCode);
    if (!code) return;
    if (!hasImportedData) return;

    // STEP 15: Debounce duplicate reads of the exact SAME barcode while it stays in front of the lens (1.5s)
    // When a DIFFERENT barcode is presented, it proceeds immediately with ZERO cooldown!
    const now = Date.now();
    if (lastScannedCodeRef.current === code && now - lastScannedTimeRef.current < 1500) {
      return;
    }
    if (isProcessingRef.current) return;

    // STEP 12: Lightweight processing lock
    isProcessingRef.current = true;
    lastScannedCodeRef.current = code;
    lastScannedTimeRef.current = now;

    // PART 6 & 15: IMMEDIATELY show "✓ Barcode Detected" at top
    if (scannerModeRef.current === 'MEMBER_MODE') {
      showToast({
        type: 'info',
        title: '✓ Barcode Detected',
        subtitle: code,
        duration: 800,
      });
    }

    const tProcStart = performance.now();

    try {
      const currentMode = scannerModeRef.current;
      if (currentMode === 'CLASS_MODE') {
        await handleStage1ClassScan(code);
      } else {
        await handleStage2MemberScan(code);
      }

      // STEP 19: Development Performance Debugging (Console only)
      const procMs = Math.round(performance.now() - tProcStart);
      const detMs = perfInfo?.detectionMs ?? 0;
      const engine = perfInfo?.engine ?? 'direct';
      console.log(`[SCAN PERF] ========================================`);
      console.log(`[SCAN PERF] Value:       ${code} (${formatInfo})`);
      console.log(`[SCAN PERF] Engine:      ${engine}`);
      console.log(`[SCAN PERF] Detection:   ${detMs}ms`);
      console.log(`[SCAN PERF] Inward/DB:   ${procMs}ms`);
      console.log(`[SCAN PERF] Total Time:  ${detMs + procMs}ms`);
      console.log(`[SCAN PERF] ========================================`);
    } catch (e: any) {
      console.warn('[MobileScanner] scan error:', e);
      showToast({
        type: 'error',
        title: '✕ Inward Failed',
        subtitle: e?.message || 'Scanner processing error',
        duration: 2000,
      });
    } finally {
      // STEP 11 & 12: Camera continuously available, immediately unlock for next barcode
      isProcessingRef.current = false;
    }
  };

  // ==============================================================================
  // MANUAL BARCODE / IDENTIFIER ENTRY
  // Context-aware: CLASS_MODE vs MEMBER_MODE
  // In MEMBER_MODE: Calls the same unified executeMemberInward function
  // ==============================================================================
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputVal = manualInput.trim();
    if (!inputVal) return;

    setIsSubmittingManual(true);

    try {
      const mode = scannerModeRef.current;
      // ----------------------------------------------------
      // CASE 1: CLASS_MODE — Input is for CLASS ID ONLY
      // ----------------------------------------------------
      if (mode === 'CLASS_MODE') {
        const cleanCid = normalizeIdentifier(inputVal);
        console.log('[MANUAL CLASS] Entered class ID:', cleanCid);

        const val = await importedService.validateClassId(cleanCid);
        console.log('[MANUAL CLASS] Class lookup result:', val.exists ? 'Found' : 'Not found');

        if (val.exists) {
          playScanSuccessSound();
          openClassBundle(val.classId);
        } else {
          playScanWarningSound();
          showToast({
            type: 'error',
            title: 'CLASS NOT IMPORTED',
            subtitle: 'SCAN AGAIN',
            duration: 2000,
          });
        }
      }
      // ----------------------------------------------------
      // CASE 2: MEMBER_MODE — Input is for MEMBER ID ONLY
      // Calls executeManualMemberInward (inserts strictly to manual_inward_data)
      // ----------------------------------------------------
      else if (mode === 'MEMBER_MODE' && (selectedClassIdRef.current || selectedClassId)) {
        const curClass = (selectedClassIdRef.current || selectedClassId)!;
        await executeManualMemberInward(curClass, inputVal);
      }
    } catch (err: any) {
      console.warn('Manual submit error:', err);
      showToast({
        type: 'error',
        title: '✕ Inward Failed',
        subtitle: err?.message || 'Manual entry error',
        duration: 2000,
      });
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
        handleCameraBarcodeScan(decoded);
      } else {
        playScanWarningSound();
        showToast({
          type: 'error',
          title: '✕ Invalid Barcode',
          subtitle: 'Please scan a valid booklet barcode',
        });
      }
    } catch (err: any) {
      showToast({
        type: 'error',
        title: '✕ Invalid Barcode',
        subtitle: err?.message || 'Failed to read image file',
      });
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
  const bundleInwarded = (activeBundle?.savedCount || 0) + (activeBundle?.pendingCount || 0);
  const bundleNotInwarded = Math.max(0, bundleExpected - bundleInwarded);
  const bundleProgress = bundleExpected > 0 ? Math.round((bundleInwarded / bundleExpected) * 100) : 0;

  const classStats = {
    importedCount: bundleExpected,
    inwardedCount: bundleInwarded,
    notInwardedCount: bundleNotInwarded,
    progress: bundleProgress,
  };

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
            {isRestrictedInward
              ? 'No examination records are currently imported. Please contact an authorized Administrator to upload the examination dataset.'
              : 'Please import your Excel data before starting booklet scanning. The camera scanner and barcode detection will be enabled once your Class ID and Member ID dataset is imported.'}
          </p>

          {!isRestrictedInward && onNavigateToImport && (
            <div className="mt-5">
              <button
                type="button"
                onClick={onNavigateToImport}
                className="w-full py-2.5 bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
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
  // ACTIVE MOBILE SCAN SCREEN (STAGE 1 OR STAGE 2)
  // ==============================================================================
  return (
    <div className="space-y-3.5 font-sans max-w-md mx-auto pb-28 px-3 pt-2 relative">
      {/* PART 10, 11, 12: Fixed Small Success & Error Top Toast */}
      <ScannerTopToast toast={topToast} onDismiss={() => setTopToast(null)} duration={1800} />

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
              CURRENT CLASS ID BUNDLE
            </div>
            <div className="text-base font-black font-mono tracking-wide">
              CLASS ID {selectedClassId}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveClassInward}
              disabled={isSaving}
              className="px-3.5 py-1.5 bg-[#16A34A] hover:bg-[#15803D] active:scale-95 text-white text-xs font-black uppercase tracking-wider rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Save Class Inward and continue"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSaving ? 'SAVING...' : 'SAVE'}</span>
            </button>
            <button
              type="button"
              onClick={backToClassSelection}
              className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors border border-white/20 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Change</span>
            </button>
          </div>
        </div>
      )}

      {/* Statistics Row: Updates immediately */}
      {scannerMode === 'CLASS_MODE' ? (
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-white p-2.5 border border-[#CBD5E1] rounded-xl text-center shadow-xs">
            <div className="text-[9px] font-bold text-[#64748B] uppercase">CLASS IDS</div>
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
            <span>Class ID {selectedClassId} Statistics</span>
            <span className="font-mono text-xs text-[#16A34A] font-black">
              {classStats.inwardedCount} / {classStats.importedCount} ({classStats.progress}%)
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
              <div className="text-[9px] font-bold text-[#64748B] uppercase">Imported</div>
              <div className="text-sm font-black text-[#172033] font-mono">{classStats.importedCount}</div>
            </div>
            <div className="bg-[#F0FDF4] p-2 border border-[#BBF7D0] rounded-lg">
              <div className="text-[9px] font-bold text-[#16A34A] uppercase">Inwarded</div>
              <div className="text-sm font-black text-[#16A34A] font-mono">{classStats.inwardedCount}</div>
            </div>
            <div className="bg-slate-50 p-2 border border-slate-200 rounded-lg">
              <div className="text-[9px] font-bold text-[#DC2626] uppercase">Not Inwarded</div>
              <div className="text-sm font-black text-[#DC2626] font-mono">{classStats.notInwardedCount}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200 mt-1">
            <div
              className="h-full bg-[#16A34A] rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, classStats.progress)}%` }}
            />
          </div>

          {/* Action Row - Progress Summary without duplicate SAVE button */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-[#64748B]">
            <span>Inward Progress: <strong className="text-[#16A34A] font-bold">{classStats.inwardedCount}</strong> / {classStats.importedCount}</span>
            <span className="font-mono text-xs font-bold text-[#16A34A]">{classStats.progress}%</span>
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
              {scannerMode === 'CLASS_MODE' ? 'Scan Class ID' : `Scan Member ID (Class ID ${selectedClassId})`}
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
              </div>
            </div>
          )}

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
              {scannerMode === 'CLASS_MODE' ? 'Manual Class ID Entry' : `Manual Inward into Class ID ${selectedClassId}`}
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
              {scannerMode === 'CLASS_MODE' ? 'OPEN CLASS ID' : 'INWARD'}
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
        /* STAGE 1: CLASS ID BUNDLES */
        <div className="bg-white border border-[#CBD5E1] rounded-xl shadow-xs overflow-hidden">
          <div className="p-3 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-[#172033] flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-[#1565D8]" />
              <span>CLASS ID BUNDLES</span>
              <span className="px-1.5 py-0.5 bg-blue-50 text-[#1565D8] border border-blue-200 rounded font-mono text-[10px]">
                {bundles.length}
              </span>
            </h2>

            {/* Quick Class Filter */}
            <input
              type="text"
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              placeholder="Filter Class ID..."
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
                          CLASS ID {b.classId}
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

    </div>
  );
};
