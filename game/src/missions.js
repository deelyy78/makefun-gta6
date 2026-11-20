// missions.js — the work of Port Solano: Marisol Vega's six-job story arc
// for Dario, plus taxi fares, the coast street race, hidden cash stashes,
// the Ammu-Mart and the hospital. Owns the dialogue runner, the objective
// marker and every E-key prompt that is not a car door.

import { S, showToast, showBanner, addFloat } from './state.js';
import { damagePlayer } from './player.js';
import { makeCar, steerToward, stepCarPhysics } from './vehicles.js';
import { collideCircle } from './world.js';
import { sfxCash, sfxJingle, sfxShot } from './audio.js';
import { createRng, clamp, range } from './random.js';

const rng = createRng(20261120);
const L = () => S.world.landmarks;

// ---------------------------------------------------------------- story arc
export const MISSIONS = [
  {
    name: 'First Run',
    giver: 'Marisol Vega',
    start: 'depot',
    intro: [
      ['Marisol Vega', 'Dario. You drive, you keep your mouth shut, you get paid. That is the whole contract.'],
      ['Marisol Vega', 'A package is waiting at the Palma Records storefront, north side. Bring it to the ferry dock — the boat does not wait.'],
    ],
    steps: [
      { kind: 'goto', x: 1340, y: 444, r: 52, label: 'Pick up the package at Palma Records' },
      { kind: 'goto', x: 2952, y: 2600, r: 62, label: 'Deliver to the ferry dock', time: 150 },
    ],
    reward: { cash: 300, respect: 10 },
  },
  {
    name: 'Hot Wheels',
    giver: 'Marisol Vega',
    start: 'depot',
    intro: [
      ['Marisol Vega', 'Auto Faro has a coral Vantara coupe with my name on it and their lock on it. Fix that.'],
      ['Marisol Vega', 'Take it off their lot and bring it home to the depot. If the PSPD notice, that is your problem, wheelman.'],
    ],
    steps: [
      { kind: 'steal', x: 2700, y: 252, label: 'Steal the coral Vantara from Auto Faro' },
      { kind: 'goto', x: 252, y: 2270, r: 62, label: 'Bring the Vantara to the depot', car: 'stolen' },
    ],
    reward: { cash: 450, respect: 15 },
  },
  {
    name: 'Beach Money',
    giver: 'Marisol Vega',
    start: 'depot',
    intro: [
      ['Marisol Vega', 'The Faro crew keeps a lockup under the east beach stairs. My money is in a grey briefcase inside.'],
      ['Dario Mercer', 'And the four gentlemen guarding it?'],
      ['Marisol Vega', 'Persuade them. Then bring the case home before the whole beach hears about it.'],
    ],
    steps: [
      { kind: 'goto', x: 2380, y: 2470, r: 56, label: 'Reach the east beach lockup' },
      { kind: 'clear', x: 2380, y: 2470, label: 'Clear the Faro crew' },
      { kind: 'pickup', x: 2430, y: 2492, label: 'Take the briefcase' },
      { kind: 'goto', x: 252, y: 2270, r: 62, label: 'Bring the briefcase to the depot' },
    ],
    reward: { cash: 600, respect: 20 },
  },
  {
    name: 'Night Freight',
    giver: 'Marisol Vega',
    start: 'depot',
    intro: [
      ['Marisol Vega', 'One truck, one load of perfectly legal aquarium supplies, one dock. The Faros disagree about the route.'],
      ['Marisol Vega', 'The Hauler is parked out front. Keep it rolling and keep it in one piece.'],
    ],
    steps: [
      { kind: 'truck', x: 420, y: 2260, label: 'Get in the Hauler truck' },
      { kind: 'goto', x: 2952, y: 2600, r: 70, label: 'Drive the freight to the ferry dock', car: 'truck' },
    ],
    reward: { cash: 750, respect: 25 },
  },
  {
    name: 'Three Drops',
    giver: 'Marisol Vega',
    start: 'depot',
    intro: [
      ['Marisol Vega', 'Three drops, three corners of the city, and every PSPD cruiser will be awake. I need them all, Dario.'],
      ['Dario Mercer', 'You are going to get me killed, Marisol.'],
      ['Marisol Vega', 'Then drive like it. Home to the depot when you have all three.'],
    ],
    steps: [
      { kind: 'goto', x: 500, y: 500, r: 52, label: 'Drop one — Plaza Ocho corner' },
      { kind: 'goto', x: 2748, y: 700, r: 52, label: 'Drop two — Marlin Hotel steps' },
      { kind: 'goto', x: 700, y: 1980, r: 52, label: 'Drop three — south-west blocks' },
      { kind: 'goto', x: 252, y: 2270, r: 62, label: 'Bring all three drops to the depot' },
    ],
    reward: { cash: 900, respect: 30 },
    startHeat: 3.6,
  },
  {
    name: 'Last Ferry',
    giver: 'Marisol Vega',
    start: 'depot',
    intro: [
      ['Marisol Vega', 'Last job, wheelman. The ferry leaves in two minutes and half the PSPD knows your face.'],
      ['Marisol Vega', 'Be on that dock when it sails and Port Solano is yours. Miss it, and, well — swim well.'],
    ],
    steps: [
      { kind: 'goto', x: 2952, y: 2600, r: 66, label: 'Reach the ferry before it sails', time: 120 },
    ],
    reward: { cash: 1500, respect: 50 },
    startHeat: 6.2,
  },
];

// ------------------------------------------------------------- dialogue
export function startDialogue(speaker, lines, onDone) {
  S.dialogue = { speaker, lines, i: 0, onDone: onDone || null };
}

export function advanceDialogue() {
  const d = S.dialogue;
  if (!d) return;
  d.i++;
  if (d.i >= d.lines.length) {
    S.dialogue = null;
    if (d.onDone) d.onDone();
  }
}

// ------------------------------------------------------------- hostiles
export function makeHostile(x, y) {
  const hst = {
    x, y, angle: range(rng, 0, 6.28), aim: 0, hp: 60,
    state: 'fight', shirt: '#a3271e', skin: '#c68863',
    walkPhase: range(rng, 0, 6), fireCd: range(rng, 0.4, 1.2),
    alerted: true, downFor: 0, strafe: rng() < 0.5 ? 1 : -1, strafeCd: range(rng, 1, 3),
  };
  S.hostiles.push(hst);
  return hst;
}

export function updateHostiles(dt) {
  const p = S.player;
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  for (let i = S.hostiles.length - 1; i >= 0; i--) {
    const h = S.hostiles[i];
    if (h.state === 'down') {
      if (h.downFor < 900) S.hostiles.splice(i, 1);
      continue;
    }
    const d = Math.hypot(tx - h.x, ty - h.y);
    h.aim = Math.atan2(ty - h.y, tx - h.x);
    h.angle = h.aim;
    // Keep a firing distance: close in past 210, back off inside 105.
    let mx = 0;
    let my = 0;
    if (d > 210) {
      mx = Math.cos(h.aim);
      my = Math.sin(h.aim);
    } else if (d < 105) {
      mx = -Math.cos(h.aim);
      my = -Math.sin(h.aim);
    } else {
      h.strafeCd -= dt;
      if (h.strafeCd <= 0) {
        h.strafe = -h.strafe;
        h.strafeCd = range(rng, 1, 2.6);
      }
      mx = Math.cos(h.aim + Math.PI / 2) * h.strafe * 0.6;
      my = Math.sin(h.aim + Math.PI / 2) * h.strafe * 0.6;
    }
    if (mx || my) {
      const res = collideCircle(S.world, h.x + mx * 92 * dt, h.y + my * 92 * dt, 10);
      h.x = res.x;
      h.y = res.y;
      h.walkPhase += dt * 10;
    }
    h.fireCd -= dt;
    if (d < 350 && h.fireCd <= 0 && S.mode === 'play') {
      h.fireCd = range(rng, 0.85, 1.5);
      sfxShot(false);
      S.lastShot = { x: h.x, y: h.y, t: S.time };
      const pSpeed = p.car ? Math.abs(p.car.speed) : 0;
      const hitChance = clamp(0.46 - d / 1400 - pSpeed / 900, 0.08, 0.5);
      const ex = tx + range(rng, -26, 26);
      const ey = ty + range(rng, -26, 26);
      S.tracers.push({ x1: h.x + Math.cos(h.aim) * 13, y1: h.y + Math.sin(h.aim) * 13 - 3, x2: ex, y2: ey - 3, life: 0.09 });
      if (Math.random() < hitChance) {
        if (p.car) {
          p.car.health -= 6;
          damagePlayer(2, h.x, h.y);
        } else {
          damagePlayer(range(rng, 6, 11), h.x, h.y);
        }
      }
    }
  }
}

// ------------------------------------------------------------- mission flow
export function currentMissionDef() {
  return MISSIONS[S.missionDone] || null;
}

function startMission(def) {
  S.mission = { def, idx: 0, timer: null, specialCar: null, rivalsSpawned: false };
  if (def.startHeat) S.wanted.heat = Math.max(S.wanted.heat, def.startHeat);
  setupStep();
  showBanner(def.name.toUpperCase(), 'A job for ' + def.giver, 2.4);
}

function setupStep() {
  const m = S.mission;
  if (!m) return;
  const step = m.def.steps[m.idx];
  m.timer = step.time || null;
  if (step.kind === 'steal' && !m.specialCar) {
    const car = makeCar('sports', step.x, step.y, Math.PI / 2, 'parked');
    car.color = '#ff7a59'; // the coral Vantara
    m.specialCar = car;
  }
  if (step.kind === 'truck' && !m.specialCar) {
    const truck = makeCar('truck', step.x, step.y, 0, 'parked');
    m.specialCar = truck;
  }
  if (step.kind === 'clear') {
    makeHostile(step.x - 40, step.y - 20);
    makeHostile(step.x + 46, step.y + 8);
    makeHostile(step.x - 6, step.y + 52);
    makeHostile(step.x + 70, step.y - 44);
  }
}

function stepDone() {
  const m = S.mission;
  m.idx++;
  if (m.idx >= m.def.steps.length) {
    completeMission();
    return;
  }
  setupStep();
  sfxCash();
}

function completeMission() {
  const def = S.mission.def;
  S.mission = null;
  S.missionDone++;
  S.cash += def.reward.cash;
  S.respect += def.reward.respect;
  S.saveDirty = true;
  showBanner('MISSION PASSED', def.name + '  ·  +$' + def.reward.cash, 3);
  sfxJingle(true);
  if (S.missionDone >= MISSIONS.length) {
    showToast('Story complete — Port Solano is yours', 'Fares, the race and stashes still pay', 5);
  }
}

export function failMission(reason) {
  if (!S.mission) return;
  S.mission = null;
  for (const h of S.hostiles) h.state = 'down';
  S.hostiles.length = 0;
  showToast('Mission failed', reason || 'Back to the marker to try again', 3);
  sfxJingle(false);
}

function stepComplete(step) {
  const p = S.player;
  const d = Math.hypot(p.x - step.x, p.y - step.y);
  switch (step.kind) {
    case 'goto':
      if (step.car === 'stolen') return p.car === S.mission.specialCar && d < step.r;
      if (step.car === 'truck') return p.car === S.mission.specialCar && d < step.r;
      return d < step.r;
    case 'steal':
      return p.car === S.mission.specialCar;
    case 'truck':
      return p.car === S.mission.specialCar;
    case 'clear':
      return S.hostiles.every((h) => h.state === 'down');
    case 'pickup':
      return !p.car && d < 32;
    default:
      return false;
  }
}

// Stage a mission mid-flight without its intro — used by the screenshot
// scenes in main.js so the HUD shows a real objective, marker and timer.
export function stageMissionForShot(defIndex, stepIdx, timer) {
  S.missionDone = defIndex;
  const def = MISSIONS[defIndex];
  S.mission = { def, idx: stepIdx, timer: timer ?? null, specialCar: null, rivalsSpawned: true };
}

// ------------------------------------------------------------- side work
const RACE_GATES = [
  { x: 1500, y: 2364 }, { x: 2400, y: 2364 }, { x: 2748, y: 1500 },
  { x: 1980, y: 828 }, { x: 828, y: 444 }, { x: 60, y: 1212 },
];

function updateRace(dt) {
  const race = S.race;
  if (!race) return;
  race.t += dt;
  const gate = race.next < RACE_GATES.length ? RACE_GATES[race.next] : L().race;
  if (Math.hypot(S.player.x - gate.x, S.player.y - gate.y) < 78) {
    race.next++;
    sfxCash();
    if (race.next > RACE_GATES.length) {
      const t = race.t;
      const pay = t < 150 ? 400 : t < 210 ? 250 : 120;
      S.cash += pay;
      S.respect += 6;
      S.saveDirty = true;
      if (!S.bestRace || t < S.bestRace) S.bestRace = t;
      showBanner('RACE FINISHED', t.toFixed(1) + 's  ·  +$' + pay, 3);
      sfxJingle(true);
      S.race = null;
    }
  }
}

let taxiOfferCd = 14;

function updateTaxi(dt) {
  const p = S.player;
  if (S.taxi) {
    const t = S.taxi;
    if (!p.car) {
      S.taxi = null;
      showToast('Fare lost', 'They will not ride on foot', 2);
      return;
    }
    if (Math.hypot(p.x - t.x, p.y - t.y) < 56 && Math.abs(p.car.speed) < 30) {
      S.cash += t.pay;
      S.respect += 2;
      S.stats.fares++;
      S.saveDirty = true;
      addFloat(t.x, t.y - 20, '+$' + t.pay, '#7dff8a');
      sfxCash();
      S.taxi = null;
    }
    return;
  }
  taxiOfferCd -= dt;
  if (taxiOfferCd > 0 || S.mission || !p.car) return;
  // A pedestrian near the road hails the player's car.
  for (const ped of S.peds) {
    if (ped.state === 'down' || ped.state === 'flee') continue;
    if (Math.hypot(ped.x - p.x, ped.y - p.y) < 130 && Math.abs(p.car.speed) < 24) {
      const dest = S.world.stashes[Math.floor(rng() * S.world.stashes.length)];
      const pay = Math.round(60 + Math.hypot(dest.x - ped.x, dest.y - ped.y) / 9);
      S.taxi = { x: dest.x, y: dest.y, pay };
      ped.state = 'down'; // climbs in (despawned as a walker)
      ped.downFor = 0.01;
      showToast('Fare picked up', 'Drive them to the gold ring — $' + pay, 2.6);
      taxiOfferCd = 20;
      return;
    }
  }
  taxiOfferCd = 2;
}

function updateStashes() {
  const p = S.player;
  for (const st of S.world.stashes) {
    if (st.taken) continue;
    if (Math.hypot(p.x - st.x, p.y - st.y) < 30) {
      st.taken = true;
      S.cash += 150;
      S.stats.stashes++;
      S.saveDirty = true;
      addFloat(st.x, st.y - 18, '+$150 STASH ' + S.stats.stashes + '/20', '#ffd94d');
      sfxCash();
    }
  }
}

// Night Freight's rival cars: they hunt the truck once it rolls.
function updateRivals(dt) {
  const m = S.mission;
  if (!m || m.def.name !== 'Night Freight') return;
  if (m.idx >= 1 && !m.rivalsSpawned) {
    m.rivalsSpawned = true;
    for (let i = 0; i < 3; i++) {
      const car = makeCar('sports', S.player.x + range(rng, -500, 500), S.player.y - 420 - i * 90, Math.PI / 2, 'rival');
      car.color = '#a3271e';
      m['rival' + i] = car;
    }
    showToast('Faro crew on your tail', 'Do not let them stop the truck', 3);
  }
  if (!m.rivalsSpawned) return;
  for (let i = 0; i < 3; i++) {
    const car = m['rival' + i];
    if (!car || car.dead || car.health <= 0) continue;
    const ctl = steerToward(car, S.player.x, S.player.y, car.def.top * 0.94, dt);
    stepCarPhysics(car, ctl.throttle, ctl.steer, false, dt);
  }
}

// ------------------------------------------------------------- per-frame
export function updateMissions(dt) {
  const p = S.player;
  S.useTarget = null;
  const lm = L();

  // Story marker / start prompt.
  if (!S.mission && !S.dialogue) {
    const def = currentMissionDef();
    if (def) {
      const start = lm[def.start];
      S.marker = { x: start.x, y: start.y, color: '#ffc53d', label: def.name };
      S.objective = 'Meet ' + def.giver + ' — ' + def.name;
      if (!p.car) {
        S.useTarget = {
          x: start.x, y: start.y, r: 52, label: 'Start: ' + def.name,
          action: () => startDialogue(def.giver, def.intro, () => startMission(def)),
        };
      }
    } else {
      S.objective = 'Free roam — fares, the street race and stashes pay';
      S.marker = null;
    }
  }

  // Active mission.
  if (S.mission) {
    const m = S.mission;
    const step = m.def.steps[m.idx];
    S.objective = m.def.name + ' — ' + step.label;
    S.marker = { x: step.x, y: step.y, color: '#ffc53d', label: '' };
    if (m.timer !== null && m.timer !== undefined) {
      m.timer -= dt;
      if (m.timer <= 0) {
        failMission('Out of time');
        return;
      }
    }
    if (stepComplete(step)) stepDone();
  }

  // Race start prompt (in a car) and race itself.
  if (!S.race && !S.mission && p.car) {
    S.useTarget = {
      x: lm.race.x, y: lm.race.y, r: 60, label: 'Start the Coast Run race',
      action: () => {
        S.race = { next: 0, t: 0 };
        showBanner('COAST RUN', 'Hit every ring, then come back here', 2.4);
      },
    };
  }
  if (S.race) {
    const gate = S.race.next < RACE_GATES.length ? RACE_GATES[S.race.next] : lm.race;
    S.marker = { x: gate.x, y: gate.y, color: '#2ec4b6', label: 'RACE' };
    S.objective = 'Coast Run — ring ' + Math.min(S.race.next + 1, RACE_GATES.length + 1) + ' of ' + (RACE_GATES.length + 1) + ' · ' + S.race.t.toFixed(0) + 's';
    updateRace(dt);
  }

  // Taxi overrides the marker while a fare is aboard.
  updateTaxi(dt);
  if (S.taxi) {
    S.marker = { x: S.taxi.x, y: S.taxi.y, color: '#7dff8a', label: 'FARE $' + S.taxi.pay };
    S.objective = 'Taxi fare — drop them at the green ring';
  }

  // Shop and hospital prompts on foot.
  if (!p.car && !S.mission) {
    if (Math.hypot(p.x - lm.shop.x, p.y - lm.shop.y) < 120) {
      S.useTarget = {
        x: lm.shop.x, y: lm.shop.y, r: 56, label: 'Ammu-Mart: SMG $600 · Armour $250',
        action: buyAtShop,
      };
    } else if (Math.hypot(p.x - lm.hospital.x, p.y - lm.hospital.y) < 120) {
      S.useTarget = {
        x: lm.hospital.x, y: lm.hospital.y, r: 56, label: 'Solano General: patch up ($100)',
        action: healAtHospital,
      };
    }
  }

  updateHostiles(dt);
  updateRivals(dt);
  updateStashes();
}

function buyAtShop() {
  if (!S.smgOwned && S.cash >= 600) {
    S.cash -= 600;
    S.smgOwned = true;
    S.player.weapon = 'smg';
    S.saveDirty = true;
    showToast('Micro SMG bought', 'Press 3 to draw it', 2.4);
    sfxCash();
    return;
  }
  if (S.player.armor < 100 && S.cash >= 250) {
    S.cash -= 250;
    S.player.armor = 100;
    S.saveDirty = true;
    showToast('Armour bought', 'Soaks most of a bullet', 2.2);
    sfxCash();
    return;
  }
  showToast('Ammu-Mart', 'SMG $600 · Armour $250 — you are short', 2.2);
}

function healAtHospital() {
  const p = S.player;
  if (p.hp >= 100) {
    showToast('Solano General', 'You are in perfect health', 1.8);
    return;
  }
  const cost = Math.min(100, S.cash);
  S.cash -= cost;
  p.hp = 100;
  S.saveDirty = true;
  showToast('Patched up', '-$' + cost, 1.8);
  sfxCash();
}
