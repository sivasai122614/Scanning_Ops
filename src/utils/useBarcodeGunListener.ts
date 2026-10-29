// ==============================================================================
// USB / Wireless Barcode Gun Listener Engine (HID Keyboard Wedge)
// 
// Physical 1D/2D Barcode Scanners (Honeywell, Zebra, TVS, Datalogic, Pegasus, etc.)
// act as high-speed keyboard input devices. They emit characters at rapid intervals
// (typically < 40ms per character) followed by an 'Enter' key (KeyCode 13 / 'Enter').
//
// This hook / engine provides:
// 1. Zero-Click Global Intercept: Intercepts barcode keystrokes anywhere on the page
//    without requiring an input box to be clicked/focused.
// 2. High-speed burst detection: Distinguishes gun scans from slow human typing.
// 3. Audio feedback: Emits instant confirmation beep on barcode detection.
// 4. Programmatic Simulator: Allows testing gun scans in browser environments
//    even when no physical hardware gun is plugged in.
// ==============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { sanitizeBarcode } from './normalize';
import { playScanSuccessSound, playScanWarningSound } from './scannerSound';

export interface BarcodeGunScanEvent {
  barcode: string;
  source: 'gun' | 'simulator' | 'manual';
  timestamp: number;
}

export interface UseBarcodeGunListenerOptions {
  enabled?: boolean;
  minBarcodeLength?: number;
  maxKeystrokeIntervalMs?: number; // Max ms between characters for gun burst detection
  playBeepOnDetect?: boolean;
  onScan: (event: BarcodeGunScanEvent) => void;
}

export function useBarcodeGunListener({
  enabled = true,
  minBarcodeLength = 3,
  maxKeystrokeIntervalMs = 70, // typical barcode guns output characters with 5-30ms intervals
  playBeepOnDetect = false,
  onScan,
}: UseBarcodeGunListenerOptions) {
  const [lastScanned, setLastScanned] = useState<BarcodeGunScanEvent | null>(null);
  const [isGunActive, setIsGunActive] = useState<boolean>(true);
  const [totalGunScans, setTotalGunScans] = useState<number>(0);

  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const isGunBurstRef = useRef<boolean>(false);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const dispatchScan = useCallback((rawBarcode: string, source: 'gun' | 'simulator' | 'manual') => {
    const cleaned = sanitizeBarcode(rawBarcode);
    if (!cleaned || cleaned.length < minBarcodeLength) return;

    if (playBeepOnDetect) {
      playScanSuccessSound();
    }

    const event: BarcodeGunScanEvent = {
      barcode: cleaned,
      source,
      timestamp: Date.now(),
    };

    setLastScanned(event);
    setTotalGunScans(prev => prev + 1);
    onScanRef.current(event);
  }, [minBarcodeLength, playBeepOnDetect]);

  // Programmatic simulation method (for testing or manual trigger)
  const simulateGunScan = useCallback((barcode: string) => {
    dispatchScan(barcode, 'simulator');
  }, [dispatchScan]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore special modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) {
        return;
      }

      const now = performance.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Check if user is typing inside an input element that is NOT a barcode receiver
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement;

      // Check if this input explicitly wants to bypass gun listener (e.g. search filter)
      const isIgnoredInput =
        isInput &&
        (activeEl.getAttribute('data-ignore-gun-scanner') === 'true' ||
         activeEl.getAttribute('type') === 'password');

      // Key is 'Enter' -> End of barcode transmission
      if (e.key === 'Enter') {
        const candidate = bufferRef.current.trim();
        bufferRef.current = '';

        // If buffer has sufficient length
        if (candidate.length >= minBarcodeLength) {
          // If in an ignored input, only intercept if it arrived at gun speed (<60ms interval)
          if (isIgnoredInput && !isGunBurstRef.current) {
            return;
          }

          // Barcode scanner completed
          e.preventDefault();
          e.stopPropagation();
          isGunBurstRef.current = false;
          dispatchScan(candidate, 'gun');
          return;
        }

        isGunBurstRef.current = false;
        return;
      }

      // Check if keystroke arrived within gun speed
      if (interval < maxKeystrokeIntervalMs) {
        isGunBurstRef.current = true;
      } else if (interval > 300) {
        // Reset buffer if delay is too long (human paused between keystrokes)
        if (bufferRef.current.length > 0 && !isInput) {
          bufferRef.current = '';
        }
        isGunBurstRef.current = false;
      }

      // Append printable single character to buffer
      if (e.key.length === 1) {
        // If user is focused on a normal text input and typing slowly, don't hijack
        if (isIgnoredInput && !isGunBurstRef.current) {
          return;
        }

        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, minBarcodeLength, maxKeystrokeIntervalMs, dispatchScan]);

  return {
    isGunActive,
    setIsGunActive,
    lastScanned,
    totalGunScans,
    simulateGunScan,
    dispatchScan,
  };
}
