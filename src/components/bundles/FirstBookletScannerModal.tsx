// ==============================================================================
// First Booklet Scanner Modal (Section 3)
// When user opens camera to scan the first booklet:
// 1. Detect Class ID
// 2. Identify corresponding class
// 3. Immediately redirect user to dedicated Bundle Statistics screen for that Class ID
// 4. Do NOT keep camera visible on Bundle Statistics screen
// ==============================================================================

import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  CameraOff,
  X,
  Scan,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Sparkles,
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  importedService,
  sanitizeBarcode,
  ScanResult,
} from '../../services/importedService';
import { playScanSuccessSound, playScanWarningSound } from '../../utils/scannerSound';

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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setSuccessInfo(null);
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

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

    const now = Date.now();
    if (lastScannedCodeRef.current === code && now - lastScannedTimeRef.current < 1500) {
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
        }, 800);
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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported on this device/browser.');
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
      console.warn('Camera error:', err);
      setCameraLoading(false);
      setCameraActive(false);
      setCameraError(err?.message || 'Camera unavailable. You can enter or paste barcodes below.');
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
              <div className="text-xs uppercase tracking-wider text-white/80 font-medium">Exam Inwarding Scanner</div>
              <div className="text-base font-bold">Scan First Booklet to Open Class Bundle</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-white/20 transition-colors text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Viewfinder area */}
        <div className="relative bg-black flex-1 min-h-[300px] max-h-[420px] flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
          />

          {cameraLoading && (
            <div className="text-center text-white px-4">
              <div className="h-8 w-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-2" />
              <div className="text-xs font-medium">Activating camera...</div>
            </div>
          )}

          {!cameraActive && !cameraLoading && (
            <div className="text-center text-white/80 p-6">
              <CameraOff className="h-10 w-10 mx-auto mb-2 text-white/50" />
              <div className="text-sm font-bold text-white mb-1">Camera Standby</div>
              <div className="text-xs text-white/70 max-w-xs mx-auto mb-3">
                {cameraError || 'Camera is stopped. You can enter barcodes manually below.'}
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="px-3.5 py-1.5 bg-[#1565D8] text-white text-xs font-bold hover:bg-[#0D47A1] transition-colors"
              >
                Start Camera
              </button>
            </div>
          )}

          {/* Guide Reticle */}
          {cameraActive && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div className="w-[82%] h-[55%] border-2 border-dashed border-white/80 relative flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
                <div className="absolute left-2 right-2 h-0.5 bg-red-500/90 shadow-[0_0_8px_#ef4444] animate-pulse" />
                <span className="text-[11px] font-semibold text-white/90 bg-black/60 px-2 py-0.5 uppercase tracking-wider">
                  Scan First Booklet Barcode
                </span>
              </div>
            </div>
          )}

          {/* Success Redirect Overlay */}
          {successInfo && (
            <div className="absolute inset-0 bg-[#16A34A]/95 text-white flex flex-col items-center justify-center p-6 z-30 animate-in fade-in duration-150">
              <CheckCircle2 className="h-16 w-16 mb-2" />
              <div className="text-xl font-bold uppercase tracking-wider">Detected Class {successInfo.classId}</div>
              <div className="text-sm font-medium mt-1">Booklet verified for Member: {successInfo.memberId}</div>
              <div className="text-xs text-white/80 mt-3 font-semibold uppercase tracking-wider animate-pulse">
                Redirecting to Bundle Statistics screen...
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

        {/* Manual Barcode Fallback */}
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
          </form>
          <div className="text-[11px] text-[#64748B] mt-1.5 font-medium">
            First booklet scan identifies Class ID and immediately takes you to the Bundle Statistics screen.
          </div>
        </div>
      </div>
    </div>
  );
};
