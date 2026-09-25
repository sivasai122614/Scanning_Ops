// ==============================================================================
// Bundle Scanner Camera Modal
// Dedicated camera overlay for scanning booklets in a specific Class Bundle
// Enforces Duplicate Scan Protection & Wrong Class Protection
// ==============================================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  X,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Scan,
  RotateCcw,
  Sparkles,
  ArrowRight,
  ChevronRight,
  Maximize2,
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  importedService,
  ClassBundle,
  sanitizeBarcode,
  ScanResult,
} from '../../services/importedService';
import { playScanSuccessSound, playScanWarningSound } from '../../utils/scannerSound';

interface BundleScannerModalProps {
  isOpen: boolean;
  classId: string;
  onClose: () => void;
  onScanSuccess: (result: ScanResult) => void;
  onSwitchClass?: (newClassId: string) => void;
}

export const BundleScannerModal: React.FC<BundleScannerModalProps> = ({
  isOpen,
  classId,
  onClose,
  onScanSuccess,
  onSwitchClass,
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [bundle, setBundle] = useState<ClassBundle | null>(null);

  // Overlays
  const [successFlash, setSuccessFlash] = useState<{ memberId: string; barcode: string } | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    memberId: string;
    classId: string;
    barcode: string;
  } | null>(null);
  const [wrongClassWarning, setWrongClassWarning] = useState<{
    currentClassId: string;
    detectedClassId: string;
    barcode: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  const loadBundleInfo = useCallback(() => {
    const b = importedService.getClassBundle(classId);
    setBundle(b);
  }, [classId]);

  useEffect(() => {
    if (isOpen) {
      loadBundleInfo();
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, classId, loadBundleInfo]);

  const stopCamera = () => {
    try {
      if (zxingControlsRef.current) {
        zxingControlsRef.current.stop();
        zxingControlsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } catch (e) {
      console.warn('Stop camera error:', e);
    }
    setCameraActive(false);
    setCameraLoading(false);
  };

  const handleBarcodeDetection = async (rawCode: string) => {
    const code = sanitizeBarcode(rawCode);
    if (!code) return;

    // Debounce duplicate scans within 1.5s
    const now = Date.now();
    if (lastScannedCodeRef.current === code && now - lastScannedTimeRef.current < 1500) {
      return;
    }
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    lastScannedCodeRef.current = code;
    lastScannedTimeRef.current = now;

    try {
      const res = await importedService.processBundleBooklet(classId, code);

      if (res.isDuplicate) {
        playScanWarningSound();
        setDuplicateWarning({
          memberId: res.member_id || code,
          classId: res.class_id || classId,
          barcode: code,
        });
      } else if (res.isWrongClass) {
        playScanWarningSound();
        setWrongClassWarning({
          currentClassId: res.currentClassId || classId,
          detectedClassId: res.detectedClassId || 'UNKNOWN',
          barcode: code,
        });
      } else if (res.success) {
        playScanSuccessSound();
        setSuccessFlash({
          memberId: res.member_id || code,
          barcode: code,
        });
        setTimeout(() => setSuccessFlash(null), 1800);
        loadBundleInfo();
        onScanSuccess(res);

        // If completed all booklets in bundle, close camera scanner
        if (res.isComplete) {
          setTimeout(() => {
            onClose();
          }, 1200);
        }
      } else {
        playScanWarningSound();
        setDuplicateWarning({
          memberId: code,
          classId,
          barcode: code,
        });
      }
    } catch (err) {
      console.warn('Scan process error:', err);
    } finally {
      isProcessingRef.current = false;
    }
  };

  const startCamera = async () => {
    setCameraLoading(true);
    setCameraError(null);
    setDuplicateWarning(null);
    setWrongClassWarning(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported on this browser/environment.');
      }

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
        await videoRef.current.play();
      }

      setCameraActive(true);
      setCameraLoading(false);

      // Initialize ZXing reader with broad barcode format support
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_128,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.QR_CODE,
      ]);

      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 250 });
      zxingReaderRef.current = reader;

      if (videoRef.current) {
        const controls = await reader.decodeFromVideoElement(
          videoRef.current,
          (result, error) => {
            if (result) {
              const text = result.getText();
              if (text) {
                handleBarcodeDetection(text);
              }
            }
          }
        );
        zxingControlsRef.current = controls;
      }
    } catch (err: any) {
      console.warn('Camera initiation note:', err);
      setCameraLoading(false);
      setCameraActive(false);
      setCameraError(err?.message || 'Could not start camera. You can still enter or paste barcodes manually below.');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleBarcodeDetection(manualInput.trim());
    setManualInput('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 font-sans">
      <div className="w-full max-w-lg bg-white rounded-none border border-[#CBD5E1] shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1565D8] text-white">
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            <div>
              <div className="text-xs uppercase tracking-wider text-white/80 font-medium">Scanning Bundle</div>
              <div className="text-base font-bold">Class {classId}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {bundle && (
              <div className="px-2.5 py-1 bg-white/20 rounded-none text-xs font-bold font-tabular">
                {bundle.receivedCount} / {bundle.expectedCount} Received
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-white/20 transition-colors text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Viewfinder area */}
        <div className="relative bg-black flex-1 min-h-[280px] max-h-[420px] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />

          {cameraLoading && (
            <div className="text-center text-white px-4">
              <div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-2" />
              <div className="text-xs font-medium">Initializing camera viewfinder...</div>
            </div>
          )}

          {!cameraActive && !cameraLoading && (
            <div className="text-center text-white/80 p-6">
              <CameraOff className="h-10 w-10 mx-auto mb-2 text-white/50" />
              <div className="text-sm font-bold text-white mb-1">Camera Stream Standby</div>
              <div className="text-xs text-white/70 max-w-xs mx-auto mb-3">
                {cameraError || 'Camera is currently stopped. You can use manual entry or restart.'}
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="px-3.5 py-1.5 bg-[#1565D8] text-white text-xs font-bold hover:bg-[#0D47A1] transition-colors"
              >
                Restart Camera
              </button>
            </div>
          )}

          {/* Guide reticle */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div className="w-[82%] h-[55%] border-2 border-dashed border-white/80 relative flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
                {/* Red Laser Scanning Line */}
                <div className="absolute left-2 right-2 h-0.5 bg-red-500/90 shadow-[0_0_8px_#ef4444] animate-pulse" />
                <span className="text-[11px] font-semibold text-white/90 bg-black/60 px-2 py-0.5 uppercase tracking-wider">
                  Align Booklet Barcode
                </span>
              </div>
            </div>
          )}

          {/* Success Flash Overlay */}
          {successFlash && (
            <div className="absolute inset-0 bg-[#16A34A]/90 text-white flex flex-col items-center justify-center p-4 z-20 animate-in fade-in duration-150">
              <CheckCircle2 className="h-16 w-16 mb-2" />
              <div className="text-xl font-bold uppercase tracking-wide">Booklet Received!</div>
              <div className="text-sm mt-1 font-tabular font-medium">Member: {successFlash.memberId}</div>
              <div className="text-xs text-white/80 font-mono mt-0.5">{successFlash.barcode}</div>
            </div>
          )}

          {/* SECTION 10: DUPLICATE BOOKLET DETECTED OVERLAY */}
          {duplicateWarning && (
            <div className="absolute inset-0 bg-[#FEF3C7]/95 text-[#92400E] flex flex-col items-center justify-center p-6 z-30">
              <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#F59E0B] text-white mb-3">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div className="text-base font-extrabold tracking-wide uppercase text-[#B45309] text-center">
                ⚠ DUPLICATE BOOKLET DETECTED
              </div>
              <div className="text-sm text-center text-[#78350F] mt-2 font-medium">
                <span className="font-bold text-[#172033]">{duplicateWarning.memberId}</span> has already been received in Class{' '}
                <span className="font-bold text-[#172033]">{duplicateWarning.classId}</span>.
              </div>
              <div className="text-xs text-[#92400E] font-mono mt-1 bg-white/70 px-2 py-1 border border-[#FDE68A]">
                {duplicateWarning.barcode}
              </div>
              <div className="flex items-center gap-3 mt-4 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="flex-1 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
                >
                  View Existing
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="flex-1 py-2 bg-[#D97706] text-white text-xs font-bold hover:bg-[#B45309] transition-colors uppercase tracking-wider"
                >
                  Scan Another
                </button>
              </div>
            </div>
          )}

          {/* SECTION 11: WRONG CLASS DETECTED OVERLAY */}
          {wrongClassWarning && (
            <div className="absolute inset-0 bg-[#FEE2E2]/95 text-[#991B1B] flex flex-col items-center justify-center p-6 z-30">
              <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#DC2626] text-white mb-3">
                <AlertOctagon className="h-7 w-7" />
              </div>
              <div className="text-base font-extrabold tracking-wide uppercase text-[#B91C1C] text-center">
                ⚠ WRONG CLASS DETECTED
              </div>
              <div className="text-xs text-[#7F1D1D] text-center mt-2 font-medium">
                Current Bundle: <span className="font-bold text-[#172033]">Class {wrongClassWarning.currentClassId}</span>
              </div>
              <div className="text-xs text-[#7F1D1D] text-center font-medium">
                Detected Class: <span className="font-bold text-[#DC2626]">Class {wrongClassWarning.detectedClassId}</span>
              </div>
              <div className="text-[11px] text-[#991B1B] mt-2 text-center max-w-xs">
                This booklet does not belong to the active Class {wrongClassWarning.currentClassId} bundle.
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 mt-4 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => setWrongClassWarning(null)}
                  className="w-full py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
                >
                  Dismiss &amp; Continue
                </button>
                {onSwitchClass && wrongClassWarning.detectedClassId !== 'UNKNOWN' && (
                  <button
                    type="button"
                    onClick={() => {
                      const newCid = wrongClassWarning.detectedClassId;
                      setWrongClassWarning(null);
                      onSwitchClass(newCid);
                    }}
                    className="w-full py-2 bg-[#DC2626] text-white text-xs font-bold hover:bg-[#B91C1C] transition-colors uppercase tracking-wider"
                  >
                    Switch to Class {wrongClassWarning.detectedClassId}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Manual Barcode Entry Fallback & Controls */}
        <div className="p-3 bg-[#F8FAFC] border-t border-[#E2E8F0]">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={e => setManualInput(e.target.value)}
              placeholder="Or enter barcode e.g. 1211MEM001..."
              className="flex-1 px-3 py-2 border border-[#CBD5E1] rounded-none text-xs text-[#172033] bg-white focus:outline-hidden focus:border-[#1565D8] font-mono"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors shrink-0"
            >
              Verify
            </button>
          </form>

          {/* Bottom helper */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#E2E8F0] text-[11px] text-[#64748B]">
            <span className="font-medium">
              Scanning directly into <span className="font-bold text-[#172033]">Class {classId}</span>
            </span>
            <button
              type="button"
              onClick={onClose}
              className="text-[#1565D8] font-bold hover:underline"
            >
              Done / View Bundle
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
