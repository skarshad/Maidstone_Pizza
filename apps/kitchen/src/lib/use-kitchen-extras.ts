'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Browser features the kitchen screen leans on: an alarm and a screen wake-lock.

/**
 * A repeating two-tone alarm made with Web Audio (no sound file to load or lose).
 * Browsers only allow sound after a tap, so `enable()` must be called from one.
 */
export function useAlarm(active: boolean) {
  const context = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);

  const beep = useCallback(() => {
    const audio = context.current;
    if (!audio) return;
    const start = audio.currentTime;
    [880, 1175, 880, 1175].forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      const at = start + index * 0.22;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.21);
    });
  }, []);

  const enable = useCallback(async () => {
    try {
      context.current ??= new AudioContext();
      await context.current.resume();
      setEnabled(true);
      beep(); // confirms to the user that sound works
    } catch {
      setEnabled(false);
    }
  }, [beep]);

  useEffect(() => {
    if (!active || !enabled) return;
    beep();
    const timer = setInterval(beep, 2500);
    return () => clearInterval(timer);
  }, [active, enabled, beep]);

  return { enabled, enable };
}

/** Keeps the screen awake while the board is showing. Returns whether it is held. */
export function useWakeLock(): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        setHeld(true);
        lock.addEventListener('release', () => setHeld(false));
      } catch {
        // Refused (for example low battery): the screen may sleep.
        setHeld(false);
      }
    }

    // The lock is dropped whenever the tab is hidden; take it again on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);

  return held;
}
