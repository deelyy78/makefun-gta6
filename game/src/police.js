// police.js — the Port Solano PD: a wanted-heat system fed by witnessed
// crimes, patrol spawns that scale with your stars, pursuit steering, and
// the bust meter that ends a chase when they pin you down.

import { S, showToast } from './state.js';
import { makeCar, removeCar, steerToward, stepCarPhysics, runOverCheck } from './vehicles.js';
import { randomRoadPoint } from './world.js';
import { createRng } from './random.js';

const rng = createRng(777001);

// Heat each crime adds when somebody sees it happen.
const CRIME_HEAT = {
  shot: 0.7, shootPed: 1.7, shootCop: 2.4, runover: 1.9,
  steal: 1.1, stealCop: 2.3, crash: 0.45, shove: 0.6,
};
const CARS_BY_STARS = [0, 1, 2, 3, 5, 6];

function witnessed(crime) {
  for (const ped of S.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - crime.x, ped.y - crime.y) < 250) return true;
  }
  for (const car of S.cars) {
    const reach = car.type === 'police' ? 500 : 230;
    if (Math.hypot(car.x - crime.x, car.y - crime.y) < reach) return true;
  }
  return false;
}

export function starsForHeat(heat) {
  if (heat <= 0) return 0;
  if (heat > 8.2) return 5;
  if (heat > 5.4) return 4;
  if (heat > 3.2) return 3;
  if (heat > 1.6) return 2;
  return 1;
}

export function updateWanted(dt) {
  const w = S.wanted;
  const p = S.player;
  for (const crime of S.crimes) {
    if (witnessed(crime)) {
      w.heat += CRIME_HEAT[crime.kind] || 0.5;
      w.lastCrime = S.time;
      w.lastSeen = S.time;
      w.px = p.x;
      w.py = p.y;
    }
  }
  S.crimes.length = 0;
  // Being watched refreshes the trail.
  let seen = false;
  for (const car of S.cars) {
    if (car.type === 'police' && Math.hypot(car.x - p.x, car.y - p.y) < 430) seen = true;
  }
  if (seen) {
    w.lastSeen = S.time;
    w.px = p.x;
    w.py = p.y;
  }
  const wasStars = w.stars;
  if (S.time - w.lastSeen > 6 && S.time - w.lastCrime > 4 && w.heat > 0) {
    w.heat = Math.max(0, w.heat - dt * (w.heat > 3 ? 0.1 : 0.2));
  }
  w.stars = starsForHeat(w.heat);
  if (wasStars > 0 && w.stars === 0) {
    showToast('You shook the PSPD', 'Heat is off — for now', 2.4);
  }
  S.searching = w.stars > 0 && S.time - w.lastSeen > 5;
}

let spawnCd = 0;

export function updatePolice(dt) {
  const w = S.wanted;
  const p = S.player;
  spawnCd -= dt;
  let count = 0;
  for (const car of S.cars) if (car.type === 'police' && car.driver === 'police') count++;
  const want = CARS_BY_STARS[w.stars] || 0;
  if (spawnCd <= 0 && count < want) {
    const spot = randomRoadPoint(rng, p.x, p.y, 640, 920);
    const cop = makeCar('police', spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x), 'police');
    cop.speed = cop.def.top * 0.5;
    spawnCd = 1.6;
  }
  let nearest = Infinity;
  for (let i = S.cars.length - 1; i >= 0; i--) {
    const car = S.cars[i];
    if (car.type !== 'police' || car.driver !== 'police') continue;
    const d = Math.hypot(car.x - p.x, car.y - p.y);
    nearest = Math.min(nearest, d);
    if (w.stars === 0 && d > 1150) {
      removeCar(car);
      continue;
    }
    // Chase the player when close or at high heat; otherwise hunt the last
    // known position and prowl the streets around it.
    const knows = d < 560 || w.stars >= 4;
    let tx = knows ? p.x : w.px;
    let ty = knows ? p.y : w.py;
    let wantSpeed = car.def.top * (0.8 + w.stars * 0.045);
    if (!knows && Math.hypot(car.x - tx, car.y - ty) < 90) {
      const roam = randomRoadPoint(rng, tx, ty, 60, 320);
      car.roamX = roam.x;
      car.roamY = roam.y;
    }
    if (!knows && car.roamX !== undefined) {
      tx = car.roamX;
      ty = car.roamY;
      wantSpeed = 130;
    }
    const ctl = steerToward(car, tx, ty, wantSpeed, dt);
    stepCarPhysics(car, ctl.throttle, ctl.steer, false, dt);
    runOverCheck(car);
  }
  // The bust meter: pinned and slow with a unit on top of you.
  const pSpeed = p.car ? Math.abs(p.car.speed) : 0;
  const pinned = nearest < (p.car ? 78 : 62) && pSpeed < 26;
  if (pinned && w.stars > 0 && S.mode === 'play') {
    p.bust = Math.min(1, p.bust + dt / (p.car ? 3.4 : 2.1));
  } else {
    p.bust = Math.max(0, p.bust - dt * 0.8);
  }
  S.nearestCop = nearest;
}
