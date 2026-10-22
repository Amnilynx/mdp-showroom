import { useSyncExternalStore } from "react";

// Soft two-note chime for new chat messages, generated with the Web Audio
// API (no audio file). The mute choice is remembered in this browser.
const KEY = "mdp_chat_muted";
const listeners = new Set();
let ctx = null;

export function isMuted() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* storage blocked — mute just won't persist */
  }
  listeners.forEach((l) => l());
}

export function subscribeMuted(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useMuted() {
  return useSyncExternalStore(subscribeMuted, isMuted, () => false);
}

function getContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Browsers only allow sound after the person has interacted with the page
// once; call this from a click / key handler to unlock it.
export function unlockAudio() {
  try {
    const c = getContext();
    if (c && c.state === "suspended") c.resume();
  } catch {
    /* ignore */
  }
}

export function playChime() {
  if (isMuted()) return;
  try {
    const c = getContext();
    if (!c) return;
    if (c.state === "suspended") c.resume();
    const now = c.currentTime;
    // G5 then C6, each a short sine with a gentle attack and long decay.
    [
      [784, 0],
      [1046.5, 0.16],
    ].forEach(([freq, offset]) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.7);
      osc.connect(gain).connect(c.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.75);
    });
  } catch {
    /* sound is a nicety — never break chat over it */
  }
}

// ---- "Calm mode": turns the blinking / shaking / pulsing alerts off ----
// Adds the class `calm-alerts` to <html>; index.css switches every alert
// animation off under that class and keeps a plain static highlight.
const CALM_KEY = "mdp_chat_calm";

export function isCalm() {
  try {
    return localStorage.getItem(CALM_KEY) === "1";
  } catch {
    return false;
  }
}

function applyCalm() {
  try {
    document.documentElement.classList.toggle("calm-alerts", isCalm());
  } catch {
    /* ignore */
  }
}

export function setCalm(calm) {
  try {
    localStorage.setItem(CALM_KEY, calm ? "1" : "0");
  } catch {
    /* storage blocked — setting just won't persist */
  }
  applyCalm();
  listeners.forEach((l) => l());
}

export function useCalm() {
  return useSyncExternalStore(subscribeMuted, isCalm, () => false);
}

applyCalm(); // apply the saved choice as soon as the app loads