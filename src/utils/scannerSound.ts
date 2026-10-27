// ==============================================================================
// Web Audio API Sound Generator for Barcode Scanner Operations
// Zero external asset dependencies - instant, offline-resilient, crisp POS beep
// ==============================================================================

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (e) {
    return null;
  }
}

/**
 * Triggers hardware haptic vibration if supported by the device browser
 */
export function triggerHapticFeedback(pattern: number | number[] = 100): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch (e) {
    // Vibration not supported or restricted by browser
  }
}

/**
 * Play a short, crisp, subtle POS barcode scanner confirmation beep (~80ms, 1850Hz)
 * Plays only once per successful scan.
 */
export function playScanSuccessSound(): void {
  triggerHapticFeedback([90, 40, 90]);
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // 1950Hz crisp barcode scanner chirp
    osc.frequency.setValueAtTime(1950, now);
    osc.frequency.exponentialRampToValueAtTime(1700, now + 0.08);

    // Subtle, clean envelope
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.085);
  } catch (e) {
    // Audio context may be restricted by autoplay policy until first interaction
  }
}

/**
 * Play a low-frequency double warning sound for duplicate or unrecognized barcode
 */
export function playScanWarningSound(): void {
  triggerHapticFeedback(250);
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.setValueAtTime(240, now + 0.09);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  } catch (e) {
    // Audio context muted or restricted
  }
}

