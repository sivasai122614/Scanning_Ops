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
  Building2,
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
  X,
  BarChart3,
  ScanLine,
  Barcode,
  QrCode,
  Zap,
  Sparkles,
  Video,
  Keyboard,
  CornerDownLeft,
  ArrowLeftRight,
  SlidersHorizontal,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
  SessionSummary,
  BundleRecordView,
  sanitizeBarcode,
  ScanResult,
  UserClassInwardSummary,
  isRecordInwardedByUser,
  formatExamDate,
  isRecordMatchingDateFilter,
} from '../../services/importedService';
import { playScanSuccessSound, playScanWarningSound, triggerHapticFeedback, primeHapticAndAudio } from '../../utils/scannerSound';
import { normalizeIdentifier } from '../../utils/normalize';
import { useAuth } from '../../context/AuthContext';
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
  const { user, appRole } = useAuth();
  const isInwardRole = isRestrictedInward || appRole === 'inward' || (user as any)?.role === 'inward' || (user as any)?.appRole === 'inward';
  const currentOperator = (user?.username || user?.full_name || user?.email?.split('@')[0] || '').toLowerCase();

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
  const [savedScannedRecords, setSavedScannedRecords] = useState<any[]>([]);
  const [activeExamDate, setActiveExamDate] = useState<string>(() => importedService.getActiveExamDate() || '');

  const availableDates = React.useMemo(() => {
    return importedService.getAvailableExamDates();
  }, [bundles, sessionSummary]);

  const handleSelectExamDate = useCallback((date: string) => {
    setActiveExamDate(date);
    importedService.setActiveExamDate(date);
    const bList = importedService.getClassBundles(date || undefined);
    const sum = importedService.getSessionSummary(date || undefined);
    setBundles(bList);
    setSessionSummary(sum);
  }, []);

  // Class ID wise inward summaries exclusively for logged-in user
  const myClassSummaries: UserClassInwardSummary[] = React.useMemo(() => {
    return importedService.getUserClassInwardSummaries(user);
  }, [user, savedScannedRecords, bundles]);

  const myTotalInwardedCount = React.useMemo(() => {
    return myClassSummaries.reduce((sum, c) => sum + c.inwardedCount, 0);
  }, [myClassSummaries]);

  const [expandedClassIds, setExpandedClassIds] = useState<Record<string, boolean>>({});
  const toggleExpandClass = (cid: string) => {
    setExpandedClassIds(prev => ({ ...prev, [cid]: !prev[cid] }));
  };

  // Member mode tabs: 'inwarded' | 'not_inwarded' | 'all'
  const [memberTab, setMemberTab] = useState<'inwarded' | 'not_inwarded' | 'all'>('inwarded');
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('');

  // Manual input state
  const [manualInput, setManualInput] = useState<string>('');
  const [isSubmittingManual, setIsSubmittingManual] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Scan format state (Barcode 1D vs QR Code 2D) per user requirement
  const [scanFormat, setScanFormat] = useState<'barcode' | 'qr_code'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('examscan_scan_format');
      if (saved === 'barcode' || saved === 'qr_code') return saved;
    }
    return 'barcode';
  });
  const [showScanTypeModal, setShowScanTypeModal] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('examscan_scan_format_prompted') !== 'true';
    }
    return true;
  });
  const scanFormatRef = useRef<'barcode' | 'qr_code'>(scanFormat);

  useEffect(() => {
    scanFormatRef.current = scanFormat;
  }, [scanFormat]);

  // Save confirmation modal state (Requirement 2)
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState<boolean>(false);
  const [saveConfirmChecked, setSaveConfirmChecked] = useState<boolean>(false);
  const [saveConfirmData, setSaveConfirmData] = useState<{
    classId: string;
    inwardedCount: number;
    notInwardedCount: number;
    totalCount: number;
  } | null>(null);
  const isAutoSavingRef = useRef<boolean>(false);

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
  const recentlyInwardedRef = useRef<{ code: string; time: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active bundle for currently selected class
  const activeBundle = selectedClassId ? importedService.getClassBundle(selectedClassId) : null;

  const loadData = useCallback(() => {
    const curDate = importedService.getActiveExamDate();
    setActiveExamDate(curDate || '');
    const hasData = importedService.hasImportedData();
    setHasImportedData(hasData);
    const bList = importedService.getClassBundles(curDate || undefined);
    const sum = importedService.getSessionSummary(curDate || undefined);
    const allSaved = importedService.getSavedScannedRecords(undefined, curDate || undefined);
    setBundles(bList);
    setSessionSummary(sum);
    setSavedScannedRecords(allSaved);

    const curCid = selectedClassIdRef.current || selectedClassId;
    if (curCid) {
      const exists = bList.some(
        b => normalizeIdentifier(b.classId).toLowerCase() === normalizeIdentifier(curCid).toLowerCase()
      );
      if (exists) {
        const recs = importedService.getBundleRecordViews(
          curCid,
          curDate || undefined,
          isInwardRole ? user : undefined
        );
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
  }, [selectedClassId, user, isInwardRole]);

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
    primeHapticAndAudio();

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
          { throttleMs: 25, scanMode: scanFormatRef.current }
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

  const handleSelectScanFormat = (format: 'barcode' | 'qr_code') => {
    setScanFormat(format);
    scanFormatRef.current = format;
    try {
      localStorage.setItem('examscan_scan_format', format);
      localStorage.setItem('examscan_scan_format_prompted', 'true');
    } catch {}
    setShowScanTypeModal(false);
    showToast({
      type: 'info',
      title: format === 'qr_code' ? '📱 QR Code Mode Enabled' : '📊 Barcode Mode Enabled',
      subtitle: format === 'qr_code' ? 'Camera configured for QR matrix' : 'Camera configured for 1D barcodes',
      duration: 1500,
    });
    stopCamera();
    setTimeout(() => {
      startCamera();
    }, 150);
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

    // Explicitly transition status to IN PROGRESS immediately upon bundle opening
    const opName = user?.username || user?.full_name || user?.email?.split('@')[0] || currentOperator || 'Siva Sai';
    importedService.startClassScanSession(cleanCid, opName);

    showToast({
      type: 'success',
      title: '✓ Class Opened Successfully',
      subtitle: `Class ID: ${cleanCid} — Scanning In Progress`,
    });

    // 3. Re-initialize camera for MEMBER_MODE
    setTimeout(() => {
      startCamera();
    }, 150);
  };

  // Exam Date Mismatch Warning Modal State
  interface DateMismatchModalData {
    isOpen: boolean;
    barcode: string;
    memberId?: string;
    targetClassId?: string;
    recordExamDate: string;
    activeExamDate: string;
  }
  const [dateMismatchModal, setDateMismatchModal] = useState<DateMismatchModalData | null>(null);

  const handleSwitchDateAndOpenBundle = useCallback((targetDate: string, targetCid?: string) => {
    handleSelectExamDate(targetDate);
    if (targetCid) {
      openClassBundle(targetCid);
    }
    setDateMismatchModal(null);
    showToast({
      type: 'success',
      title: '✓ Exam Date Switched',
      subtitle: `Station date changed to ${targetDate}${targetCid ? ` • Class ${targetCid}` : ''}`,
      duration: 3000,
    });
  }, [handleSelectExamDate, openClassBundle, showToast]);

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
  // When Not Inward == 0 -> Auto-saves immediately
  // When Not Inward > 0 and user clicks SAVE -> Prompts confirmation modal with checkbox
  // ==============================================================================
  const handleSaveClassInward = async (isAutoSave = false) => {
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
          title: isAutoSave ? '✓ Class Complete — Auto-Saved' : '✓ Class Inward Saved',
          subtitle: `Class ID: ${curClass} (${res.totalSavedForClass} scripts)`,
          duration: 2500,
        });
        setShowSaveConfirmModal(false);
        // Continue to the next stage: return to class list view with updated status
        setTimeout(() => {
          backToClassSelection();
          isAutoSavingRef.current = false;
        }, 1200);
      } else {
        playScanWarningSound();
        showToast({
          type: 'error',
          title: '✕ Inward Failed',
          subtitle: res.error || res.message || 'Failed to save class inward',
          duration: 2500,
        });
        isAutoSavingRef.current = false;
      }
    } catch (err: any) {
      playScanWarningSound();
      showToast({
        type: 'error',
        title: '✕ Inward Failed',
        subtitle: err?.message || 'Please try again',
        duration: 2500,
      });
      isAutoSavingRef.current = false;
    } finally {
      setIsSaving(false);
    }
  };

  const onSaveButtonClick = () => {
    const curClass = selectedClassIdRef.current || selectedClassId;
    if (!curClass || isSaving) return;

    const bundle = importedService.getClassBundle(curClass);
    const inwarded = bundle ? (bundle.inwardedCount ?? bundle.receivedCount) : 0;
    const notInwarded = bundle ? (bundle.notInwardedCount ?? bundle.missingCount) : 0;
    const total = bundle ? bundle.expectedCount : 0;

    if (inwarded === 0) {
      playScanWarningSound();
      showToast({
        type: 'warning',
        title: '⚠ No Scripts Inwarded',
        subtitle: 'Scan at least 1 booklet before saving',
        duration: 2000,
      });
      return;
    }

    // If Not Inward == 0, save directly!
    if (notInwarded === 0) {
      handleSaveClassInward(false);
      return;
    }

    // If Not Inward > 0 (pending scripts remain), show confirmation modal with checkbox!
    setSaveConfirmData({
      classId: curClass,
      inwardedCount: inwarded,
      notInwardedCount: notInwarded,
      totalCount: total,
    });
    setSaveConfirmChecked(false);
    setShowSaveConfirmModal(true);
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
      const cleanCid = normalizeIdentifier(res.classId);
      if (activeExamDate && activeExamDate !== 'ALL') {
        const bundleForActive = importedService.getClassBundle(cleanCid, activeExamDate);
        if (!bundleForActive || bundleForActive.expectedCount === 0) {
          const classDate = importedService.getClassExamDate(cleanCid);
          if (classDate && !isRecordMatchingDateFilter(classDate, activeExamDate)) {
            const recDmy = formatExamDate(classDate) || classDate;
            const actDmy = formatExamDate(activeExamDate) || activeExamDate;
            playScanWarningSound();
            setDateMismatchModal({
              isOpen: true,
              barcode: rawBarcode,
              targetClassId: cleanCid,
              recordExamDate: recDmy,
              activeExamDate: actDmy,
            });
            showToast({
              type: 'warning',
              title: '⚠ Exam Date Mismatch',
              subtitle: `Belongs to date ${recDmy}`,
              duration: 3500,
            });
            return;
          }
        }
      }

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
      const validation = await importedService.validateMemberForClass(cleanCid, enteredMid, activeExamDate || undefined);
      console.log('[MANUAL INWARD FLOW] Validation result: ', validation.status);

      if (validation.status === 'DATE_MISMATCH') {
        playScanWarningSound();
        setDateMismatchModal({
          isOpen: true,
          barcode: cleanRaw,
          memberId: validation.record?.member_id || enteredMid,
          targetClassId: validation.actualClassId || cleanCid,
          recordExamDate: validation.actualExamDate || 'Another Date',
          activeExamDate: validation.expectedExamDate || activeExamDate || 'Current Date',
        });
        showToast({
          type: 'warning',
          title: '⚠ Exam Date Mismatch',
          subtitle: `Belongs to date ${validation.actualExamDate}`,
          duration: 3500,
        });
        return false;
      }

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
        inwardedBy: currentOperator,
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

        // Check if all scripts for this class are now inwarded (notInwardedCount === 0) -> Auto Save
        const updatedBundle = importedService.getClassBundle(cleanCid);
        const notInwardRemaining = updatedBundle ? (updatedBundle.notInwardedCount ?? updatedBundle.missingCount) : 1;
        if (
          updatedBundle &&
          updatedBundle.expectedCount > 0 &&
          notInwardRemaining === 0 &&
          !isAutoSavingRef.current
        ) {
          isAutoSavingRef.current = true;
          console.log('[AUTO-SAVE] All scripts inwarded via manual entry (Not Inward = 0). Auto-saving bundle.');
          showToast({
            type: 'success',
            title: '✓ All Scripts Inwarded!',
            subtitle: `Class ID: ${cleanCid} — Auto-saving bundle...`,
            duration: 2500,
          });
          playScanSuccessSound();
          setTimeout(() => {
            handleSaveClassInward(true);
          }, 800);
        }

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
      const operatorName = user?.username || user?.full_name || user?.email?.split('@')[0] || currentOperator || 'Siva Sai';
      const res = await importedService.processMobileMemberBarcodeScan(
        activeCid,
        code,
        operatorName,
        activeExamDate || undefined
      );

      if (res.isDateMismatch) {
        playScanWarningSound();
        setDateMismatchModal({
          isOpen: true,
          barcode: code,
          memberId: res.detectedMemberId || code,
          targetClassId: res.detectedClassId || activeCid,
          recordExamDate: res.expectedDate || 'Another Date',
          activeExamDate: res.activeDate || activeExamDate || 'Current Date',
        });
        showToast({
          type: 'warning',
          title: '⚠ Exam Date Mismatch',
          subtitle: `Belongs to date ${res.expectedDate}`,
          duration: 3500,
        });
        return false;
      }

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
        // If the user literally just inwarded this member within the last 3.5 seconds, ignore repeated camera frames while pulling booklet away
        if (
          recentlyInwardedRef.current &&
          recentlyInwardedRef.current.code === code.toLowerCase() &&
          Date.now() - recentlyInwardedRef.current.time < 3500
        ) {
          return false;
        }

        playScanWarningSound();
        showToast({
          type: 'warning',
          title: '⚠ Already Inwarded',
          subtitle: res.member_id || code,
          duration: 2000,
        });
        return false;
      }

      if (res.success) {
        recentlyInwardedRef.current = { code: code.toLowerCase(), time: Date.now() };
        console.log('[BARCODE FLOW] Staged to pending scans (scan_session_items)');
        playScanSuccessSound();
        reconcileLiveStatus(activeCid);

        showToast({
          type: 'success',
          title: '✓ Member Inwarded',
          subtitle: res.member_id || code,
          duration: 2000,
        });

        // Check if all scripts for this class are now inwarded -> Auto Save
        const updatedBundle = importedService.getClassBundle(activeCid);
        const notInwardRemaining = updatedBundle ? (updatedBundle.notInwardedCount ?? updatedBundle.missingCount) : 1;
        const expectedCount = updatedBundle?.expectedCount || 0;
        const currentInwarded = updatedBundle ? ((updatedBundle.savedCount || 0) + (updatedBundle.pendingCount || 0)) : 0;
        const isComplete = expectedCount > 0 && (notInwardRemaining === 0 || currentInwarded >= expectedCount);

        if (
          isComplete &&
          !isAutoSavingRef.current
        ) {
          isAutoSavingRef.current = true;
          console.log('[AUTO-SAVE] All scripts inwarded via camera barcode. Auto-saving bundle.');
          showToast({
            type: 'success',
            title: '✓ All Scripts Inwarded!',
            subtitle: `Class ID: ${activeCid} — Auto-saving & opening Stage 1...`,
            duration: 2500,
          });
          playScanSuccessSound();
          setTimeout(() => {
            handleSaveClassInward(true);
          }, 600);
        }

        return true;
      } else {
        playScanWarningSound();
        showToast({
          type: 'error',
          title: '✕ Inward Failed',
          subtitle: res.message || code,
          duration: 2000,
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

    // Requirement 1: Hardware haptic vibration immediately on barcode detection
    triggerHapticFeedback(120);

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
  const userInwardedCount = bundleRecords.filter(r => r.scan_status === 'saved' || r.scan_status === 'pending_save').length;
  const displayInwardedCount = isInwardRole ? userInwardedCount : ((activeBundle?.savedCount || 0) + (activeBundle?.pendingCount || 0));
  const displayNotInwardedCount = Math.max(0, bundleExpected - displayInwardedCount);
  const displayProgress = bundleExpected > 0 ? Math.round((displayInwardedCount / bundleExpected) * 100) : 0;

  const classStats = {
    importedCount: bundleExpected,
    inwardedCount: displayInwardedCount,
    notInwardedCount: displayNotInwardedCount,
    progress: displayProgress,
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
    <div className="font-sans max-w-md mx-auto pb-28 relative">
      {/* PART 10, 11, 12: Fixed Small Success & Error Top Toast */}
      <ScannerTopToast toast={topToast} onDismiss={() => setTopToast(null)} duration={2000} />

      {/* SCAN TYPE MODAL (Styled to match Stitch mockup) */}
      {showScanTypeModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center">
            {/* Floating Header Scan Icon */}
            <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#1565D8] mb-4 shadow-inner">
              <ScanIcon className="w-8 h-8 animate-pulse text-[#1565D8]" />
            </div>

            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              SELECT SCAN TYPE
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Choose standard 1D Barcode or 2D QR Code to start scanning booklets.
            </p>

            <div className="grid grid-cols-2 gap-3 my-5">
              <div
                onClick={() => handleSelectScanFormat('barcode')}
                className={`p-3.5 rounded-2xl border-2 flex flex-col items-center justify-center cursor-pointer transition active:scale-95 shadow-xs ${
                  scanFormat === 'barcode'
                    ? 'border-[#1565D8] bg-blue-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-white shadow-2xs border border-slate-200 flex items-center justify-center mb-2">
                  <Barcode className="w-6 h-6 text-[#1565D8]" />
                </div>
                <strong className="text-xs font-bold text-slate-900">BARCODE (1D)</strong>
                <span className="text-[10px] text-slate-500 mt-0.5">Code 128 / Code 39</span>
              </div>

              <div
                onClick={() => handleSelectScanFormat('qr_code')}
                className={`p-3.5 rounded-2xl border-2 flex flex-col items-center justify-center cursor-pointer transition active:scale-95 shadow-xs ${
                  scanFormat === 'qr_code'
                    ? 'border-[#1565D8] bg-blue-50/70 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-white shadow-2xs border border-slate-200 flex items-center justify-center mb-2">
                  <QrCode className="w-6 h-6 text-indigo-600" />
                </div>
                <strong className="text-xs font-bold text-slate-900">QR CODE (2D)</strong>
                <span className="text-[10px] text-slate-500 mt-0.5">Matrix QR Code</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowScanTypeModal(false)}
              className="w-full bg-[#1565D8] hover:bg-blue-700 text-white font-black text-xs py-3.5 rounded-2xl shadow-glow-blue transition active:scale-98 tracking-wider cursor-pointer"
            >
              CONFIRM SELECTION
            </button>
          </div>
        </div>
      )}

      {/* TOP SECTION: Meta & Exam Details, Scan Format, Active Class Banner & Camera Viewfinder */}
      <div className="sticky top-0 z-30 bg-[#F5F7FA]/95 backdrop-blur-md pt-2 px-3 pb-2 space-y-2 border-b border-slate-200/90 shadow-xs">
        {/* 1. Meta & Exam Details Card */}
        <div className="glass-card rounded-xl p-2.5 shadow-xs border border-slate-200/90">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
              <span className="p-1 bg-blue-50 text-[#1565D8] rounded-md">
                <CalendarIcon className="w-3 h-3" />
              </span>
              <span>{todayStr}</span>
            </div>

            {/* Stage Badge with glow pulse ring */}
            <div
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                scannerMode === 'CLASS_MODE'
                  ? 'bg-blue-50 text-[#1565D8] border border-blue-300'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-300'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full animate-pulse-ring ${
                  scannerMode === 'CLASS_MODE' ? 'bg-[#1565D8]' : 'bg-emerald-500'
                }`}
              />
              {scannerMode === 'CLASS_MODE' ? 'STAGE 1: CLASS ID' : 'STAGE 2: MEMBER ID'}
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 text-[11px]">
              <Building2 className="w-3.5 h-3.5 text-[#1565D8]" />
              <span className="truncate max-w-[210px]">{universityName || 'VALUATION CAMP HUB'}</span>
            </div>
            <span className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
              CAMP HUB
            </span>
          </div>

          {availableDates.length > 0 && (
            <div className="mt-2 flex items-center justify-between bg-slate-50/80 rounded-lg p-1 border border-slate-200">
              <span className="text-[9px] font-bold tracking-wider text-[#1565D8] uppercase pl-1">
                EXAM DATE:
              </span>
              <div className="relative inline-flex items-center">
                <select
                  value={activeExamDate}
                  onChange={(e) => handleSelectExamDate(e.target.value)}
                  className="bg-white font-medium text-xs text-slate-800 pl-2 pr-6 py-0.5 rounded-md border border-slate-200 shadow-2xs focus:outline-hidden focus:ring-1 focus:ring-[#1565D8] cursor-pointer"
                >
                  <option value="">All Dates ({sessionSummary?.totalExpected || 0} scripts)</option>
                  {availableDates.map(d => (
                    <option key={d.date} value={d.date}>
                      {d.displayDate} ({d.totalRecords.toLocaleString()} scripts)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 2. SCAN FORMAT SWITCHER */}
        <div className="glass-card rounded-xl p-1.5 shadow-xs border border-slate-200/90 flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 pl-1">
            <ScanLine className="w-3.5 h-3.5 text-[#1565D8]" />
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">Format:</span>
          </div>

          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg gap-1 border border-slate-200">
            <button
              type="button"
              onClick={() => handleSelectScanFormat('barcode')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold transition-all shadow-2xs cursor-pointer ${
                scanFormat === 'barcode'
                  ? 'bg-[#1565D8] text-white shadow-glow-blue scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Barcode className="w-3 h-3" />
              <span>BARCODE</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectScanFormat('qr_code')}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold transition-all shadow-2xs cursor-pointer ${
                scanFormat === 'qr_code'
                  ? 'bg-[#1565D8] text-white shadow-glow-blue scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <QrCode className="w-3 h-3" />
              <span>QR CODE</span>
            </button>
            <button
              type="button"
              onClick={() => setShowScanTypeModal(true)}
              className="p-0.5 rounded-md text-slate-400 hover:text-slate-700 transition"
              title="More format options"
            >
              <SlidersHorizontal className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* 3. CURRENT CLASS ID BANNER (Side-by-side Class ID and Compact Cute styling) */}
        {scannerMode === 'MEMBER_MODE' && selectedClassId && (
          <div className="rounded-xl p-2.5 text-white bg-gradient-to-r from-blue-800 via-[#1565D8] to-blue-600 shadow-sm border border-blue-500 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-white/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center justify-between gap-2 relative z-10">
              <span className="text-[10px] font-bold tracking-wider uppercase text-blue-200">
                CURRENT CLASS ID BUNDLE
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onSaveButtonClick}
                  disabled={isSaving}
                  className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-glow-emerald transition-all border border-emerald-400 cursor-pointer disabled:opacity-50"
                  title="Save Class ID Inward and continue"
                >
                  <Save className="w-3 h-3" />
                  <span>{isSaving ? 'SAVING...' : 'SAVE'}</span>
                </button>
                <button
                  type="button"
                  onClick={backToClassSelection}
                  className="flex items-center gap-1 bg-white/20 hover:bg-white/30 active:scale-95 text-white text-[11px] font-bold px-2 py-1 rounded-lg backdrop-blur transition-all border border-white/30 cursor-pointer"
                  title="Switch to another Class ID"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  <span>CHANGE</span>
                </button>
              </div>
            </div>

            {/* Side-by-side Class ID layout */}
            <div className="flex items-center justify-between gap-2 pt-1.5 mt-1 border-t border-white/15 relative z-10">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-blue-200 uppercase tracking-wide">CLASS ID:</span>
                <span className="text-sm font-black font-mono text-white tracking-wider bg-white/20 px-2.5 py-0.5 rounded-md border border-white/30 shadow-xs">
                  {selectedClassId}
                </span>
              </div>
              <p className="text-[10px] text-blue-100 font-medium">
                Target: <span className="font-bold text-white">{bundleExpected} Booklets</span>
              </p>
            </div>
          </div>
        )}

        {/* 4. FUTURISTIC CAMERA VIEWFINDER (Live Video with No restrictive bounding box) */}
        <div className="glass-card rounded-xl overflow-hidden border border-slate-300 shadow-md relative bg-slate-950 text-white">
          {/* Viewfinder Header Bar */}
          <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 flex items-center justify-between border-b border-slate-800 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-bold font-mono tracking-wide text-slate-100 truncate max-w-[200px] text-[11px]">
                {scannerMode === 'CLASS_MODE'
                  ? 'Scan Class ID / SH ID'
                  : `Scan Member ID (${selectedClassId})`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-900/80 text-blue-300 border border-blue-700 uppercase">
                {scanFormat === 'qr_code' ? 'QR' : 'Barcode'}
              </span>
              <span
                className={`text-[9px] font-mono uppercase font-semibold tracking-wider ${
                  cameraActive ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {cameraActive ? 'ACTIVE' : 'PAUSED'}
              </span>
            </div>
          </div>

          {/* Viewport: Dynamic Aspect Ratio (No restrictive frame overlay as instructed) */}
          <div
            className={`relative bg-slate-950 w-full flex items-center justify-center overflow-hidden transition-all duration-300 ${
              scanFormat === 'qr_code'
                ? 'aspect-[4/3] min-h-[150px] max-h-[22vh]'
                : 'aspect-[2.8/1] min-h-[82px] max-h-[12.5vh]'
            }`}
          >
            {/* Cyber Animated Background Grid */}
            <div className="absolute inset-0 cyber-grid opacity-25 pointer-events-none" />

            {/* Live Camera Video Feed */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-cover relative z-10 ${cameraActive ? 'block' : 'hidden'}`}
            />

            {/* Laser Sweeper Bar Animation */}
            {cameraActive && (
              <div className="absolute w-full h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#10B981] animate-scan-sweep z-20 pointer-events-none" />
            )}

            {/* Flashlight / Torch Floating Toggle */}
            {hasTorch && (
              <button
                type="button"
                onClick={handleToggleTorch}
                className={`absolute top-2 right-2 z-30 p-1.5 rounded-full border transition active:scale-90 cursor-pointer ${
                  torchOn
                    ? 'bg-yellow-400 text-slate-950 shadow-[0_0_12px_#FACC15] border-yellow-300'
                    : 'bg-slate-900/80 border-slate-700 text-yellow-400 hover:bg-slate-800'
                }`}
                title="Toggle Flashlight"
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
            )}

            {cameraLoading && (
              <div className="text-center text-white px-4 relative z-20">
                <div className="h-5 w-5 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-1" />
                <div className="text-[9px] font-bold uppercase tracking-wider">Starting Camera...</div>
              </div>
            )}

            {!cameraActive && !cameraLoading && (
              <div className="text-center text-white/80 p-2.5 relative z-20">
                <CameraOff className="h-5 w-5 mx-auto mb-1 text-white/50" />
                <div className="text-[11px] font-bold text-white mb-0.5">Camera Paused</div>
                <div className="text-[9px] text-white/70 max-w-xs mx-auto mb-1.5">
                  {cameraError || 'Tap below to scan or enter barcode manually.'}
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-3 py-1 bg-[#1565D8] text-white text-[10px] font-bold uppercase tracking-wider rounded-md hover:bg-blue-700 transition-colors cursor-pointer shadow-glow-blue"
                >
                  Start Camera
                </button>
              </div>
            )}
          </div>

          {/* Camera Control Bar at Bottom of Viewport */}
          <div className="p-2 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
            <div className="text-[10px] text-slate-300 flex items-center gap-1.5 pl-0.5">
              <Sparkles className="w-3 h-3 text-blue-400" />
              <span>Auto-focus enabled</span>
            </div>
            <div className="flex items-center gap-1.5">
              {availableDevices.length > 1 && (
                <button
                  type="button"
                  onClick={handleCycleCamera}
                  className="p-1 text-xs font-bold rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                  title="Switch Lens"
                >
                  <SwitchCamera className="h-3 w-3" />
                </button>
              )}
              {cameraActive ? (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-slate-700 transition cursor-pointer"
                >
                  <Video className="w-3 h-3" />
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex items-center gap-1 bg-[#1565D8] hover:bg-blue-600 active:scale-95 text-white font-bold text-[11px] px-3 py-1 rounded-lg shadow-glow-blue transition cursor-pointer"
                >
                  <Video className="w-3 h-3" />
                  <span>Start</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SCROLLABLE CONTENT AREA */}
      <div className="px-3 pt-2 space-y-2.5">
        {/* 5. STATISTICS METRICS */}
        {scannerMode === 'CLASS_MODE' ? (
          !isRestrictedInward ? (
            <div className="grid grid-cols-4 gap-1.5">
              <div className="bg-white p-2 border border-[#CBD5E1] rounded-xl text-center shadow-xs">
                <div className="text-[8px] font-bold text-[#64748B] uppercase">CLASS IDS</div>
                <div className="text-sm font-black text-[#172033] font-tabular mt-0.5">{totalClasses}</div>
              </div>
              <div className="bg-white p-2 border border-[#CBD5E1] rounded-xl text-center shadow-xs">
                <div className="text-[8px] font-bold text-[#64748B] uppercase">EXPECTED</div>
                <div className="text-sm font-black text-[#172033] font-tabular mt-0.5">{totalExpected}</div>
              </div>
              <div className="bg-[#F0FDF4] p-2 border border-[#BBF7D0] rounded-xl text-center shadow-xs">
                <div className="text-[8px] font-bold text-[#16A34A] uppercase">INWARDED</div>
                <div className="text-sm font-black text-[#16A34A] font-tabular mt-0.5">{totalInwarded}</div>
              </div>
              <div className="bg-white p-2 border border-[#CBD5E1] rounded-xl text-center shadow-xs">
                <div className="text-[8px] font-bold text-[#DC2626] uppercase">NOT INWARDED</div>
                <div className="text-sm font-black text-[#DC2626] font-tabular mt-0.5">{totalNotInwarded}</div>
              </div>
            </div>
          ) : (
            <div className="bg-[#EFF6FF] border border-[#BFDBFE] p-2.5 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <ScanIcon className="h-4 w-4 text-[#1565D8]" />
                <span className="font-bold text-[#1E40AF] text-[11px]">Ready for Inward Scanning</span>
              </div>
              <span className="text-[10px] font-semibold text-[#3B82F6]">Stage 1: Scan Class ID</span>
            </div>
          )
        ) : (
          /* MEMBER_MODE Class ID Bundle Statistics */
          <div className="glass-card rounded-xl p-2.5 shadow-xs border border-slate-200/90">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-[#1565D8]" />
                <h3 className="text-[11px] font-black tracking-wide uppercase text-slate-800">
                  Class ID {selectedClassId} Statistics
                </h3>
              </div>
              <div className="flex items-center gap-1 font-mono font-bold text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <span>{classStats.inwardedCount} / {classStats.importedCount}</span>
                <span className="text-[9px] bg-emerald-600 text-white rounded px-1">({classStats.progress}%)</span>
              </div>
            </div>

            {/* Micro Progress Track */}
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-2 border border-slate-200">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, classStats.progress)}%` }}
              />
            </div>

            {/* 3 Status Cards (Cute, compact) */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-slate-50/90 rounded-lg p-1.5 text-center border border-slate-200/80 shadow-2xs">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">
                  IMPORTED
                </span>
                <span className="text-base font-extrabold text-slate-800 font-mono">
                  {classStats.importedCount}
                </span>
              </div>
              <div className="bg-emerald-50/80 rounded-lg p-1.5 text-center border border-emerald-300 shadow-2xs relative overflow-hidden">
                <div className="absolute -right-2 -bottom-2 w-6 h-6 bg-emerald-400/10 rounded-full pointer-events-none" />
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 block">
                  INWARDED
                </span>
                <span className="text-base font-black text-emerald-600 font-mono">
                  {classStats.inwardedCount}
                </span>
              </div>
              <div className="bg-rose-50/60 rounded-lg p-1.5 text-center border border-rose-200/80 shadow-2xs">
                <span className="text-[9px] font-black uppercase tracking-wider text-rose-700 block">
                  NOT INWARDED
                </span>
                <span className="text-base font-black text-rose-600 font-mono">
                  {classStats.notInwardedCount}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 6. DYNAMIC MANUAL INPUT BAR */}
        <div className="glass-card rounded-xl p-2.5 shadow-xs border border-slate-200/90 animate-card-glow">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_#10B981]" />
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                {scannerMode === 'CLASS_MODE'
                  ? 'MANUAL CLASS ID ENTRY'
                  : `MANUAL INWARD INTO CLASS ID ${selectedClassId}`}
              </span>
            </div>
            <span className="text-[9px] font-mono font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-300 shadow-2xs flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              {scannerMode === 'CLASS_MODE' ? 'STAGE 1' : 'STAGE 2'}
            </span>
          </div>

          <form onSubmit={handleManualSubmit} className="flex items-center gap-1.5">
            <div className="relative flex-1 group">
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-emerald-600 group-focus-within:text-[#1565D8] transition-colors">
                <Keyboard className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                placeholder={
                  scannerMode === 'CLASS_MODE' ? 'ENTER CLASS ID' : 'ENTER MEMBER ID (OR SCAN)'
                }
                className="w-full text-xs font-mono font-semibold tracking-wider uppercase pl-8 pr-6 py-2 rounded-lg border-2 border-emerald-300/80 bg-white placeholder:text-slate-400 focus:outline-hidden focus:border-[#1565D8] focus:ring-2 focus:ring-blue-500/20 shadow-2xs hover:border-emerald-400 transition-all duration-200"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                <span className="w-1 h-3 bg-emerald-500 rounded-xs animate-cursor-blink shadow-[0_0_6px_#10B981]" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmittingManual || !manualInput.trim()}
              className="relative overflow-hidden bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-500 hover:from-emerald-600 hover:to-emerald-700 active:scale-95 text-white text-[11px] font-extrabold uppercase px-3.5 py-2 rounded-lg shadow-glow-emerald transition-all duration-200 flex items-center gap-1 whitespace-nowrap border border-emerald-400 group cursor-pointer disabled:opacity-50"
            >
              <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 animate-sheen pointer-events-none" />
              <span className="relative z-10 tracking-wider">
                {scannerMode === 'CLASS_MODE' ? 'OPEN' : 'INWARD'}
              </span>
              <CornerDownLeft className="w-3 h-3 relative z-10 transition-transform group-hover:translate-x-0.5" />
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
              className="p-2 rounded-lg border border-slate-300 bg-white hover:bg-blue-50 hover:border-blue-400 hover:text-[#1565D8] text-slate-700 active:scale-95 transition-all shadow-2xs group cursor-pointer"
              title="Upload photo / file"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* 7. CONTENT AREA: CLASS LIST (STAGE 1) VS MEMBER LIST (STAGE 2) */}
        {scannerMode === 'CLASS_MODE' ? (
          /* STAGE 1: INWARD ROLE SEES VERIFIED INWARDED BOOKLETS; ADMIN SEES IMPORTED BUNDLES */
          isRestrictedInward ? (
            <div className="glass-card rounded-xl shadow-xs border border-slate-200/90 overflow-hidden">
              <div className="p-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>MY INWARDED CLASS IDS</span>
                  <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-mono text-[9px]">
                    {myClassSummaries.length}
                  </span>
                </h2>

                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-tabular">
                  {myTotalInwardedCount} Scripts
                </span>
              </div>

              <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto p-1.5 space-y-1.5">
                {myClassSummaries.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#64748B]">
                    <ScanIcon className="h-5 w-5 text-slate-300 mx-auto mb-1" />
                    <div className="font-semibold text-slate-600 text-[11px]">No inwarded Class IDs recorded yet by you.</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">Scan a Class ID barcode above using camera to open a bundle.</div>
                  </div>
                ) : (
                  myClassSummaries.map(summary => {
                    const isExpanded = Boolean(expandedClassIds[summary.classId]);
                    const isComplete = summary.status === 'COMPLETED';

                    return (
                      <div
                        key={summary.classId}
                        className={`p-2.5 rounded-lg border transition-all ${
                          isComplete
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono font-black text-xs text-[#172033]">
                            Class ID: <strong className="text-[#1565D8]">{summary.classId}</strong>
                          </span>
                          <span
                            className={`px-1.5 py-0.2 text-[8px] font-bold uppercase rounded border ${
                              isComplete
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-blue-100 text-blue-800 border-blue-300'
                            }`}
                          >
                            {summary.status}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between text-xs font-mono font-bold text-[#172033] mb-1 font-tabular">
                          <div>
                            <span className={isComplete ? 'text-emerald-700' : 'text-[#1565D8]'}>
                              {summary.inwardedCount}
                            </span>
                            <span className="text-slate-400"> / </span>
                            <span>{summary.expectedCount}</span>
                            <span className="text-[10px] font-sans font-medium text-slate-500 ml-1 lowercase">
                              inwarded
                            </span>
                          </div>
                          <span className="text-slate-500 font-tabular text-[10px]">
                            {summary.progressPercentage}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mb-2">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isComplete ? 'bg-emerald-600' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(summary.progressPercentage > 0 ? 5 : 0, summary.progressPercentage))}%` }}
                          />
                        </div>

                        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() => openClassBundle(summary.classId)}
                            className="flex-1 py-1 bg-[#1565D8] hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors text-center cursor-pointer shadow-2xs"
                          >
                            Open Class ID {summary.classId}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleExpandClass(summary.classId)}
                            className="px-2 py-1 bg-slate-50 border border-slate-200 text-slate-600 text-[9px] font-bold rounded-md hover:bg-slate-100 cursor-pointer"
                          >
                            {isExpanded ? 'Hide ▲' : `${summary.inwardedCount} Scripts ▼`}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-200 max-h-[140px] overflow-y-auto divide-y divide-slate-100 text-[10px] font-mono">
                            {summary.records.map((rec, idx) => (
                              <div key={rec.id || idx} className="py-1 flex items-center justify-between">
                                <span className="font-bold text-[#172033]">{rec.member_id}</span>
                                <span className="text-slate-400">
                                  {rec.scanned_at ? new Date(rec.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Saved'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* Admin View: Full Imported Class Bundles Directory */
            <div className="glass-card rounded-xl shadow-xs border border-slate-200/90 overflow-hidden">
              <div className="p-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#1565D8]" />
                  <span>IMPORTED CLASS ID BUNDLES</span>
                  <span className="px-1.5 py-0.2 bg-blue-50 text-[#1565D8] border border-blue-200 rounded font-mono text-[9px]">
                    {bundles.length}
                  </span>
                </h2>

                <input
                  type="text"
                  value={classFilter}
                  onChange={e => setClassFilter(e.target.value)}
                  placeholder="Filter Class ID..."
                  className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white w-28 text-slate-800"
                />
              </div>

              <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                {bundles.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#64748B]">
                    No imported Class IDs available.
                  </div>
                ) : (
                  bundles
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
                                Class ID: {b.classId}
                              </span>
                              <span className={`px-1.5 py-0.2 text-[9px] font-bold uppercase rounded border ${badgeColor}`}>
                                {b.status}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#64748B] mt-1 flex items-center gap-2 font-tabular">
                              <span>Expected: <strong className="text-[#172033]">{b.expectedCount}</strong></span>
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
                    })
                )}
              </div>
            </div>
          )
        ) : (
          /* STAGE 2: MEMBER TABS (INWARDED / PENDING / ALL) FOR ACTIVE CLASS (Stitch Design) */
          <div className="glass-card rounded-xl p-2.5 shadow-xs border border-slate-200/90 overflow-hidden">
            {/* Segmented Member Tabs */}
            <div className="flex border-b border-slate-200 pb-1.5 gap-1" role="tablist">
              <button
                type="button"
                onClick={() => setMemberTab('inwarded')}
                className={`flex-1 py-1 text-center text-xs transition cursor-pointer ${
                  memberTab === 'inwarded'
                    ? 'font-black text-[#1565D8] border-b-2 border-[#1565D8]'
                    : 'font-bold text-slate-500 hover:text-slate-800'
                }`}
              >
                INWARDED ({inwardedListCount})
              </button>

              <button
                type="button"
                onClick={() => setMemberTab('not_inwarded')}
                className={`flex-1 py-1 text-center text-xs transition cursor-pointer ${
                  memberTab === 'not_inwarded'
                    ? 'font-black text-rose-600 border-b-2 border-rose-600'
                    : 'font-bold text-slate-500 hover:text-slate-800'
                }`}
              >
                PENDING ({notInwardedListCount})
              </button>

              <button
                type="button"
                onClick={() => setMemberTab('all')}
                className={`flex-1 py-1 text-center text-xs transition cursor-pointer ${
                  memberTab === 'all'
                    ? 'font-black text-blue-600 border-b-2 border-blue-600'
                    : 'font-bold text-slate-500 hover:text-slate-800'
                }`}
              >
                ALL ({bundleRecords.length})
              </button>
            </div>

            {/* Live Search Field */}
            <div className="mt-2 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search member ID or barcode..."
                className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50/90 placeholder:text-slate-400 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-[#1565D8] transition"
              />
            </div>

            {/* Member List */}
            <div className="mt-2 space-y-1.5 max-h-[380px] overflow-y-auto pr-0.5 no-scrollbar">
              {filteredMemberRecords.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#64748B]">
                  No members found in this view.
                </div>
              ) : (
                filteredMemberRecords.map(r => {
                  const isInwarded = r.scan_status === 'saved' || r.scan_status === 'pending_save';
                  const isManual = r.scanned_by?.includes('Manual') || r.saved_by?.includes('Manual');

                  return (
                    <div
                      key={r.id}
                      className="p-2 rounded-lg border border-slate-200 bg-white hover:border-blue-300 transition-all flex items-center justify-between shadow-2xs"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-extrabold text-xs text-slate-900 font-mono tracking-wide">
                            {r.member_id}
                          </h4>
                          {isManual && (
                            <span className="text-[8px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-sans font-bold border border-amber-300">
                              Manual
                            </span>
                          )}
                        </div>
                        {r.barcode && (
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                            Barcode: <span className="text-slate-700">{r.barcode}</span>
                          </p>
                        )}
                        {isInwarded && (r.scanned_by || r.saved_by) && (
                          <p className="text-[9px] text-slate-400 font-medium">
                            By: <strong className="text-slate-600">{r.scanned_by || r.saved_by}</strong>
                            {r.scanned_at && <span> • {new Date(r.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0">
                        {isInwarded ? (
                          <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-2xs">
                            <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            <span>INWARDED</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <span>PENDING</span>
                          </div>
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

      {/* CONFIRMATION POPUP MODAL (Requirement 2): Shown when user clicks SAVE and Not Inward > 0 */}
      {showSaveConfirmModal && saveConfirmData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-black text-slate-900 leading-tight">
                  Confirm Bundle Inward Save
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Class ID: <span className="font-bold text-slate-800">{saveConfirmData.classId}</span>
                </p>
              </div>
            </div>

            {/* Script counts badge summary */}
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div className="bg-white p-2 rounded-lg border border-emerald-200 text-center shadow-2xs">
                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Inwarded</div>
                <div className="text-lg font-black text-emerald-700">
                  {saveConfirmData.inwardedCount} <span className="text-xs text-slate-400 font-normal">scripts</span>
                </div>
              </div>
              <div className="bg-white p-2 rounded-lg border border-amber-200 text-center shadow-2xs">
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Pending (Not Inward)</div>
                <div className="text-lg font-black text-amber-700">
                  {saveConfirmData.notInwardedCount} <span className="text-xs text-slate-400 font-normal">scripts</span>
                </div>
              </div>
            </div>

            {/* Question prompt */}
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to save this bundle? Currently, the inwarded section has{' '}
              <strong className="text-slate-900">{saveConfirmData.inwardedCount}</strong> scripts out of{' '}
              <strong className="text-slate-900">{saveConfirmData.totalCount}</strong> expected scripts, and{' '}
              <strong className="text-amber-700">{saveConfirmData.notInwardedCount}</strong> scripts remain pending.
            </p>

            {/* Mandatory Checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 border border-amber-200 cursor-pointer select-none transition-colors hover:bg-amber-100/60">
              <input
                type="checkbox"
                checked={saveConfirmChecked}
                onChange={(e) => setSaveConfirmChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded text-[#1565D8] focus:ring-[#1565D8] border-slate-300 cursor-pointer"
              />
              <span className="text-[11px] font-bold text-slate-800 leading-snug">
                I confirm saving Class {saveConfirmData.classId} with {saveConfirmData.inwardedCount} scripts inwarded ({saveConfirmData.notInwardedCount} scripts pending).
              </span>
            </label>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowSaveConfirmModal(false)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 active:scale-98 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!saveConfirmChecked || isSaving}
                onClick={() => {
                  setShowSaveConfirmModal(false);
                  handleSaveClassInward(false);
                }}
                className="flex-1 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-[#16A34A] hover:bg-[#15803D] active:scale-98 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{isSaving ? 'Saving...' : 'Confirm & Save'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXAM DATE MISMATCH WARNING MODAL */}
      {dateMismatchModal && dateMismatchModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border-2 border-amber-400 shadow-2xl max-w-sm w-full p-5 text-[#172033] relative">
            <button
              onClick={() => setDateMismatchModal(null)}
              className="absolute top-3.5 right-3.5 p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-600 shrink-0 shadow-xs">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="flex-1 pr-5">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                  Exam Date Mismatch
                </h3>
                <p className="text-[11px] text-amber-700 font-semibold mt-0.5">
                  Inwarding Blocked For Current Schedule
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-amber-50/90 border border-amber-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-600">Scanned Record Date:</span>
                <span className="px-2 py-0.5 bg-amber-200/90 text-amber-900 font-black rounded-lg border border-amber-300 font-mono text-[11px]">
                  📅 {dateMismatchModal.recordExamDate}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-600">Active Station Date:</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-900 font-black rounded-lg border border-blue-200 font-mono text-[11px]">
                  📅 {dateMismatchModal.activeExamDate}
                </span>
              </div>
              {dateMismatchModal.targetClassId && (
                <div className="flex items-center justify-between border-t border-amber-200/70 pt-1.5">
                  <span className="font-medium text-slate-500">Class ID:</span>
                  <span className="font-bold font-mono text-slate-800">{dateMismatchModal.targetClassId}</span>
                </div>
              )}
            </div>

            <div className="mt-3.5 text-xs leading-relaxed text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p className="font-medium">
                This booklet belongs to date <strong className="text-amber-800 font-black">{dateMismatchModal.recordExamDate}</strong>.
                You cannot inward it under the current date (<strong className="text-blue-800 font-black">{dateMismatchModal.activeExamDate}</strong>).
              </p>
              <p className="mt-1 text-slate-500 font-medium">
                To inward this booklet, please change the date to <strong className="text-amber-800 font-black">{dateMismatchModal.recordExamDate}</strong> and open that bundle.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleSwitchDateAndOpenBundle(dateMismatchModal.recordExamDate, dateMismatchModal.targetClassId)}
                className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                <CalendarIcon className="w-4 h-4" />
                Switch to {dateMismatchModal.recordExamDate} & Open Bundle
              </button>
              <button
                type="button"
                onClick={() => setDateMismatchModal(null)}
                className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
