// save.js — progress in the browser's localStorage: cash, respect, story
// progress, stashes found, best race time and unlocks. Wrapped in try/catch
// because storage can be unavailable (private windows, file:// in some
// browsers); the game then simply runs unsaved.

import { SAVE_KEY } from './config.js';

export function defaultSave() {
  return {
    cash: 250,
    respect: 0,
    missionDone: 0,
    stashes: [],
    bestRace: 0,
    smg: false,
    muted: false,
    started: false,
  };
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return Object.assign(defaultSave(), data);
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable: play on without persisting.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
