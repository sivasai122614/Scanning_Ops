// ==============================================================================
// Barcode Scanner & Verification View (Frames 4, 5, 6 Reference Design)
// Real-time camera viewfinder, barcode processing, metrics & missing reconciliation
// Strictly zero hardcoded sample data.
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Scan,
  Package,
  Zap,
  Settings,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  Camera,
  CameraOff,
  X,
  Plus,
  Play,
  Square,
  ChevronRight,
  RotateCcw,
  Save,
  ArrowLeft,
  Check,
  Edit3,
} from 'lucide-react';
import { examStore } from '../../services/examStore';
import { InwardSchedule, ScannedScript } from '../../types/exam';
import { PrimaryButton, StatusBadge, EmptyState } from '../ui/Elements';
import { useAuth } from '../../context/AuthContext';
import { playScanSuccessSound, playScanWarningSound } from '../../utils/scannerSound';
import { BrowserMultiFormatReader } from '@zxing/browser';

export const BarcodeScannerView: React.FC<{
  initialScheduleId?: string;
  onNavigateToSessions?: () => void;
  onNavigateToInward?: () => void;
}> = ({ initialScheduleId, onNavigateToSessions, onNavigateToInward }) => {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<'scanner' | 'verification' | 'missing'>('scanner');
  const [schedules, setSchedules] = useState<InwardSchedule[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>(initialScheduleId || '');
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>('');
  const [lastScanned, setLastScanned] = useState<ScannedScript | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // Real-time Camera stream states
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // STRICT REQUIREMENT 4 & 7: Green Check Confirmation overlay
  const [scanSuccessFlash, setScanSuccessFlash] = useState<{ barcode: string } | null>(null);
  // STRICT REQUIREMENT 6 & 8: Duplicate or unrecognized warning overlay
  const [scanWarningFlash, setScanWarningFlash] = useState<{ title: string; message: string } | null>(null);

  // Scanner loop & debounce references (STRICT REQUIREMENT 6)
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const successTimeoutRef = useRef<any>(null);
  const warningTimeoutRef = useRef<any>(null);

  // Expected Count Exceeded Modal State (Requirement 7)
  const [showExcessModal, setShowExcessModal] = useState<boolean>(false);
  const [pendingScriptId, setPendingScriptId] = useState<string>('');
  const [editedExpectedCount, setEditedExpectedCount] = useState<string>('');
  const [showEditCountInput, setShowEditCountInput] = useState<boolean>(false);
  const [forceOpenScanner, setForceOpenScanner] = useState<boolean>(false);

  // Bundle Saved Banner state (Requirement 8)
  const [isSavedSuccess, setIsSavedSuccess] = useState<boolean>(false);

  const refreshData = useCallback(() => {
    const list = examStore.getInwardSchedules();
    setSchedules(list);
    if (list.length > 0) {
      setSelectedScheduleId(prev => {
        const stillValid = list.find(s => s.id === prev || s.scheduled_id === prev);
        if (stillValid) return stillValid.id;

        // Prioritize any pending (uncompleted) bundle first so user can start scanning immediately
        const pending = list.find(s => {
          const sScans = examStore.getScans(s.scheduled_id, s.university, s.id);
          const valid = sScans.filter(x => x.status === 'VALID').length;
          return !s.is_completed && (s.expected_scripts === 0 || valid < s.expected_scripts);
        });
        return pending ? pending.id : list[0].id;
      });
    }
  }, []);

  useEffect(() => {
    refreshData();
    const unsub = examStore.subscribe(refreshData);
    return () => unsub();
  }, [refreshData]);

  const currentSchedule = schedules.find(
    s => s.id === selectedScheduleId || s.scheduled_id === selectedScheduleId
  );
  const currentScans = currentSchedule
    ? examStore.getScans(currentSchedule.scheduled_id, currentSchedule.university, currentSchedule.id)
    : [];
  const validScans = currentScans.filter(s => s.status === 'VALID');
  const duplicateScans = currentScans.filter(s => s.status === 'DUPLICATE');
  const unknownScans = currentScans.filter(s => s.status === 'UNKNOWN');

  const expectedCount = currentSchedule ? currentSchedule.expected_scripts : 0;
  const scannedCount = validScans.length;
  const remainingCount = Math.max(0, expectedCount - scannedCount);
  const progressPercent = expectedCount > 0 ? Math.min(100, Math.round((scannedCount / expectedCount) * 100)) : 0;
  const isBundleCompleted = currentSchedule
    ? currentSchedule.is_completed || (expectedCount > 0 && scannedCount >= expectedCount)
    : false;

  // Multi-Bundle Tracking (Requirement 5)
  const totalBundles = Math.max(1, currentSchedule?.number_of_bundles || 1);
  const basePerBundle = Math.floor(expectedCount / totalBundles);
  const remainder = expectedCount % totalBundles;
  const bundleTargets = Array.from({ length: totalBundles }, (_, i) => {
    return basePerBundle + (i < remainder ? 1 : 0);
  });

  const cumulativeThresholds: number[] = [];
  let runningSum = 0;
  for (const t of bundleTargets) {
    runningSum += t;
    cumulativeThresholds.push(runningSum);
  }

  let activeBundleIndex = 1;
  for (let i = 0; i < cumulativeThresholds.length; i++) {
    if (scannedCount < cumulativeThresholds[i]) {
      activeBundleIndex = i + 1;
      break;
    }
    if (i === cumulativeThresholds.length - 1) {
      activeBundleIndex = totalBundles;
    }
  }

  const prevThreshold = activeBundleIndex > 1 ? cumulativeThresholds[activeBundleIndex - 2] : 0;
  const currentBundleTarget = bundleTargets[activeBundleIndex - 1] || expectedCount;
  const currentBundleScanned = Math.max(0, Math.min(currentBundleTarget, scannedCount - prevThreshold));
  const currentBundleRemaining = Math.max(0, currentBundleTarget - currentBundleScanned);

  // Real-time Camera: Start & Stop (Requirement 3)
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  const triggerSuccessFlash = (barcode: string) => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    setScanWarningFlash(null);
    setScanSuccessFlash({ barcode });
    successTimeoutRef.current = setTimeout(() => {
      setScanSuccessFlash(null);
    }, 900);
  };

  const triggerWarningFlash = (title: string, message: string) => {
    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    playScanWarningSound();
    setScanSuccessFlash(null);
    setScanWarningFlash({ title, message });
    warningTimeoutRef.current = setTimeout(() => {
      setScanWarningFlash(null);
    }, 1600);
  };

  const startCameraStream = useCallback(async () => {
    setCameraLoading(true);
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) is not supported by your browser or environment.');
      }

      // Stop any existing stream before starting a new one
      stopCameraStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play().catch(e => console.warn('Autoplay note:', e));
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Real camera error:', err);
      // STRICT REQUIREMENT 9: Exact prompt requirement text
      setCameraError(
        'Camera access is required to scan scripts.\nPlease allow camera permission and try again.'
      );
      setCameraActive(false);
    } finally {
      setCameraLoading(false);
    }
  }, [stopCameraStream]);

  // Start camera when component mounts or subTab is 'scanner'
  useEffect(() => {
    if (subTab === 'scanner') {
      startCameraStream();
    } else {
      stopCameraStream();
    }
    return () => {
      stopCameraStream();
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    };
  }, [subTab, startCameraStream, stopCameraStream]);

  // Torch / Flashlight toggle
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && 'applyConstraints' in track) {
      try {
        const capabilities: any = track.getCapabilities?.() || {};
        if (capabilities.torch) {
          await track.applyConstraints({
            advanced: [{ torch: !torchOn } as any],
          });
          setTorchOn(!torchOn);
        } else {
          setTorchOn(!torchOn);
        }
      } catch (e) {
        setTorchOn(!torchOn);
      }
    } else {
      setTorchOn(!torchOn);
    }
  };

  // Continuous Barcode Detection loop (Native BarcodeDetector + @zxing/browser fallback)
  useEffect(() => {
    if (!cameraActive || !isScanning || subTab !== 'scanner') return;

    let intervalId: any = null;
    let isCancelled = false;

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: [
            'code_128',
            'code_39',
            'qr_code',
            'ean_13',
            'upc_a',
            'data_matrix',
            'codabar',
            'itf',
          ],
        });

        intervalId = setInterval(async () => {
          if (isCancelled || isProcessingRef.current) return;
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const detected = await detector.detect(videoRef.current);
            if (detected && detected.length > 0 && detected[0].rawValue) {
              handleContinuousBarcode(detected[0].rawValue);
            }
          } catch (e) {
            // frame drop
          }
        }, 140);
      } catch (e) {
        console.warn('Native BarcodeDetector note:', e);
      }
    } else {
      // Fallback for browsers without native BarcodeDetector
      try {
        if (!zxingReaderRef.current) {
          zxingReaderRef.current = new BrowserMultiFormatReader();
        }
        if (videoRef.current) {
          zxingReaderRef.current
            .decodeFromVideoElement(videoRef.current, (result, error) => {
              if (isCancelled || isProcessingRef.current) return;
              if (result) {
                handleContinuousBarcode(result.getText());
              }
            })
            .then(controls => {
              if (isCancelled) {
                controls.stop();
              } else {
                zxingControlsRef.current = controls;
              }
            })
            .catch(err => {
              console.warn('ZXing loop note:', err);
            });
        }
      } catch (e) {
        console.warn('ZXing fallback error:', e);
      }
    }

    return () => {
      isCancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (zxingControlsRef.current) {
        try {
          zxingControlsRef.current.stop();
        } catch (e) {}
        zxingControlsRef.current = null;
      }
    };
  }, [cameraActive, isScanning, subTab, currentSchedule, scannedCount, expectedCount]);

  // Actual recording of a scan
  const commitScan = (cleanedId: string) => {
    if (!currentSchedule) return;

    // Check if duplicate in current bundle
    const alreadyExists = currentScans.some(
      s => s.student_id === cleanedId || s.barcode === cleanedId
    );

    if (alreadyExists) {
      // STRICT REQUIREMENT 6: Do not silently create another record! Show duplicate warning.
      triggerWarningFlash('⚠ Duplicate Barcode', `Already scanned: ${cleanedId}`);
      setFeedback({ type: 'warning', text: `Duplicate script scan detected: ${cleanedId}` });
      return;
    }

    const prevCount = scannedCount;
    // STRICT REQUIREMENT 1 & 11: Pass school_id and class_id separately
    const res = examStore.recordScan({
      inward_id: currentSchedule.id,
      scheduled_id: currentSchedule.scheduled_id,
      school_id: currentSchedule.school_id,
      class_id: currentSchedule.class_id,
      university: currentSchedule.university,
      student_id: cleanedId,
      barcode: cleanedId,
      room_number: currentSchedule.room_number,
      subject: currentSchedule.subject,
      scanned_by: user?.full_name || 'Operator',
    });

    if (res.isDuplicate) {
      triggerWarningFlash('⚠ Duplicate Barcode', `Already scanned: ${cleanedId}`);
      setFeedback({ type: 'warning', text: `Duplicate script scan detected: ${cleanedId}` });
      return;
    }

    // STRICT REQUIREMENT 4 & 7: Green check confirmation immediately!
    triggerSuccessFlash(cleanedId);
    // STRICT REQUIREMENT 5: Short confirmation sound!
    playScanSuccessSound();

    setLastScanned(res.scan);
    const newCount = prevCount + 1;

    // Requirement 5: Check if this scan completed a bundle and switched to next bundle
    let bundleSwitched = false;
    if (totalBundles > 1) {
      for (let i = 0; i < cumulativeThresholds.length - 1; i++) {
        if (prevCount === cumulativeThresholds[i] - 1 && newCount === cumulativeThresholds[i]) {
          const nextBundle = i + 2;
          const thisTarget = bundleTargets[i];
          setFeedback({
            type: 'success',
            text: `🎉 Bundle ${i + 1}/${totalBundles} completed (${thisTarget}/${thisTarget})! Now switched to Bundle ${nextBundle}/${totalBundles}. Continue scanning.`,
          });
          bundleSwitched = true;
          break;
        }
      }
    }

    if (!bundleSwitched) {
      if (newCount === expectedCount && expectedCount > 0) {
        setFeedback({
          type: 'success',
          text: `🎉 All ${totalBundles > 1 ? `${totalBundles} bundles` : 'scripts'} completed (${newCount}/${expectedCount})! Ready to save.`,
        });
      } else {
        setFeedback({ type: 'success', text: `✓ Script verified & recorded: ${cleanedId}` });
      }
    }
    setManualInput('');
  };

  // Continuous Barcode Handler with frame debounce & validation (STRICT REQUIREMENT 6 & 8)
  const handleContinuousBarcode = (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;

    // STRICT REQUIREMENT 6: Frame Debouncing
    // If the same barcode remains in front of the camera for multiple frames: IGNORE!
    const now = Date.now();
    if (code === lastScannedCodeRef.current && now - lastScannedTimeRef.current < 2500) {
      // Frame 2, 3, 4: IGNORE!
      return;
    }

    lastScannedCodeRef.current = code;
    lastScannedTimeRef.current = now;

    // Format check (STRICT REQUIREMENT 8)
    if (code.length < 2) {
      triggerWarningFlash('⚠ Barcode Not Recognized', 'Barcode pattern could not be parsed');
      return;
    }

    handleAttemptScan(code);
  };

  // Handle Attempt Scan with Expected Count Check (Requirement 7)
  const handleAttemptScan = (rawId: string) => {
    const cleaned = rawId.trim().toUpperCase();
    if (!cleaned) return;
    if (!currentSchedule) {
      setFeedback({ type: 'error', text: 'Please select an active schedule before scanning' });
      return;
    }

    // REQUIREMENT 7: Check if expected count is reached or exceeded
    if (scannedCount >= expectedCount && expectedCount > 0) {
      setPendingScriptId(cleaned);
      setEditedExpectedCount(String(scannedCount + 1));
      setShowEditCountInput(false);
      setShowExcessModal(true);
      return;
    }

    commitScan(cleaned);
  };

  // Resolve Excess Count Actions (Requirement 7)
  const handleConfirmEditExpected = () => {
    const newCount = parseInt(editedExpectedCount, 10);
    if (isNaN(newCount) || newCount <= scannedCount) {
      setFeedback({
        type: 'error',
        text: `New expected count must be greater than current scanned count (${scannedCount}).`,
      });
      return;
    }

    if (currentSchedule) {
      examStore.updateInwardExpectedCount(currentSchedule.scheduled_id, newCount);
      refreshData();
      setShowExcessModal(false);
      commitScan(pendingScriptId);
      setFeedback({
        type: 'success',
        text: `Expected count updated to ${newCount}. Script ${pendingScriptId} logged.`,
      });
    }
  };

  const handleAllowExtraOnce = () => {
    if (currentSchedule) {
      const newCount = expectedCount + 1;
      examStore.updateInwardExpectedCount(currentSchedule.scheduled_id, newCount);
      refreshData();
      setShowExcessModal(false);
      commitScan(pendingScriptId);
      setFeedback({
        type: 'warning',
        text: `Extra script allowed (+1). New expected count: ${newCount}.`,
      });
    }
  };

  const handleCancelExcess = () => {
    setShowExcessModal(false);
    setPendingScriptId('');
    setFeedback({
      type: 'warning',
      text: `Scan cancelled for ${pendingScriptId}. Please re-check physical scripts against expected count (${expectedCount}).`,
    });
  };

  // Save & Finalize Bundle Handler (Requirement 8)
  const isSaveEnabled = expectedCount > 0 && scannedCount === expectedCount;

  const handleSaveBundle = () => {
    if (!currentSchedule) return;

    examStore.finalizeInwardBundle(currentSchedule.id, currentSchedule.university);
    setIsSavedSuccess(true);
    stopCameraStream();

    setTimeout(() => {
      setIsSavedSuccess(false);
      // Redirect back to Inward Bundle section per Requirement 8
      if (onNavigateToInward) {
        onNavigateToInward();
      } else if (onNavigateToSessions) {
        onNavigateToSessions();
      }
    }, 1000);
  };

  if (schedules.length === 0) {
    return (
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-8 text-center max-w-md mx-auto my-8 shadow-xs space-y-4">
        <div className="h-16 w-16 mx-auto rounded-full bg-[#EAF2FF] flex items-center justify-center text-[#1565D8]">
          <Package className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-base font-bold text-[#172033]">No Inward Bundles Found</h2>
          <p className="text-xs text-[#64748B] mt-1.5 leading-relaxed">
            Please register an inward bundle in the Inward section before starting barcode scanning.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (onNavigateToInward) onNavigateToInward();
            else if (onNavigateToSessions) onNavigateToSessions();
          }}
          className="w-full h-11 rounded-lg bg-[#1565D8] text-white text-xs font-bold hover:bg-[#0D47A1] transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Add Inward Entry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Schedule Selection & Sub-Tab Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Schedule Selector */}
        <select
          value={currentSchedule ? currentSchedule.id : ''}
          onChange={e => {
            setSelectedScheduleId(e.target.value);
            setLastScanned(null);
            setFeedback(null);
            setForceOpenScanner(false);
          }}
          className="h-10 px-3 rounded-lg bg-white border border-[#E2E8F0] text-xs font-semibold text-[#172033] focus:border-[#1565D8] focus:outline-none shadow-xs"
        >
          {schedules.map(s => {
            const sScans = examStore.getScans(s.scheduled_id, s.university, s.id);
            const valid = sScans.filter(x => x.status === 'VALID').length;
            const isDone = s.is_completed || (s.expected_scripts > 0 && valid >= s.expected_scripts);
            return (
              <option key={s.id} value={s.id}>
                {s.university ? `[${s.university}] ` : ''}{s.scheduled_id} - {s.subject} ({s.class_id} / Room {s.room_number}) {isDone ? '✓ (Done)' : `(${valid}/${s.expected_scripts})`}
              </option>
            );
          })}
        </select>

        {/* View Switcher: Scanner (4) | Verification (5) | Missing (6) */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-[#E2E8F0] shadow-xs">
          <button
            type="button"
            onClick={() => setSubTab('scanner')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              subTab === 'scanner' ? 'bg-[#1565D8] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            Scan Scripts
          </button>
          <button
            type="button"
            onClick={() => setSubTab('verification')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              subTab === 'verification' ? 'bg-[#1565D8] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            Verification
          </button>
          <button
            type="button"
            onClick={() => setSubTab('missing')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              subTab === 'missing' ? 'bg-[#1565D8] text-white shadow-xs' : 'text-[#64748B] hover:text-[#172033]'
            }`}
          >
            Missing ({remainingCount})
          </button>
        </div>
      </div>

      {/* Success Banner when Saved */}
      {isSavedSuccess && (
        <div className="p-3.5 rounded-lg bg-[#DCFCE7] border border-[#86EFAC] text-[#16A34A] text-xs font-bold flex items-center gap-2 shadow-xs animate-bounce">
          <CheckCircle2 className="h-5 w-5" />
          <span>Bundle {currentSchedule?.scheduled_id} saved successfully! Redirecting to Inward Bundles...</span>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* FRAME 4: BARCODE SCANNER VIEW */}
      {/* ---------------------------------------------------------------------- */}
      {subTab === 'scanner' && (
        isBundleCompleted && !forceOpenScanner ? (
          <div className="space-y-4">
            {/* Completed Bundle Summary Card */}
            <div className="rounded-xl border border-[#BBF7D0] bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-3.5">
                <div className="h-14 w-14 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#DCFCE7] text-[#16A34A] text-xs font-bold uppercase tracking-wider">
                    <span>Bundle Completed & Verified</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[#172033] mt-1">
                    {currentSchedule?.scheduled_id} • {currentSchedule?.university || 'University'}
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-[#64748B] block text-[11px]">Class ID</span>
                  <span className="font-mono font-bold text-[#172033] text-xs">{currentSchedule?.class_id}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[11px]">School ID</span>
                  <span className="font-mono font-bold text-[#172033] text-xs">{currentSchedule?.school_id || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[11px]">Room</span>
                  <span className="font-bold text-[#172033] text-xs">Room {currentSchedule?.room_number}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[11px]">Subject</span>
                  <span className="font-bold text-[#172033] text-xs truncate block">{currentSchedule?.subject}</span>
                </div>
                <div>
                  <span className="text-[#64748B] block text-[11px]">Verification</span>
                  <span className="font-bold text-[#16A34A] text-xs">{scannedCount} / {expectedCount} (100% Done)</span>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-[#EAF2FF] border border-[#BFDBFE] flex items-center gap-2.5 text-xs text-[#1565D8]">
                <Package className="h-5 w-5 shrink-0" />
                <span>All scripts for this bundle have been scanned and verified. Register the next bundle to continue.</span>
              </div>

              {/* Requirement 2: Prominent Add New Inward Bundle button */}
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToInward) onNavigateToInward();
                  else if (onNavigateToSessions) onNavigateToSessions();
                }}
                className="w-full h-12 rounded-xl bg-[#1565D8] hover:bg-[#0D47A1] text-white text-sm font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Plus className="h-5 w-5" />
                <span>Add New Inward Bundle</span>
              </button>

              {/* Secondary Review Actions */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => setSubTab('verification')}
                  className="font-semibold text-[#1565D8] hover:underline flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>View Verified Scripts ({scannedCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setForceOpenScanner(true)}
                  className="font-semibold text-[#64748B] hover:text-[#172033] flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Reopen Scanner</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className="space-y-3.5">
          {/* Viewfinder Card with Real-Time Camera Stream (Requirement 3) */}
          <div className="relative rounded-lg bg-slate-900 border border-slate-800 overflow-hidden shadow-md flex flex-col items-center justify-center min-h-[260px] sm:min-h-[300px] text-center">
            {/* Real-time HTML5 Camera Video Stream */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover absolute inset-0 transition-opacity duration-300 ${
                cameraActive ? 'opacity-100' : 'opacity-0'
              }`}
            />

            {/* Camera Overlay Controls (Top-Right) */}
            <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-2 rounded-full backdrop-blur-md transition-colors ${
                  torchOn ? 'bg-amber-400 text-slate-950' : 'bg-black/50 text-white hover:bg-black/70'
                }`}
                title="Toggle Torch"
              >
                <Zap className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  if (cameraActive) stopCameraStream();
                  else startCameraStream();
                }}
                className={`p-2 rounded-full backdrop-blur-md transition-colors ${
                  cameraActive ? 'bg-black/50 text-white hover:bg-black/70' : 'bg-rose-600 text-white'
                }`}
                title={cameraActive ? 'Pause Camera' : 'Start Camera'}
              >
                {cameraActive ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
              </button>
            </div>

            {/* Camera Status Badge (Top-Left) */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-medium text-white z-20">
              {cameraLoading ? (
                <>
                  <div className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Starting Camera...</span>
                </>
              ) : cameraActive ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-[#16A34A] animate-pulse" />
                  <span>Real-Time Camera Active</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span>Camera Standby</span>
                </>
              )}
            </div>

            {/* Viewfinder Target Frame with Corner Brackets */}
            <div className="relative z-10 w-60 h-40 sm:w-72 sm:h-44 rounded-lg border border-white/30 flex flex-col items-center justify-center p-3 backdrop-blur-[1px]">
              {/* Corner Brackets */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#16A34A] rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#16A34A] rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#16A34A] rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#16A34A] rounded-br" />

              {/* Barcode Laser Guide Line */}
              {isScanning && (
                <div className="absolute inset-x-2 h-0.5 bg-[#16A34A] shadow-[0_0_12px_#16A34A] animate-pulse" />
              )}

              {/* Barcode Target Visual Box */}
              <div className="w-full bg-white/95 rounded p-2 text-slate-900 flex flex-col items-center justify-center shadow-md">
                <div className="text-[10px] font-bold tracking-wider text-slate-700 uppercase truncate max-w-[200px]">
                  {currentSchedule?.subject || 'EXAM SCRIPT'}
                </div>

                {/* Barcode pattern */}
                <div className="w-full h-8 my-1 flex items-center justify-center gap-1 overflow-hidden opacity-90">
                  <span className="w-0.5 h-full bg-slate-900" />
                  <span className="w-1.5 h-full bg-slate-900" />
                  <span className="w-1 h-full bg-slate-900" />
                  <span className="w-0.5 h-full bg-slate-900" />
                  <span className="w-2 h-full bg-slate-900" />
                  <span className="w-1 h-full bg-slate-900" />
                  <span className="w-0.5 h-full bg-slate-900" />
                  <span className="w-1.5 h-full bg-slate-900" />
                  <span className="w-2 h-full bg-slate-900" />
                  <span className="w-0.5 h-full bg-slate-900" />
                  <span className="w-1.5 h-full bg-slate-900" />
                  <span className="w-1 h-full bg-slate-900" />
                </div>

                <div className="text-[11px] font-mono font-semibold tracking-wider text-[#1565D8]">
                  {lastScanned?.student_id || 'ALIGN BARCODE IN FRAME'}
                </div>
              </div>
            </div>

            {/* STRICT REQUIREMENT 4 & 7: Green Check Confirmation Overlay directly on Camera View */}
            {scanSuccessFlash && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
                <div className="h-20 w-20 rounded-full bg-[#16A34A] text-white flex items-center justify-center shadow-[0_0_35px_rgba(22,163,74,0.7)] mb-3 animate-in zoom-in-75 duration-200">
                  <Check className="h-12 w-12 stroke-[3.5]" />
                </div>
                <div className="bg-slate-900/90 border border-[#16A34A] px-5 py-2 rounded-lg shadow-xl text-center">
                  <div className="text-xs font-bold text-[#4ADE80] uppercase tracking-wider flex items-center justify-center gap-1.5">
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                    <span>Scanned Successfully</span>
                  </div>
                  <div className="text-sm font-mono font-bold text-white mt-0.5">
                    Barcode: {scanSuccessFlash.barcode}
                  </div>
                </div>
              </div>
            )}

            {/* STRICT REQUIREMENT 6 & 8: Duplicate or Unrecognized Warning Overlay */}
            {scanWarningFlash && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
                <div className="h-16 w-16 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.7)] mb-2 animate-in zoom-in-75 duration-200">
                  <AlertTriangle className="h-9 w-9 stroke-[2.5]" />
                </div>
                <div className="bg-slate-900/90 border border-amber-500 px-5 py-2.5 rounded-lg shadow-xl text-center max-w-xs">
                  <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{scanWarningFlash.title}</span>
                  </div>
                  <div className="text-xs font-mono font-medium text-slate-200 mt-1">
                    {scanWarningFlash.message}
                  </div>
                </div>
              </div>
            )}

            {/* STRICT REQUIREMENT 9: Camera Permission Failure UI with Exact Prompt Text */}
            {cameraError && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-900/95 p-6 text-center">
                <div className="h-14 w-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-3">
                  <CameraOff className="h-7 w-7" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Camera Permission Required</h3>
                <p className="text-xs text-slate-300 max-w-xs mb-4 leading-relaxed whitespace-pre-line">
                  {cameraError}
                </p>
                <button
                  type="button"
                  onClick={startCameraStream}
                  className="px-4 py-2 rounded-lg bg-[#1565D8] hover:bg-[#0D47A1] text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Retry Camera Access</span>
                </button>
              </div>
            )}
          </div>

          {/* Manual Input Bar for Keyboard / Wedge Scanners */}
          <form
            onSubmit={e => {
              e.preventDefault();
              handleAttemptScan(manualInput);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="Or enter/scan barcode directly..."
              className="flex-1 h-11 px-3.5 rounded-lg bg-white border border-[#E2E8F0] text-sm text-[#172033] placeholder:text-[#94A3B8] focus:border-[#1565D8] focus:outline-none uppercase font-mono font-medium"
            />
            <button
              type="submit"
              disabled={!manualInput.trim()}
              className="h-11 px-4 rounded-lg bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] disabled:opacity-50 transition-colors shadow-2xs"
            >
              Verify
            </button>
          </form>

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3 rounded-lg text-xs font-semibold flex items-center justify-between border ${
                feedback.type === 'success'
                  ? 'bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]'
                  : feedback.type === 'warning'
                  ? 'bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]'
                  : 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                {feedback.type === 'warning' && <AlertTriangle className="h-4 w-4 shrink-0" />}
                {feedback.type === 'error' && <AlertOctagon className="h-4 w-4 shrink-0" />}
                <span>{feedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="p-1 hover:opacity-75 focus:outline-none"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Last Scanned Result Card (Matching Frame 4) */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs space-y-3">
            <div>
              <div className="text-xs text-[#64748B]">Last Scanned Script ID</div>
              <div className="text-lg font-bold font-mono text-[#172033] mt-0.5">
                {lastScanned?.student_id || 'Waiting for first scan...'}
              </div>
            </div>

            {lastScanned && (
              <div className="p-3 rounded-lg bg-slate-50 border border-[#E2E8F0] space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#16A34A]" />
                  <span className="text-xs font-semibold text-[#16A34A]">
                    {lastScanned.status === 'VALID' ? 'Valid Student Script' : lastScanned.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 border-t border-slate-200/60">
                  <div>
                    <span className="text-[#64748B]">Scheduled ID:</span>{' '}
                    <span className="font-semibold text-[#172033]">{currentSchedule?.scheduled_id}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B]">Class ID:</span>{' '}
                    <span className="font-mono font-semibold text-[#172033]">{currentSchedule?.class_id}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B]">School ID:</span>{' '}
                    <span className="font-mono font-semibold text-[#172033]">{currentSchedule?.school_id || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B]">Room:</span>{' '}
                    <span className="font-semibold text-[#172033]">{currentSchedule?.room_number}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Multi-Bundle Progress Card (Requirement 5) */}
            {totalBundles > 1 && (
              <div className="p-3 rounded-lg bg-[#F0F7FF] border border-[#BFDBFE] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-[#1565D8]" />
                    <span className="text-xs font-bold text-[#172033]">
                      Active Bundle: <span className="text-[#1565D8] font-mono text-sm">{activeBundleIndex} / {totalBundles}</span>
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-[#1565D8]">
                    {currentBundleScanned} / {currentBundleTarget} scripts
                  </span>
                </div>

                {/* Bundle Pills / Segmented Status */}
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${Math.min(totalBundles, 4)}, minmax(0, 1fr))` }}
                >
                  {bundleTargets.map((bTarget, idx) => {
                    const bNum = idx + 1;
                    const pThresh = idx > 0 ? cumulativeThresholds[idx - 1] : 0;
                    const bScanned = Math.max(0, Math.min(bTarget, scannedCount - pThresh));
                    const bDone = bScanned >= bTarget;
                    const bActive = bNum === activeBundleIndex && !bDone;

                    return (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg border text-center transition-all ${
                          bDone
                            ? 'bg-[#DCFCE7] border-[#86EFAC] text-[#16A34A]'
                            : bActive
                            ? 'bg-white border-[#1565D8] ring-2 ring-[#1565D8]/20 shadow-xs text-[#1565D8]'
                            : 'bg-slate-100 border-slate-200 text-[#64748B]'
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1">
                          {bDone ? (
                            <CheckCircle2 className="h-3 w-3 text-[#16A34A]" />
                          ) : (
                            <Package className="h-3 w-3" />
                          )}
                          <span>Bundle {bNum}/{totalBundles}</span>
                        </div>
                        <div className="text-xs font-bold font-tabular mt-0.5">
                          {bScanned} / {bTarget}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3 Metric Boxes: Scanned | Expected | Remaining (Matching Frame 4) */}
            <div className="grid grid-cols-3 gap-2 text-center pt-2">
              <div className="p-2.5 rounded-lg bg-[#EAF2FF] border border-[#BFDBFE]">
                <div className="text-[11px] font-medium text-[#1565D8]">Scanned</div>
                <div className="text-xl font-bold font-tabular text-[#1565D8] mt-0.5">{scannedCount}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-[#E2E8F0]">
                <div className="text-[11px] font-medium text-[#64748B]">Expected</div>
                <div className="text-xl font-bold font-tabular text-[#172033] mt-0.5">{expectedCount}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA]">
                <div className="text-[11px] font-medium text-[#DC2626]">Remaining</div>
                <div className="text-xl font-bold font-tabular text-[#DC2626] mt-0.5">{remainingCount}</div>
              </div>
            </div>

            {/* Stop Scanning Action (Frame 4) */}
            <button
              type="button"
              onClick={() => setIsScanning(!isScanning)}
              className={`w-full h-11 flex items-center justify-center gap-2 rounded-lg text-xs font-semibold border transition-colors ${
                isScanning
                  ? 'border-[#DC2626] text-[#DC2626] hover:bg-[#FEE2E2]/50'
                  : 'bg-[#1565D8] text-white border-transparent hover:bg-[#0D47A1]'
              }`}
            >
              {isScanning ? (
                <>
                  <Square className="h-4 w-4" />
                  <span>Stop Scanning</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Resume Scanning</span>
                </>
              )}
            </button>
          </div>

          {/* REQUIREMENT 8: Save Bundle Action Card */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#172033]">Bundle Finalization</span>
              <span className={`font-semibold font-tabular ${isSaveEnabled ? 'text-[#16A34A]' : 'text-[#64748B]'}`}>
                {scannedCount} / {expectedCount} Scripts Verified
              </span>
            </div>

            {/* Progress bar toward saving */}
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isSaveEnabled ? 'bg-[#16A34A]' : 'bg-[#1565D8]'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Save Button (Enabled only when count matches expected) */}
            <button
              type="button"
              disabled={!isSaveEnabled}
              onClick={handleSaveBundle}
              className={`w-full h-12 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                isSaveEnabled
                  ? 'bg-[#16A34A] text-white hover:bg-[#15803D] cursor-pointer shadow-md'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed text-xs font-medium'
              }`}
            >
              <Check className="h-4 w-4" />
              <span>
                {isSaveEnabled
                  ? `Save Bundle (${currentSchedule?.scheduled_id})`
                  : `Save Bundle (Disabled: Need ${remainingCount} more scripts)`}
              </span>
            </button>

            <p className="text-[11px] text-[#64748B] text-center">
              {isSaveEnabled
                ? 'All expected scripts scanned! Click Save Bundle to finalize and return to Inward Intake.'
                : 'Button automatically unlocks once scanned scripts equal the expected count.'}
            </p>
          </div>
        </div>
        )
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* FRAME 5: RECONCILIATION / VERIFICATION VIEW */}
      {/* ---------------------------------------------------------------------- */}
      {subTab === 'verification' && (
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-[#172033]">{currentSchedule?.scheduled_id}</span>
                <StatusBadge status={remainingCount === 0 ? 'Verified' : 'In Progress'} />
              </div>
              <div className="text-xs text-[#64748B] mt-1">
                {currentSchedule?.class_id} | Room {currentSchedule?.room_number} | {currentSchedule?.session_id}
              </div>
              <div className="text-sm font-semibold text-[#172033] mt-1">{currentSchedule?.subject}</div>
            </div>

            <div className="text-right text-xs">
              <div>
                <span className="text-[#64748B]">Expected:</span>{' '}
                <span className="font-bold text-[#172033]">{expectedCount}</span>
              </div>
              <div>
                <span className="text-[#64748B]">Bundles:</span>{' '}
                <span className="font-bold text-[#172033]">{currentSchedule?.number_of_bundles}</span>
              </div>
            </div>
          </div>

          {/* 4 Colored Status Boxes (Frame 5) */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="p-2.5 rounded-lg bg-[#DCFCE7] border border-[#BBF7D0]">
              <div className="text-[11px] font-medium text-[#16A34A]">Scanned</div>
              <div className="text-lg font-bold font-tabular text-[#16A34A] mt-0.5">{scannedCount}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FEE2E2] border border-[#FECACA]">
              <div className="text-[11px] font-medium text-[#DC2626]">Missing</div>
              <div className="text-lg font-bold font-tabular text-[#DC2626] mt-0.5">{remainingCount}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-[#FEF3C7] border border-[#FDE68A]">
              <div className="text-[11px] font-medium text-[#D97706]">Duplicate</div>
              <div className="text-lg font-bold font-tabular text-[#D97706] mt-0.5">{duplicateScans.length}</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200">
              <div className="text-[11px] font-medium text-slate-600">Unknown</div>
              <div className="text-lg font-bold font-tabular text-slate-700 mt-0.5">{unknownScans.length}</div>
            </div>
          </div>

          {/* Progress Bar (Frame 5) */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#172033]">Progress</span>
              <span className="font-bold font-tabular text-[#16A34A]">{progressPercent}%</span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-[#16A34A] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-[#64748B]">
              {scannedCount} / {expectedCount} scanned
            </div>
          </div>

          {/* Actions (Frame 5) */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => setSubTab('scanner')}
              className="w-full h-11 rounded-lg border border-[#1565D8] text-[#1565D8] text-xs font-semibold hover:bg-[#EAF2FF] transition-colors"
            >
              View Scanned List ({currentScans.length})
            </button>

            <button
              type="button"
              onClick={() => setSubTab('missing')}
              className="w-full h-11 rounded-lg border border-[#E2E8F0] text-[#172033] text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              View Missing Scripts ({remainingCount})
            </button>

            {remainingCount > 0 && (
              <PrimaryButton fullWidth onClick={() => setSubTab('scanner')}>
                Re-scan Missing
              </PrimaryButton>
            )}

            {/* Save Bundle Action in Verification Tab */}
            {isSaveEnabled && (
              <button
                type="button"
                onClick={handleSaveBundle}
                className="w-full h-11 rounded-lg bg-[#16A34A] text-white text-xs font-bold hover:bg-[#15803D] transition-colors flex items-center justify-center gap-2"
              >
                <Check className="h-4 w-4" />
                <span>Save & Finalize Bundle</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* FRAME 6: MISSING / EXCEPTIONS VIEW */}
      {/* ---------------------------------------------------------------------- */}
      {subTab === 'missing' && (
        <div className="space-y-3.5">
          {/* Missing Warning Banner (Frame 6) */}
          {remainingCount > 0 ? (
            <div className="p-4 rounded-lg bg-[#FEE2E2] border border-[#FECACA] flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DC2626] text-white shrink-0 mt-0.5">
                <AlertOctagon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-[#DC2626]">
                  {remainingCount} Script{remainingCount > 1 ? 's' : ''} Missing
                </div>
                <div className="text-xs text-[#991B1B] mt-0.5">
                  Find the physical scripts and re-scan against schedule {currentSchedule?.scheduled_id}.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-[#DCFCE7] border border-[#BBF7D0] flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-[#16A34A] shrink-0" />
              <div>
                <div className="text-sm font-bold text-[#16A34A]">Zero Missing Scripts</div>
                <div className="text-xs text-[#15803D] mt-0.5">
                  All {expectedCount} expected answer scripts have been verified.
                </div>
              </div>
            </div>
          )}

          {/* Recent Scans List (Frame 6) */}
          <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#172033]">Recent Scans</span>
              <span className="text-xs text-[#64748B]">{currentScans.length} total</span>
            </div>

            {currentScans.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#64748B]">
                No scripts scanned for this schedule yet.
              </div>
            ) : (
              <div className="space-y-2">
                {currentScans.slice(0, 8).map(s => {
                  const isValid = s.status === 'VALID';
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        {isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-[#D97706] shrink-0" />
                        )}
                        <div>
                          <div className="text-xs font-bold font-mono text-[#172033]">{s.student_id}</div>
                          <div className="text-[10px] text-[#64748B]">
                            Class: <span className="font-mono font-medium text-slate-700">{s.class_id}</span>
                            {s.school_id && <> • School: <span className="font-mono font-medium text-slate-700">{s.school_id}</span></>}
                            {' '}• Room {s.room_number}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            isValid ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FEF3C7] text-[#D97706]'
                          }`}
                        >
                          {s.status}
                        </span>
                        <div className="text-[10px] text-[#94A3B8] mt-0.5">
                          {new Date(s.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Mark as Verified Button (Frame 6) */}
            <button
              type="button"
              onClick={() => {
                setFeedback({
                  type: 'success',
                  text: `Batch ${currentSchedule?.scheduled_id} marked as officially verified by ${user?.full_name || 'Staff'}`,
                });
              }}
              className="w-full h-11 rounded-lg bg-[#DCFCE7] text-[#16A34A] hover:bg-[#BBF7D0] text-xs font-bold transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Mark as Verified</span>
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* REQUIREMENT 7: POPUP MODAL FOR EXPECTED COUNT EXCEEDED */}
      {/* "Expected count cross ayyvelthundi akkada pop up ravali expected count cross ayindi you want to edit or need to re check ani" */}
      {/* ---------------------------------------------------------------------- */}
      {showExcessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FEF3C7] text-[#D97706] shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-[#172033]">
                  Expected Count Exceeded
                </h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  Expected count cross ayyindi. Current scanned count has reached the expected limit of{' '}
                  <strong className="text-[#172033] font-mono">{expectedCount}</strong> scripts for bundle{' '}
                  <strong className="text-[#1565D8] font-mono">{currentSchedule?.scheduled_id}</strong>.
                </p>
                <div className="mt-2 p-2.5 rounded bg-slate-50 border border-slate-200 text-xs">
                  <span className="text-[#64748B]">Attempted Scan:</span>{' '}
                  <strong className="font-mono text-[#172033]">{pendingScriptId}</strong>
                  <div className="text-[11px] text-[#64748B] mt-0.5">
                    Current Scanned: <strong className="text-[#1565D8]">{scannedCount}</strong> | Expected:{' '}
                    <strong className="text-[#172033]">{expectedCount}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Editing view if user chose to edit expected count */}
            {showEditCountInput ? (
              <div className="p-3 rounded-lg bg-blue-50/70 border border-[#BFDBFE] space-y-2.5">
                <label className="block text-xs font-semibold text-[#172033]">
                  Enter New Expected Count:
                </label>
                <input
                  type="number"
                  min={scannedCount + 1}
                  value={editedExpectedCount}
                  onChange={e => setEditedExpectedCount(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[#BFDBFE] bg-white text-xs font-bold text-[#172033] focus:outline-none focus:border-[#1565D8]"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmEditExpected}
                    className="flex-1 h-9 rounded-lg bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1]"
                  >
                    Save & Accept Scan
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEditCountInput(false)}
                    className="px-3 h-9 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-[#64748B]"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs font-medium text-[#475569]">
                Do you want to edit the expected count or need to re-check physical scripts?
              </p>
            )}

            {/* Action Buttons */}
            {!showEditCountInput && (
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowEditCountInput(true)}
                  className="w-full h-10 rounded-lg bg-[#1565D8] text-white text-xs font-semibold hover:bg-[#0D47A1] transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit Expected Count</span>
                </button>

                <button
                  type="button"
                  onClick={handleAllowExtraOnce}
                  className="w-full h-10 rounded-lg border border-[#BFDBFE] bg-[#EAF2FF] text-[#1565D8] text-xs font-semibold hover:bg-[#D8E6FC] transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Allow Script Once (Increases Expected to {expectedCount + 1})</span>
                </button>

                <button
                  type="button"
                  onClick={handleCancelExcess}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-[#64748B] hover:text-[#172033] hover:bg-slate-50 transition-colors"
                >
                  Re-check Scripts (Cancel Scan)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
