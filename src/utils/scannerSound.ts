// ==============================================================================
// Web Audio API Sound Generator & Haptic Feedback for Barcode Scanner Operations
// Zero external asset dependencies - instant, offline-resilient, crisp POS beep
// ==============================================================================

let audioCtx: AudioContext | null = null;
let lastVibrateTime = 0;

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
 * Prime audio context & vibration on first user interaction (touch/click/key)
 * Modern mobile browsers (especially Android Chrome) require a user gesture
 * before permitting audio playback and navigator.vibrate().
 */
export function primeHapticAndAudio(): void {
  try {
    getAudioContext();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(10);
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  const primeHandler = () => {
    primeHapticAndAudio();
    window.removeEventListener('touchstart', primeHandler);
    window.removeEventListener('touchend', primeHandler);
    window.removeEventListener('click', primeHandler);
  };
  window.addEventListener('touchstart', primeHandler, { passive: true, once: true });
  window.addEventListener('touchend', primeHandler, { passive: true, once: true });
  window.addEventListener('click', primeHandler, { passive: true, once: true });
}

/**
 * Triggers hardware haptic vibration if supported by the device browser.
 * Debounces rapid conflicting vibration calls to prevent browser cancellation.
 */
export function triggerHapticFeedback(pattern: number | number[] = 100, force = false): void {
  try {
    if (typeof navigator === 'undefined') return;
    if (!('vibrate' in navigator) || typeof navigator.vibrate !== 'function') return;

    const now = Date.now();
    // Allow if forced, or if at least 70ms passed since last vibration call
    if (!force && now - lastVibrateTime < 70) {
      return;
    }
    lastVibrateTime = now;

    navigator.vibrate(pattern);
  } catch (e) {
    // Vibration not permitted or supported
  }
}

/**
 * Play a short, crisp, subtle POS barcode scanner confirmation beep (~80ms, 1850Hz)
 * and trigger double haptic vibration pulse ([100, 50, 100]).
 */
export function playScanSuccessSound(): void {
  triggerHapticFeedback([100, 50, 100], true);
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
 * and trigger heavy haptic vibration pulse ([180, 80, 180]).
 */
export function playScanWarningSound(): void {
  triggerHapticFeedback([180, 80, 180], true);
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
