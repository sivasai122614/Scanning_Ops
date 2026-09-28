// ==============================================================================
// Universal Barcode Scanner Engine
// High-Reliability Dual-Engine Barcode Scanner:
// 1. Native Hardware-Accelerated BarcodeDetector Web API (Chromium / Safari 17+)
// 2. ZXing MultiFormatReader with TRY_HARDER: true and all 1D/2D formats
// 3. Robust frame scanning loop with canvas fallback
// 4. File/Image upload decoder fallback
// 5. Camera stream setup with HD widescreen, continuous autofocus, torch & zoom
// ==============================================================================

import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { normalizeIdentifier } from './normalize';

export interface BarcodeScanResult {
  text: string;
  format?: string;
}

export interface CameraStreamResult {
  stream: MediaStream;
  videoTrack: MediaStreamTrack;
  hasTorch: boolean;
  hasZoom: boolean;
  minZoom: number;
  maxZoom: number;
  currentZoom: number;
  devices: MediaDeviceInfo[];
  stop: () => void;
  toggleTorch: (on: boolean) => Promise<boolean>;
  setZoom: (zoom: number) => Promise<void>;
}

// All recognized barcode formats for exam scripts and ID cards
export const ZXING_ALL_FORMATS: BarcodeFormat[] = [
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
];

export const NATIVE_BARCODE_FORMATS = [
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'itf',
  'codabar',
  'upc_a',
  'upc_e',
  'qr_code',
  'data_matrix',
];

/**
 * Creates ZXing reader with TRY_HARDER enabled for maximum 1D barcode sensitivity
 */
export function createZXingReader(): BrowserMultiFormatReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_ALL_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 40 });
}

/**
 * Checks if native BarcodeDetector API is supported in current browser
 */
export function isNativeBarcodeDetectorSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Creates native BarcodeDetector instance if supported
 */
export async function createNativeBarcodeDetector(): Promise<any | null> {
  if (!isNativeBarcodeDetectorSupported()) return null;
  try {
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    let supported = NATIVE_BARCODE_FORMATS;
    if (typeof BarcodeDetectorClass.getSupportedFormats === 'function') {
      try {
        const available: string[] = await BarcodeDetectorClass.getSupportedFormats();
        supported = NATIVE_BARCODE_FORMATS.filter(f => available.includes(f));
      } catch (e) {
        // Fall back to all formats
      }
    }
    return new BarcodeDetectorClass({ formats: supported });
  } catch (err) {
    console.warn('Native BarcodeDetector initialization note:', err);
    return null;
  }
}

/**
 * Request camera stream with rear environment camera priority and fallback
 */
export async function requestCameraStream(
  deviceId?: string
): Promise<CameraStreamResult> {
  console.log('[SCANNER] Camera requested');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera access not supported by browser.');
  }

  let stream: MediaStream | null = null;

  // Tier 1: Try HD 1280x720 environment rear camera
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
      audio: false,
    });
  } catch (err1) {
    console.warn('[SCANNER] HD constraints rejected, trying relaxed environment:', err1);
    try {
      // Tier 2: Try relaxed rear camera
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: 'environment' } },
        audio: false,
      });
    } catch (err2) {
      console.warn('[SCANNER] Relaxed environment rejected, trying default video:', err2);
      // Tier 3: Any video device
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }
  }

  if (!stream) {
    throw new Error('Could not establish video feed from any camera.');
  }

  console.log('[SCANNER] Camera started');
  const videoTrack = stream.getVideoTracks()[0];
  const capabilities: any = videoTrack?.getCapabilities ? videoTrack.getCapabilities() : {};

  // Enable continuous autofocus if supported
  if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
    try {
      await videoTrack.applyConstraints({
        advanced: [{ focusMode: 'continuous' } as any],
      });
    } catch (e) {
      console.warn('Continuous focus note:', e);
    }
  }

  const hasTorch = Boolean(capabilities.torch);
  const hasZoom = Boolean(capabilities.zoom);
  const minZoom = capabilities.zoom?.min ?? 1;
  const maxZoom = capabilities.zoom?.max ?? 1;
  let currentZoom = 1;

  let devices: MediaDeviceInfo[] = [];
  try {
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    devices = allDevices.filter(d => d.kind === 'videoinput');
  } catch {}

  const stop = () => {
    try {
      stream?.getTracks().forEach(t => t.stop());
    } catch {}
  };

  const toggleTorch = async (on: boolean): Promise<boolean> => {
    if (!hasTorch || !videoTrack) return false;
    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: on } as any],
      });
      return on;
    } catch (e) {
      console.warn('Toggle torch failed:', e);
      return false;
    }
  };

  const setZoom = async (zoom: number): Promise<void> => {
    if (!hasZoom || !videoTrack) return;
    try {
      const clamped = Math.max(minZoom, Math.min(maxZoom, zoom));
      await videoTrack.applyConstraints({
        advanced: [{ zoom: clamped } as any],
      });
      currentZoom = clamped;
    } catch (e) {
      console.warn('Set zoom failed:', e);
    }
  };

  return {
    stream,
    videoTrack,
    hasTorch,
    hasZoom,
    minZoom,
    maxZoom,
    currentZoom,
    devices,
    stop,
    toggleTorch,
    setZoom,
  };
}

/**
 * Starts continuous dual-engine scanning loop on an active HTMLVideoElement
 */
export function startContinuousDualScanning(
  videoEl: HTMLVideoElement,
  onBarcodeDetected: (result: BarcodeScanResult) => void,
  options?: {
    throttleMs?: number;
    useCanvasRegion?: boolean;
  }
): { stop: () => void } {
  console.log('[SCANNER] Decoder initialized');
  console.log('[SCANNER] Scanning started');

  let isRunning = true;
  let isProcessing = false;
  let detectorInstance: any = null;
  let zxingReaderInstance: BrowserMultiFormatReader | null = null;
  let zxingControls: { stop: () => void } | null = null;
  let frameTimerId: any = null;

  try {
    zxingReaderInstance = createZXingReader();
  } catch (e) {
    console.warn('[SCANNER] ZXing reader init note:', e);
  }

  // 1. If Native BarcodeDetector Web API is supported, setup hardware accelerated detector
  if (isNativeBarcodeDetectorSupported()) {
    createNativeBarcodeDetector()
      .then(detector => {
        if (isRunning && detector) {
          detectorInstance = detector;
        }
      })
      .catch(() => {});
  }

  // 2. Primary ZXing continuous reader directly on video element
  try {
    if (zxingReaderInstance) {
      zxingReaderInstance
        .decodeFromVideoElement(videoEl, (result) => {
          if (!isRunning) return;
          if (result) {
            const rawText = result.getText();
            if (rawText && rawText.trim()) {
              const cleaned = rawText.trim();
              console.log('[SCANNER] Barcode detected:', cleaned);
              console.log('[SCANNER] Normalized barcode:', normalizeIdentifier(cleaned));
              onBarcodeDetected({
                text: cleaned,
                format: result.getBarcodeFormat() ? String(result.getBarcodeFormat()) : undefined,
              });
            }
          }
        })
        .then(controls => {
          if (!isRunning) {
            controls.stop();
          } else {
            zxingControls = controls;
          }
        })
        .catch(err => {
          console.warn('[SCANNER] ZXing stream attach note:', err?.message || err);
        });
    }
  } catch (zxingErr) {
    console.warn('[SCANNER] ZXing init error:', zxingErr);
  }

  // 3. Auxiliary Frame Loop (native BarcodeDetector + Canvas fallback)
  // Ensures barcode is captured even if decodeFromVideoElement had a frame stall
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const runFrameLoop = async () => {
    if (!isRunning) return;

    if (!isProcessing && videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      isProcessing = true;
      try {
        // A. Native BarcodeDetector if available
        if (detectorInstance) {
          try {
            const barcodes = await detectorInstance.detect(videoEl);
            if (barcodes && barcodes.length > 0) {
              for (const b of barcodes) {
                if (b.rawValue && b.rawValue.trim()) {
                  const cleaned = b.rawValue.trim();
                  console.log('[SCANNER] Barcode detected:', cleaned);
                  console.log('[SCANNER] Normalized barcode:', normalizeIdentifier(cleaned));
                  onBarcodeDetected({
                    text: cleaned,
                    format: b.format || 'unknown',
                  });
                  isProcessing = false;
                  return;
                }
              }
            }
          } catch {
            // Frame drop
          }
        }

        // B. Canvas snapshot fallback for difficult 1D barcodes
        if (ctx && zxingReaderInstance && (!zxingControls || Math.random() < 0.3)) {
          canvas.width = videoEl.videoWidth;
          canvas.height = videoEl.videoHeight;
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          try {
            const res = zxingReaderInstance.decodeFromCanvas(canvas);
            if (res && res.getText()) {
              const cleaned = res.getText().trim();
              console.log('[SCANNER] Barcode detected:', cleaned);
              console.log('[SCANNER] Normalized barcode:', normalizeIdentifier(cleaned));
              onBarcodeDetected({
                text: cleaned,
                format: res.getBarcodeFormat() ? String(res.getBarcodeFormat()) : undefined,
              });
              isProcessing = false;
              return;
            }
          } catch {
            // No barcode in frame
          }
        }
      } catch {
        // Frame processing exception
      } finally {
        isProcessing = false;
      }
    }

    if (isRunning) {
      frameTimerId = setTimeout(runFrameLoop, options?.throttleMs || 90);
    }
  };

  frameTimerId = setTimeout(runFrameLoop, 120);

  return {
    stop: () => {
      isRunning = false;
      if (frameTimerId) clearTimeout(frameTimerId);
      if (zxingControls) {
        try {
          zxingControls.stop();
        } catch {}
        zxingControls = null;
      }
    },
  };
}

/**
 * Decodes a barcode directly from an uploaded or dropped image file
 */
export async function decodeBarcodeFromImageFile(
  file: File | Blob
): Promise<BarcodeScanResult | null> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        // 1. Try Native BarcodeDetector on Image
        if (isNativeBarcodeDetectorSupported()) {
          const detector = await createNativeBarcodeDetector();
          if (detector) {
            try {
              const detected = await detector.detect(img);
              if (detected && detected.length > 0 && detected[0].rawValue) {
                URL.revokeObjectURL(url);
                return resolve({
                  text: detected[0].rawValue.trim(),
                  format: detected[0].format,
                });
              }
            } catch (e) {
              console.warn('Native image detection note:', e);
            }
          }
        }

        // 2. Try ZXing BrowserMultiFormatReader on Image
        try {
          const zxing = createZXingReader();
          const result = await zxing.decodeFromImageElement(img);
          if (result && result.getText()) {
            URL.revokeObjectURL(url);
            return resolve({
              text: result.getText().trim(),
              format: result.getBarcodeFormat() ? String(result.getBarcodeFormat()) : undefined,
            });
          }
        } catch (zxingImgErr) {
          console.warn('ZXing image decode note:', zxingImgErr);
        }

        // 3. Try Canvas with contrast enhancement
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (ctx) {
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            ctx.drawImage(img, 0, 0);

            if (isNativeBarcodeDetectorSupported()) {
              const detector = await createNativeBarcodeDetector();
              if (detector) {
                const detected = await detector.detect(canvas);
                if (detected && detected.length > 0 && detected[0].rawValue) {
                  URL.revokeObjectURL(url);
                  return resolve({
                    text: detected[0].rawValue.trim(),
                    format: detected[0].format,
                  });
                }
              }
            }

            const zxing = createZXingReader();
            const res = zxing.decodeFromCanvas(canvas);
            if (res && res.getText()) {
              URL.revokeObjectURL(url);
              return resolve({
                text: res.getText().trim(),
                format: res.getBarcodeFormat() ? String(res.getBarcodeFormat()) : undefined,
              });
            }
          }
        } catch (canvasErr) {
          console.warn('Canvas enhance error:', canvasErr);
        }

        URL.revokeObjectURL(url);
        resolve(null);
      } catch (err) {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}
