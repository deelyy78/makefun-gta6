// main.js — boots Solano Heat, owns the frame loop and the mode machine
// (title, play, pause, busted, wasted), the camera, the DOM menus, saving,
// and the staged ?shot= scenes the screenshots are taken from.

import { WORLD_W, WORLD_H, COAST_Y } from './config.js';
import { S, resetState, showBanner } from './state.js';
import { buildCity } from './world.js';
import { initInput, wasPressed, mouse, endFrameInput } from './input.js';
import { drawScene } from './render.js';
import { drawHUD } from './hud.js';
import { updatePlayer } from './player.js';
import { updateTraffic, updateCarCollisions, spawnParkedCars, makeCar, spawnTrafficNear } from './vehicles.js';
import { updatePeds, makePed } from './pedestrians.js';
import { updateWanted, updatePolice } from './police.js';
import { updateMissions, advanceDialogue, failMission, makeHostile, stageMissionForShot } from './missions.js';
import { loadSave, storeSave, defaultSave } from './save.js';
import { initAudio, updateAudio, setMuted, sfxClick, sfxJingle } from './audio.js';
import { clamp, lerp } from './random.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const menuEl = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');

let endTimer = 0; // counts down the busted / wasted cards

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  S.view.w = canvas.width;
  S.view.h = canvas.height;
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------- run setup
function freshWorld() {
  resetState();
  S.world = buildCity();
  spawnParkedCars();
  const sp = S.world.spawn;
  S.player.x = sp.x;
  S.player.y = sp.y;
  S.cam.x = clamp(sp.x - S.view.w / 2, 0, WORLD_W - S.view.w);
  S.cam.y = clamp(sp.y - S.view.h / 2, 0, WORLD_H - S.view.h);
}

function startRun(save) {
  freshWorld();
  if (save) {
    S.cash = save.cash;
    S.respect = save.respect;
    S.missionDone = save.missionDone;
    S.smgOwned = save.smg;
    S.bestRace = save.bestRace;
    S.muted = save.muted;
    setMuted(save.muted);
    for (const st of S.world.stashes) if (save.stashes.includes(st.id)) st.taken = true;
    S.stats.stashes = save.stashes.length;
  }
  S.mode = 'play';
  menuEl.classList.add('hidden');
  pauseEl.classList.add('hidden');
  initAudio();
  sfxClick();
}

function persist() {
  const taken = S.world.stashes.filter((s) => s.taken).map((s) => s.id);
  storeSave({
    cash: S.cash, respect: S.respect, missionDone: S.missionDone,
    stashes: taken, bestRace: S.bestRace, smg: S.smgOwned,
    muted: S.muted, started: true,
  });
  S.saveDirty = false;
}

// ------------------------------------------------------------- menus
const existing = loadSave();
if (existing && existing.started) document.getElementById('btn-continue').classList.remove('hidden');
document.getElementById('btn-new').addEventListener('click', () => startRun(null));
document.getElementById('btn-continue').addEventListener('click', () => startRun(loadSave() || defaultSave()));
document.getElementById('btn-how').addEventListener('click', () => {
  document.getElementById('how-panel').classList.toggle('hidden');
  initAudio();
  sfxClick();
});
document.getElementById('btn-resume').addEventListener('click', () => togglePause(false));
document.getElementById('btn-quit').addEventListener('click', () => {
  persist();
  S.mode = 'title';
  pauseEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  freshWorld();
  S.player.dead = true; // Dario waits off-stage while the title camera drifts
});

function togglePause(on) {
  if (S.mode !== 'play' && S.mode !== 'pause') return;
  S.mode = on ? 'pause' : 'play';
  pauseEl.classList.toggle('hidden', !on);
  if (on) {
    document.getElementById('pause-stats').innerHTML =
      'Cash <b>$' + S.cash.toLocaleString('en-US') + '</b> · Respect <b>' + S.respect + '</b><br>' +
      'Story jobs done <b>' + S.missionDone + ' / 6</b> · Stashes <b>' + S.stats.stashes + ' / 20</b><br>' +
      'Taxi fares <b>' + S.stats.fares + '</b> · Cars stolen <b>' + S.stats.carsStolen + '</b>' +
      (S.bestRace ? '<br>Best Coast Run <b>' + S.bestRace.toFixed(1) + 's</b>' : '');
  }
  sfxClick();
}

// ------------------------------------------------------------- endings
function doBusted() {
  S.mode = 'busted';
  endTimer = 2.8;
  failMission('The PSPD got you');
  sfxJingle(false);
}

function doWasted() {
  S.mode = 'wasted';
  endTimer = 2.8;
  failMission('You woke up at Solano General');
  sfxJingle(false);
}

function respawn(kind) {
  const p = S.player;
  if (p.car) {
    p.car.driver = 'parked';
    p.car = null;
  }
  const fine = Math.min(300, Math.round(S.cash * 0.15));
  S.cash -= fine;
  S.wanted.heat = 0;
  S.wanted.stars = 0;
  p.bust = 0;
  p.dead = false;
  p.hp = 100;
  p.armor = 0;
  const lm = S.world.landmarks;
  if (kind === 'busted') {
    p.x = lm.precinct.x;
    p.y = lm.precinct.y + 190;
    showBanner('BUSTED', 'The PSPD take $' + fine + ' and your dignity', 2.6);
    S.stats.busted++;
  } else {
    p.x = lm.hospital.x;
    p.y = lm.hospital.y + 190;
    showBanner('WASTED', 'Solano General patches you up — $' + fine, 2.6);
    S.stats.wasted++;
  }
  S.saveDirty = true;
  S.mode = 'play';
}

// ------------------------------------------------------------- shot scenes
function putPlayerInCar(type, x, y, angle, speed, color) {
  const car = makeCar(type, x, y, angle, 'player');
  if (color) car.color = color;
  car.speed = speed;
  S.player.car = car;
  S.player.x = x;
  S.player.y = y;
  return car;
}

function setupShot(name) {
  startRun(null);
  S.cash = 1250;
  S.respect = 130;
  const p = S.player;
  if (name === 'drive') {
    putPlayerInCar('sports', 640, 2394, 0, 205, '#e33f5f');
    S.autoDrive = true;
    const sedan = makeCar('sedan', 1150, 2394, 0, 'traffic');
    sedan.ci = 3; sedan.cj = 6; sedan.heading = 0; sedan.speed = 110;
    const taxi = makeCar('taxi', 1750, 2394, 0, 'traffic');
    taxi.ci = 5; taxi.cj = 6; taxi.heading = 0; taxi.speed = 120;
    stageMissionForShot(0, 1, 96);
  } else if (name === 'chase') {
    putPlayerInCar('sports', 1500, 828, 0, 235, '#ffb400');
    S.autoDrive = true;
    S.wanted.heat = 5.2;
    S.wanted.lastSeen = 0;
    const cop1 = makeCar('police', 1290, 800, 0, 'police');
    cop1.speed = 215;
    const cop2 = makeCar('police', 1330, 880, 0.2, 'police');
    cop2.speed = 205;
    const cop3 = makeCar('police', 1700, 700, 2.6, 'police');
    cop3.speed = 150;
    const traffic = makeCar('sedan', 1900, 858, 0, 'traffic');
    traffic.ci = 5; traffic.cj = 2; traffic.heading = 0; traffic.speed = 90;
    stageMissionForShot(4, 1, null);
  } else if (name === 'mission') {
    S.missionDone = 2;
    p.x = 2320;
    p.y = 2458;
    p.weapon = 'pistol';
    makeHostile(2405, 2452);
    makeHostile(2462, 2496);
    makeHostile(2352, 2510);
    const car = makeCar('sedan', 2240, 2400, 0.4, 'parked');
    car.color = '#3f6fb5';
    stageMissionForShot(2, 1, null);
  } else if (name === 'foot') {
    S.missionDone = 2;
    p.x = 1010;
    p.y = 1150;
    p.aim = 0.5;
    const spots = [[940, 1090], [1105, 1120], [965, 1245], [1130, 1260], [880, 1180], [1180, 1080]];
    for (const [x, y] of spots) {
      const ped = makePed(x, y);
      ped.tx = x + 60;
      ped.ty = y + 20;
    }
    const taxi = makeCar('taxi', 798, 1060, Math.PI / 2, 'traffic');
    taxi.ci = 2; taxi.cj = 3; taxi.heading = 1; taxi.speed = 70;
  }
  S.cam.x = clamp(p.x - S.view.w / 2, 0, Math.max(0, WORLD_W - S.view.w));
  S.cam.y = clamp(p.y - S.view.h / 2, 0, Math.max(0, WORLD_H - S.view.h));
}

// ------------------------------------------------------------- frame
let lastNow = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.033, (now - lastNow) / 1000);
  lastNow = now;
  if (dt <= 0) dt = 0.001;
  S.time += dt;

  if ((wasPressed('Escape') || wasPressed('KeyP')) && !S.dialogue) {
    if (S.mode === 'play') togglePause(true);
    else if (S.mode === 'pause') togglePause(false);
  }

  if (S.mode === 'title') {
    // The city lives behind the menu: traffic rolls, people stroll, and the
    // camera drifts along the coast.
    const focus = { x: 400 + (Math.sin(S.time * 0.021) * 0.5 + 0.5) * (WORLD_W - 800), y: COAST_Y - 120 };
    S.player.x = focus.x;
    S.player.y = focus.y;
    updateTraffic(dt);
    updateCarCollisions(dt);
    updatePeds(dt);
    S.cam.x = clamp(focus.x - S.view.w / 2, 0, Math.max(0, WORLD_W - S.view.w));
    S.cam.y = clamp(COAST_Y - S.view.h + 130, 0, Math.max(0, WORLD_H - S.view.h));
  } else if (S.mode === 'pause') {
    // Frozen; the loop only draws.
  } else if (S.mode === 'busted' || S.mode === 'wasted') {
    endTimer -= dt;
    updateTraffic(dt);
    updatePeds(dt);
    if (endTimer <= 0) respawn(S.mode);
  } else if (S.dialogue) {
    updateTraffic(dt);
    updatePeds(dt);
    if (wasPressed('KeyE') || wasPressed('Enter') || mouse.clicked) advanceDialogue();
  } else {
    // Full simulation.
    updatePlayer(dt);
    if (S.autoDrive && S.player.car) {
      // Screenshot scenes: Dario holds his speed so the shot stays alive.
      S.player.car.speed = Math.max(S.player.car.speed, 185);
    }
    updateTraffic(dt);
    updateCarCollisions(dt);
    updatePeds(dt);
    updateWanted(dt);
    updatePolice(dt);
    updateMissions(dt);
    if (wasPressed('KeyM')) {
      S.muted = !S.muted;
      setMuted(S.muted);
      S.saveDirty = true;
    }
    if (S.player.bust >= 1) doBusted();
    else if (S.player.dead) doWasted();
    if (S.saveDirty) persist();
  }

  // Camera follows Dario (or his car) in every live mode.
  if (S.mode === 'play' || S.dialogue) {
    const tx = clamp(S.player.x - S.view.w / 2, 0, Math.max(0, WORLD_W - S.view.w));
    const ty = clamp(S.player.y - S.view.h / 2, 0, Math.max(0, WORLD_H - S.view.h));
    const k = 1 - Math.pow(0.002, dt);
    S.cam.x = lerp(S.cam.x, tx, k);
    S.cam.y = lerp(S.cam.y, ty, k);
  }

  // Effects always decay, whatever the mode.
  S.shake = Math.max(0, S.shake - dt * 26);
  for (let i = S.tracers.length - 1; i >= 0; i--) {
    S.tracers[i].life -= dt;
    if (S.tracers[i].life <= 0) S.tracers.splice(i, 1);
  }
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const pt = S.parts[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) S.parts.splice(i, 1);
  }
  for (let i = S.skids.length - 1; i >= 0; i--) {
    S.skids[i].life -= dt * 0.025;
    if (S.skids[i].life <= 0) S.skids.splice(i, 1);
  }
  for (let i = S.floats.length - 1; i >= 0; i--) {
    S.floats[i].life -= dt;
    if (S.floats[i].life <= 0) S.floats.splice(i, 1);
  }

  // Sound follows the action.
  const driving = !!S.player.car && S.mode === 'play';
  updateAudio(dt, {
    driving,
    speedRatio: driving ? S.player.car.speed / S.player.car.def.top : 0,
    sirenGain: S.wanted.stars > 0 && S.nearestCop < 700 ? 1 - S.nearestCop / 700 : 0,
  });

  drawScene(ctx, S.view.w, S.view.h);
  drawHUD(ctx, S.view.w, S.view.h, dt);
  if (S.mode === 'busted' || S.mode === 'wasted') {
    ctx.fillStyle = S.mode === 'busted' ? 'rgba(30,60,160,0.3)' : 'rgba(120,10,10,0.32)';
    ctx.fillRect(0, 0, S.view.w, S.view.h);
    ctx.font = '900 64px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(S.mode === 'busted' ? 'BUSTED' : 'WASTED', S.view.w / 2, S.view.h / 2);
  }
  if (shotMode && S.time > 1.7) window.__shotReady = true;
  endFrameInput();
}

// ------------------------------------------------------------- boot
freshWorld();
S.player.dead = true; // title screen: the city idles without Dario in frame
initInput(canvas);
resize();
if (shotMode) setupShot(shotMode);
requestAnimationFrame(frame);
