// audio.js — all sound is synthesised with WebAudio: engine hum, skids,
// crashes, gunshots, sirens, pickups and jingles. No audio files, so the game
// stays fully offline. The context starts on the first user gesture.

let ctx = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.03);
}

export function isMuted() {
  return muted;
}

// One oscillator blip with a pitch slide — the building block of most SFX.
function blip(freq, dur, type, gain, slideTo) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// A burst of filtered noise — gunshots, crashes, splashes of static.
function noiseBurst(dur, freq, gain, type) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type || 'lowpass';
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

export function sfxClick() {
  blip(660, 0.06, 'square', 0.12);
}

export function sfxPickup() {
  blip(880, 0.09, 'sine', 0.22);
  setTimeout(() => blip(1320, 0.12, 'sine', 0.2), 55);
}

export function sfxCash() {
  blip(1180, 0.07, 'triangle', 0.2);
  setTimeout(() => blip(1560, 0.1, 'triangle', 0.18), 45);
}

export function sfxShot(heavy) {
  noiseBurst(heavy ? 0.16 : 0.1, heavy ? 900 : 1400, heavy ? 0.5 : 0.34, 'lowpass');
  blip(heavy ? 130 : 180, 0.07, 'sawtooth', 0.16, 50);
}

export function sfxCrash(strength) {
  noiseBurst(0.22, 500, Math.min(0.6, 0.2 + strength * 0.05), 'lowpass');
  blip(70, 0.2, 'triangle', 0.3, 38);
}

export function sfxHorn() {
  blip(370, 0.28, 'square', 0.1);
  blip(466, 0.28, 'square', 0.08);
}

export function sfxJingle(win) {
  if (!ctx || muted) return;
  const notes = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
  notes.forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.22), i * 110));
}

// Continuous sounds, steered once per frame from main: the player's engine
// (pitch follows speed) and the nearest police siren.
export function updateAudio(dt, opts) {
  if (!ctx) return;
  // Engine.
  if (opts.driving && !muted) {
    if (!engineNodes) {
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc2.type = 'square';
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      g.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(g).connect(master);
      osc.start();
      osc2.start();
      engineNodes = { osc, osc2, g };
    }
    const r = Math.min(1, Math.abs(opts.speedRatio || 0));
    engineNodes.osc.frequency.setTargetAtTime(55 + r * 165, ctx.currentTime, 0.05);
    engineNodes.osc2.frequency.setTargetAtTime(28 + r * 84, ctx.currentTime, 0.05);
    engineNodes.g.gain.setTargetAtTime(0.05 + r * 0.075, ctx.currentTime, 0.08);
  } else if (engineNodes) {
    engineNodes.g.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
    const nodes = engineNodes;
    engineNodes = null;
    setTimeout(() => {
      try { nodes.osc.stop(); nodes.osc2.stop(); } catch { /* already stopped */ }
    }, 300);
  }
  // Siren: two-tone wail whose volume follows the nearest police car.
  const sirenGain = opts.sirenGain || 0;
  if (sirenGain > 0.01 && !muted) {
    if (!sirenNodes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      g.gain.value = 0;
      osc.connect(g).connect(master);
      osc.start();
      sirenNodes = { osc, g, phase: 0 };
    }
    sirenNodes.phase += dt * 2.4;
    const tone = Math.sin(sirenNodes.phase * Math.PI) > 0 ? 740 : 988;
    sirenNodes.osc.frequency.setTargetAtTime(tone, ctx.currentTime, 0.03);
    sirenNodes.g.gain.setTargetAtTime(Math.min(0.055, sirenGain * 0.07), ctx.currentTime, 0.1);
  } else if (sirenNodes) {
    sirenNodes.g.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    const nodes = sirenNodes;
    sirenNodes = null;
    setTimeout(() => {
      try { nodes.osc.stop(); } catch { /* already stopped */ }
    }, 300);
  }
}
