// ==============================================================================
// First Booklet Scanner Modal (Section 3)
// When user opens camera to scan the first booklet:
// 1. Detect Class ID
// 2. Identify corresponding class
// 3. Immediately redirect user to dedicated Bundle Statistics screen for that Class ID
// 4. Do NOT keep camera visible on Bundle Statistics screen
//
// UX Redesign:
// - Camera shape: WIDE RECTANGLE for full-length 1D/2D wide barcodes
// - Guaranteed detection: Dual-engine (Native Hardware BarcodeDetector + ZXing TRY_HARDER)
// - Torch toggle, Camera switcher, Image file upload, and Quick Test barcodes
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CameraOff,
  X,
  Scan,
  AlertTriangle,
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  SwitchCamera,
  Upload,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import {
  importedService,
  sanitizeBarcode,
} from '../../services/importedService';
import { playScanSuccessSound, playScanWarningSound } from '../../utils/scannerSound';
import {
  requestCameraStream,
  startContinuousDualScanning,
  decodeBarcodeFromImageFile,
  CameraStreamResult,
  BarcodeScanResult,
} from '../../utils/universalBarcodeScanner';

interface FirstBookletScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClassDetected: (classId: string) => void;
}

export const FirstBookletScannerModal: React.FC<FirstBookletScannerModalProps> = ({
  isOpen,
  onClose,
  onClassDetected,
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ classId: string; memberId: string } | null>(null);

  // Camera hardware controls
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraResultRef = useRef<CameraStreamResult | null>(null);
  const scannerControllerRef = useRef<{ stop: () => void } | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessInfo(null);
      setTorchOn(false);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, selectedDeviceId]);

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

    const now = Date.now();
    // Debounce exact code within 1.2s
    if (lastScannedCodeRef.current === code && now - lastScannedTimeRef.current < 1200) {
      return;
    }
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    lastScannedCodeRef.current = code;
    lastScannedTimeRef.current = now;

    try {
      const res = await importedService.processFirstBooklet(code);

      if (res.success && res.class_id) {
        playScanSuccessSound();
        setSuccessInfo({
          classId: res.class_id,
          memberId: res.member_id || code,
        });

        // Cleanly stop camera immediately (Section 3.4: "Do NOT keep the camera visible on the Bundle Statistics screen")
        stopCamera();

        // Redirect immediately to the dedicated Bundle Statistics screen for this Class ID
        setTimeout(() => {
          onClassDetected(res.class_id!);
        }, 750);
      } else {
        playScanWarningSound();
        setErrorMessage(res.message || 'Invalid barcode scan');
      }
    } catch (err: any) {
      console.warn('First booklet scan error:', err);
      setErrorMessage(err?.message || 'Error processing barcode');
    } finally {
      isProcessingRef.current = false;
    }
  };

  const startCamera = async () => {
    setCameraLoading(true);
    setCameraError(null);
    setErrorMessage(null);

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
      console.warn('Camera error:', err);
      setCameraLoading(false);
      setCameraActive(false);
      setCameraError(err?.message || 'Camera unavailable. Please check permissions or enter barcodes below.');
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
    setErrorMessage(null);
    try {
      const decoded = await decodeBarcodeFromImageFile(file);
      if (decoded && decoded.text) {
        handleBarcodeDetection(decoded.text);
      } else {
        setErrorMessage('Could not find or decode a barcode in the selected image. Please try a clearer picture or enter manually.');
      }
    } catch (err: any) {
      setErrorMessage('Failed to read image file: ' + (err?.message || 'unknown error'));
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

  // Quick test sample barcodes from current imported bundles
  const bundles = importedService.getClassBundles();
  const sampleCodes = bundles.slice(0, 3).map(b => {
    const recs = importedService.getRecords(b.classId);
    const firstUnscanned = recs.find(r => r.scan_status === 'not_started');
    return {
      classId: b.classId,
      code: firstUnscanned ? firstUnscanned.member_id : `${b.classId}MEM001`,
    };
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 font-sans">
      <div className="w-full max-w-2xl bg-white rounded-none border border-[#CBD5E1] shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1565D8] text-white">
          <div className="flex items-center gap-2">
            <Scan className="h-5 w-5" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/80 font-bold">Exam Inwarding Scanner</div>
              <div className="text-sm sm:text-base font-bold">Scan First Booklet to Open Class Bundle</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/20 transition-colors text-white"
            title="Close Scanner"
          >
            <X className="h-5 w-5" />
          </button>
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
              <div className="text-xs font-bold uppercase tracking-wider">Activating HD Camera...</div>
              <div className="text-[11px] text-white/70 mt-1">Configuring wide-angle barcode detector</div>
            </div>
          )}

          {!cameraActive && !cameraLoading && (
            <div className="text-center text-white/80 p-6">
              <CameraOff className="h-10 w-10 mx-auto mb-2 text-white/50" />
              <div className="text-sm font-bold text-white mb-1">Camera Feed Standby</div>
              <div className="text-xs text-white/70 max-w-sm mx-auto mb-3">
                {cameraError || 'Camera stopped. You can enter or paste barcodes below, upload a barcode picture, or restart camera.'}
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

          {/* Guide Reticle: Prominent WIDE RECTANGLE for full wide barcodes */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              {/* Wide Rectangular Box */}
              <div className="w-[92%] sm:w-[88%] h-[34%] sm:h-[30%] border-2 border-dashed border-[#22C55E] relative flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
                {/* 4 Corner Markers for High Precision */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-white" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-white" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-white" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-white" />

                {/* Full-width Red Laser Scanning Line */}
                <div className="absolute left-2 right-2 h-0.5 bg-red-500 shadow-[0_0_12px_#ef4444] animate-pulse" />

                <span className="text-[10px] sm:text-[11px] font-bold text-white bg-black/75 px-2.5 py-0.5 uppercase tracking-widest border border-white/30">
                  WIDE BARCODE ALIGNMENT ZONE
                </span>
              </div>
              <div className="text-[10px] text-white/80 font-medium mt-3 bg-black/60 px-3 py-1 uppercase tracking-wider">
                Hold booklet barcode horizontally inside the green rectangle
              </div>
            </div>
          )}

          {/* Camera Controls Overlay: Torch, Camera Switch, Photo Upload */}
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

          {/* Success Redirect Overlay */}
          {successInfo && (
            <div className="absolute inset-0 bg-[#16A34A]/95 text-white flex flex-col items-center justify-center p-6 z-30 animate-in fade-in duration-150">
              <CheckCircle2 className="h-16 w-16 mb-2" />
              <div className="text-xl font-bold uppercase tracking-wider">Detected Class {successInfo.classId}</div>
              <div className="text-sm font-medium mt-1">Booklet verified for Member: {successInfo.memberId}</div>
              <div className="text-xs text-white/90 mt-3 font-semibold uppercase tracking-wider animate-pulse">
                Redirecting to dedicated Bundle Statistics screen...
              </div>
            </div>
          )}

          {/* Error / Warning Alert Overlay */}
          {errorMessage && (
            <div className="absolute inset-x-3 bottom-3 bg-[#FEF3C7] border border-[#F59E0B] p-3 text-xs text-[#92400E] flex items-center justify-between z-20">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-[#D97706] shrink-0" />
                <span className="font-semibold whitespace-pre-line">{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-[#92400E] font-bold text-xs hover:underline shrink-0 ml-2"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Barcode Input & Upload Fallback */}
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
              Detect Class
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
              <span className="hidden sm:inline">Image</span>
            </button>
          </form>

          {/* Quick Click-to-Test helper if imported classes exist */}
          {sampleCodes.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-bold text-[#64748B]">Quick Test Barcodes:</span>
              {sampleCodes.map(sc => (
                <button
                  key={sc.code}
                  type="button"
                  onClick={() => handleBarcodeDetection(sc.code)}
                  className="px-2 py-0.5 bg-white border border-[#CBD5E1] hover:border-[#1565D8] hover:bg-blue-50 text-[11px] font-mono text-[#1565D8] font-semibold transition-colors"
                >
                  Class {sc.classId} ({sc.code})
                </button>
              ))}
            </div>
          )}

          <div className="text-[11px] text-[#64748B] mt-1.5 font-medium">
            First booklet scan identifies Class ID and redirects to the dedicated Bundle Statistics screen without camera.
          </div>
        </div>
      </div>
    </div>
  );
};
