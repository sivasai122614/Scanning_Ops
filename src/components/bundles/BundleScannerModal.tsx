// ==============================================================================
// Bundle Scanner Camera Modal
// Dedicated camera overlay for scanning booklets in a specific Class Bundle
// Enforces Duplicate Scan Protection & Wrong Class Protection
//
// UX Redesign:
// - Camera shape: WIDE RECTANGLE for full-length 1D/2D wide barcodes
// - Guaranteed detection: Dual-engine (Native Hardware BarcodeDetector + ZXing TRY_HARDER)
// - Torch toggle, Camera switcher, Image file upload, and Quick Test barcodes
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
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  Upload,
} from 'lucide-react';
import {
  importedService,
  ClassBundle,
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

  // Camera hardware controls
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

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
  const cameraResultRef = useRef<CameraStreamResult | null>(null);
  const scannerControllerRef = useRef<{ stop: () => void } | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadBundleInfo = useCallback(() => {
    const b = importedService.getClassBundle(classId);
    setBundle(b);
  }, [classId]);

  useEffect(() => {
    if (isOpen) {
      loadBundleInfo();
      setDuplicateWarning(null);
      setWrongClassWarning(null);
      setTorchOn(false);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, classId, selectedDeviceId, loadBundleInfo]);

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

  const handleBarcodeDetection = async (rawCode: string) => {
    const code = sanitizeBarcode(rawCode);
    if (!code) return;

    // Debounce duplicate scans within 1.2s
    const now = Date.now();
    if (lastScannedCodeRef.current === code && now - lastScannedTimeRef.current < 1200) {
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
        setTimeout(() => setSuccessFlash(null), 1600);
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

        // Start dual-engine continuous scanning
        const controller = startContinuousDualScanning(
          videoRef.current,
          (detected: BarcodeScanResult) => {
            if (detected.text) {
              handleBarcodeDetection(detected.text);
            }
          },
          { throttleMs: 70 }
        );
        scannerControllerRef.current = controller;
      }

      setCameraActive(true);
      setCameraLoading(false);
    } catch (err: any) {
      console.warn('Camera initiation note:', err);
      setCameraLoading(false);
      setCameraActive(false);
      setCameraError(err?.message || 'Could not start camera. You can still enter or paste barcodes manually below.');
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
        handleBarcodeDetection(decoded.text);
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
    handleBarcodeDetection(manualInput.trim());
    setManualInput('');
  };

  // Missing/pending members in this class for quick test scanning
  const pendingRecords = importedService.getRecords(classId).filter(r => r.scan_status === 'not_started');
  const sampleTestCodes = pendingRecords.slice(0, 3).map(r => r.member_id);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 font-sans">
      <div className="w-full max-w-2xl bg-white rounded-none border border-[#CBD5E1] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1565D8] text-white">
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/80 font-bold">Scanning Active Bundle</div>
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
              title="Close Scanner"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Viewfinder area: Wide rectangular aspect ratio designed for wide 1D barcodes */}
        <div className="relative bg-black w-full aspect-16/10 sm:aspect-16/9 min-h-[260px] max-h-[420px] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-contain ${cameraActive ? 'block' : 'hidden'}`}
          />

          {cameraLoading && (
            <div className="text-center text-white px-4">
              <div className="h-9 w-9 border-3 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-2" />
              <div className="text-xs font-bold uppercase tracking-wider">Starting HD Viewfinder...</div>
              <div className="text-[11px] text-white/70 mt-1">Calibrating wide barcode reader</div>
            </div>
          )}

          {!cameraActive && !cameraLoading && (
            <div className="text-center text-white/80 p-6">
              <CameraOff className="h-10 w-10 mx-auto mb-2 text-white/50" />
              <div className="text-sm font-bold text-white mb-1">Camera Stream Standby</div>
              <div className="text-xs text-white/70 max-w-sm mx-auto mb-3">
                {cameraError || 'Camera is currently stopped. You can use manual entry, photo upload, or restart camera.'}
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2 bg-[#1565D8] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#0D47A1] transition-colors"
              >
                Restart Camera
              </button>
            </div>
          )}

          {/* Guide reticle: Prominent WIDE RECTANGLE for full wide barcodes */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Wide Rectangular Box */}
              <div className="w-[92%] sm:w-[88%] h-[34%] sm:h-[30%] border-2 border-dashed border-[#22C55E] relative flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                {/* 4 Corner Markers for High Precision */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-white" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-white" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-white" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-white" />

                {/* Red Laser Scanning Line spanning full width */}
                <div className="absolute left-2 right-2 h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />

                <span className="text-[10px] sm:text-[11px] font-bold text-white bg-black/75 px-2.5 py-0.5 uppercase tracking-widest border border-white/30">
                  WIDE BARCODE ALIGNMENT ZONE
                </span>
              </div>
              <div className="text-[10px] text-white/80 font-medium mt-3 bg-black/60 px-3 py-1 uppercase tracking-wider">
                Align booklet barcode horizontally inside the green rectangle
              </div>
            </div>
          )}

          {/* Camera Controls Overlay: Torch, Camera Switch */}
          {cameraActive && (
            <div className="absolute top-3 right-3 flex items-center gap-1.5 z-20">
              {hasTorch && (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  className={`p-2 rounded-none text-xs font-bold flex items-center gap-1 shadow-md transition-colors ${
                    torchOn ? 'bg-[#F59E0B] text-black' : 'bg-black/60 text-white hover:bg-black/80'
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
                  className="p-2 bg-black/60 text-white hover:bg-black/80 rounded-none text-xs font-bold flex items-center gap-1 shadow-md transition-colors"
                  title="Switch Camera Lens"
                >
                  <SwitchCamera className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Success Flash Overlay */}
          {successFlash && (
            <div className="absolute inset-0 bg-[#16A34A]/92 text-white flex flex-col items-center justify-center p-4 z-20 animate-in fade-in duration-150">
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
              <div className="flex h-12 w-12 items-center justify-center rounded-none bg-[#EF4444] text-white mb-3">
                <AlertOctagon className="h-7 w-7" />
              </div>
              <div className="text-base font-extrabold tracking-wide uppercase text-[#991B1B] text-center">
                ⚠ WRONG CLASS DETECTED
              </div>
              <div className="text-xs text-center text-[#7F1D1D] mt-2 font-medium max-w-sm">
                This booklet does not belong to the active bundle.
              </div>

              <div className="grid grid-cols-2 gap-3 w-full max-w-xs my-3">
                <div className="bg-white p-2.5 border border-[#FECACA] text-center">
                  <div className="text-[10px] uppercase font-bold text-[#64748B]">Current Bundle</div>
                  <div className="text-base font-extrabold text-[#172033] mt-0.5">
                    {wrongClassWarning.currentClassId}
                  </div>
                </div>
                <div className="bg-white p-2.5 border border-[#FECACA] text-center">
                  <div className="text-[10px] uppercase font-bold text-[#EF4444]">Detected Class</div>
                  <div className="text-base font-extrabold text-[#EF4444] mt-0.5">
                    {wrongClassWarning.detectedClassId}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#7F1D1D] font-mono bg-white/70 px-2 py-0.5 border border-[#FECACA] mb-3">
                {wrongClassWarning.barcode}
              </div>

              <div className="flex items-center gap-2 w-full max-w-sm">
                <button
                  type="button"
                  onClick={() => setWrongClassWarning(null)}
                  className="flex-1 py-2 bg-white border border-[#CBD5E1] text-[#172033] text-xs font-bold hover:bg-slate-50 transition-colors uppercase tracking-wider"
                >
                  Stay on Class {classId}
                </button>
                {onSwitchClass && wrongClassWarning.detectedClassId !== 'UNKNOWN' && (
                  <button
                    type="button"
                    onClick={() => {
                      const newCid = wrongClassWarning.detectedClassId;
                      setWrongClassWarning(null);
                      onSwitchClass(newCid);
                    }}
                    className="flex-1 py-2 bg-[#EF4444] text-white text-xs font-bold hover:bg-[#DC2626] transition-colors uppercase tracking-wider flex items-center justify-center gap-1"
                  >
                    Switch to {wrongClassWarning.detectedClassId} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
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
              Record Scan
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
              title="Upload image or photo of booklet barcode"
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Image</span>
            </button>
          </form>

          {/* Quick Click-to-Test helper for pending members in this class */}
          {sampleTestCodes.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-[#64748B]">Quick Test Pending Barcodes:</span>
              {sampleTestCodes.map(sc => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => handleBarcodeDetection(sc)}
                  className="px-2 py-0.5 bg-white border border-[#CBD5E1] hover:border-[#1565D8] hover:bg-blue-50 text-[11px] font-mono text-[#1565D8] font-semibold transition-colors"
                >
                  {sc}
                </button>
              ))}
            </div>
          )}

          <div className="text-[11px] text-[#64748B] mt-1.5 flex items-center justify-between">
            <span>Wide rectangle camera detects Code 128, Code 39, EAN, and 2D exam barcodes.</span>
            <span className="font-semibold text-[#172033]">
              {bundle?.receivedCount || 0} / {bundle?.expectedCount || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
