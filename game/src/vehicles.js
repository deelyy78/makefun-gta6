// vehicles.js — cars: arcade physics, the traffic that drives Port Solano's
// road grid on the right-hand lane, parked cars, and shared steering helpers
// the police and rival drivers use too.

import { CAR_TYPES, PITCH, ROAD, COLS, ROWS } from './config.js';
import { S } from './state.js';
import { collideCircle, intersectionX, intersectionY, randomRoadPoint } from './world.js';
import { createRng, pick, range, clamp, lerp, angleDelta } from './random.js';
import { sfxCrash, sfxHorn } from './audio.js';

const rng = createRng(987123);
let nextId = 1;
const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'van', 'truck'];

export function makeCar(type, x, y, angle, driver) {
  const def = CAR_TYPES[type];
  const car = {
    id: nextId++,
    type, def, x, y, angle,
    speed: 0, steerVis: 0,
    color: pick(rng, def.colors),
    health: 100,
    driver: driver || 'parked', // parked | traffic | police | player | rival
    ci: 0, cj: 0, heading: 0, // traffic navigation: target intersection + way
    cruise: range(rng, 0.4, 0.58),
    honkCd: 0, stuckFor: 0, brakeLight: 0,
    dead: false, smokeCd: 0,
  };
  S.cars.push(car);
  return car;
}

export function removeCar(car) {
  car.dead = true;
  const i = S.cars.indexOf(car);
  if (i >= 0) S.cars.splice(i, 1);
}

// The lane-correct target point for a car heading to intersection (ci, cj).
function navTarget(car) {
  if (car.heading === 0) return { x: intersectionX(car.ci), y: car.cj * PITCH + ROAD * 0.75 };
  if (car.heading === 2) return { x: intersectionX(car.ci), y: car.cj * PITCH + ROAD * 0.25 };
  if (car.heading === 1) return { x: car.ci * PITCH + ROAD * 0.25, y: intersectionY(car.cj) };
  return { x: car.ci * PITCH + ROAD * 0.75, y: intersectionY(car.cj) };
}

const HEADING_ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const HEADING_STEP = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function pickHeading(car) {
  const options = [];
  for (let h = 0; h < 4; h++) {
    if (h === (car.heading + 2) % 4 && car.heading !== -1) continue; // no U-turns
    const ni = car.ci + HEADING_STEP[h][0];
    const nj = car.cj + HEADING_STEP[h][1];
    if (ni < 0 || nj < 0 || ni > COLS || nj > ROWS) continue;
    options.push(h);
  }
  if (!options.length) return (car.heading + 2) % 4;
  // Prefer going straight, then a random turn.
  if (options.includes(car.heading) && rng() < 0.55) return car.heading;
  return pick(rng, options);
}

function setHeading(car, h) {
  car.heading = h;
  car.ci += HEADING_STEP[h][0];
  car.cj += HEADING_STEP[h][1];
}

// Spawn one traffic car on a road near (but not too near) a point, already
// rolling in its lane toward its first intersection.
export function spawnTrafficNear(x, y, minD, maxD) {
  const p = randomRoadPoint(rng, x, y, minD, maxD);
  const ci = clamp(Math.round((p.x - ROAD / 2) / PITCH), 0, COLS);
  const cj = clamp(Math.round((p.y - ROAD / 2) / PITCH), 0, ROWS);
  const car = makeCar(pick(rng, TRAFFIC_TYPES), p.x, p.y, 0, 'traffic');
  car.ci = ci;
  car.cj = cj;
  car.heading = -1;
  const h = pickHeading(car);
  car.heading = h;
  // Step back from the target intersection along the heading, in-lane.
  const t = navTarget(car);
  car.x = t.x - Math.cos(HEADING_ANGLE[h]) * 240;
  car.y = t.y - Math.sin(HEADING_ANGLE[h]) * 240;
  car.angle = HEADING_ANGLE[h];
  car.speed = car.def.top * car.cruise * 0.7;
  for (const other of S.cars) {
    if (other !== car && Math.hypot(other.x - car.x, other.y - car.y) < 70) {
      removeCar(car);
      return null;
    }
  }
  return car;
}

export function spawnParkedCars() {
  for (const spot of S.world.lotSpots) {
    if (rng() < 0.3) continue;
    const car = makeCar(pick(rng, TRAFFIC_TYPES), spot.x, spot.y, spot.angle + range(rng, -0.05, 0.05), 'parked');
    car.speed = 0;
  }
  // A few along the coast road, noses to the beach.
  for (let n = 0; n < 7; n++) {
    const x = range(rng, 200, 2900);
    makeCar(pick(rng, TRAFFIC_TYPES), x, 2268, Math.PI / 2, 'parked');
  }
}

// The shared arcade step: throttle -1..1, steer -1..1, brake (handbrake).
// Returns the impact speed of any crash this step (0 when clean).
export function stepCarPhysics(car, throttle, steer, brake, dt) {
  const def = car.def;
  const spd = car.speed;
  const authority = clamp(Math.abs(spd) / 55, 0, 1) * (Math.abs(spd) > def.top * 0.8 ? 0.72 : 1);
  const turnRate = def.grip * 0.52 * (brake ? 1.5 : 1);
  car.angle += steer * turnRate * authority * dt * (spd < -1 ? -1 : 1);
  car.steerVis = lerp(car.steerVis || 0, steer * 0.45, 1 - Math.pow(0.0001, dt));

  if (throttle > 0) {
    car.speed += def.accel * throttle * dt * (1 - Math.max(0, spd) / (def.top * 1.12));
  } else if (throttle < 0) {
    car.speed += (spd > 6 ? -340 : def.accel * 0.5 * throttle) * dt;
  }
  if (brake) {
    car.speed -= Math.sign(spd) * Math.min(Math.abs(spd), 460 * dt);
    if (Math.abs(car.speed) > 90 && car.driver === 'player') addSkid(car);
  }
  const drag = throttle === 0 ? 1.5 : 0.5;
  car.speed -= car.speed * drag * dt;
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;
  car.speed = clamp(car.speed, -def.top * 0.3, def.top);

  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let nx = car.x + fx * car.speed * dt;
  let ny = car.y + fy * car.speed * dt;
  let impact = 0;
  // Two collision circles, front and back axle.
  const r = def.wid * 0.58;
  for (const s of [-0.3, 0.3]) {
    const cx = nx + fx * def.len * s;
    const cy = ny + fy * def.len * s;
    const res = collideCircle(S.world, cx, cy, r);
    if (res.hit) {
      nx += res.x - cx;
      ny += res.y - cy;
      impact = Math.max(impact, Math.abs(car.speed));
    }
  }
  car.x = nx;
  car.y = ny;
  if (impact > 55) {
    damageCar(car, impact * 0.16, car.x + fx * def.len * 0.4, car.y + fy * def.len * 0.4);
    car.speed *= impact > 150 ? 0.2 : 0.45;
    if (car.driver === 'player') {
      S.shake = Math.min(14, impact * 0.05);
      S.player.hp = Math.max(1, S.player.hp - impact * 0.02);
    }
    sfxCrash(impact / 30);
  } else if (impact > 0) {
    car.speed *= 0.82;
  }
  return impact;
}

function addSkid(car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const px = -fy;
  const py = fx;
  for (const s of [-1, 1]) {
    const bx = car.x - fx * car.def.len * 0.3 + px * car.def.wid * 0.4 * s;
    const by = car.y - fy * car.def.len * 0.3 + py * car.def.wid * 0.4 * s;
    const last = S.skids[S.skids.length - 1];
    if (!last || Math.hypot(last.x2 - bx, last.y2 - by) > 6) {
      S.skids.push({ x1: bx, y1: by, x2: bx, y2: by, life: 1 });
    } else {
      last.x2 = bx;
      last.y2 = by;
    }
  }
  if (S.skids.length > 260) S.skids.splice(0, S.skids.length - 260);
}

export function damageCar(car, amount, x, y) {
  car.health -= amount;
  for (let i = 0; i < 5; i++) {
    S.parts.push({
      x, y, vx: range(rng, -70, 70), vy: range(rng, -70, 70),
      life: range(rng, 0.2, 0.5), max: 0.5, color: '#ffd94d', size: 3, grav: 0,
    });
  }
  if (car.health <= 0 && !car.dead) {
    car.health = 0;
    car.speed = 0;
    if (car.driver === 'traffic') car.driver = 'parked';
  }
}

// Steer a car toward a world point at a wanted speed; used by traffic,
// police and rivals alike. Returns {throttle, steer, brake}.
export function steerToward(car, tx, ty, wantSpeed, dt) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const delta = angleDelta(car.angle, desired);
  const steer = clamp(delta * 1.7, -1, 1);
  let throttle = car.speed < wantSpeed ? 1 : 0;
  if (Math.abs(delta) > 2.1) throttle = car.speed > 30 ? -1 : 0.4;
  else if (Math.abs(delta) > 1.1 && car.speed > wantSpeed * 0.9) throttle = -0.4;
  const brake = Math.abs(delta) > 0.9 && Math.abs(car.speed) > wantSpeed * 1.25;
  return { throttle, steer, brake };
}

// Is something solid in the cone ahead of a car? (For traffic braking.)
function blockedAhead(car, dist) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const px = car.x + fx * dist;
  const py = car.y + fy * dist;
  for (const other of S.cars) {
    if (other === car || other.dead) continue;
    if (Math.hypot(other.x - px, other.y - py) < other.def.len * 0.55 + 12) return other;
  }
  for (const ped of S.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - px, ped.y - py) < 17) return ped;
  }
  if (!S.player.car && Math.hypot(S.player.x - px, S.player.y - py) < 17) return S.player;
  return null;
}

let spawnCd = 0;

export function updateTraffic(dt) {
  spawnCd -= dt;
  let trafficCount = 0;
  for (const car of S.cars) if (car.driver === 'traffic') trafficCount++;
  const px = S.player.car ? S.player.car.x : S.player.x;
  const py = S.player.car ? S.player.car.y : S.player.y;
  if (spawnCd <= 0 && trafficCount < 13) {
    spawnTrafficNear(px, py, 540, 980);
    spawnCd = 0.8;
  }
  for (let i = S.cars.length - 1; i >= 0; i--) {
    const car = S.cars[i];
    if (car.driver !== 'traffic') continue;
    const far = Math.hypot(car.x - px, car.y - py) > 1250;
    if (far && car.health > 0) {
      removeCar(car);
      continue;
    }
    const target = navTarget(car);
    if (Math.hypot(target.x - car.x, target.y - car.y) < 46) {
      setHeading(car, pickHeading(car));
    }
    const want = car.def.top * car.cruise;
    const ctl = steerToward(car, target.x, target.y, want, dt);
    const blocker = blockedAhead(car, 58 + Math.abs(car.speed) * 0.22);
    car.honkCd -= dt;
    if (blocker) {
      ctl.throttle = car.speed > 4 ? -1 : 0;
      if (Math.abs(car.speed) < 6) {
        car.stuckFor += dt;
        if (car.stuckFor > 1.4 && car.honkCd <= 0) {
          sfxHorn();
          car.honkCd = range(rng, 2, 5);
          car.stuckFor = 0;
        }
      }
    } else {
      car.stuckFor = 0;
    }
    stepCarPhysics(car, ctl.throttle, ctl.steer, ctl.brake, dt);
    // Running a pedestrian over is a crime when the player does it, and a
    // mess whoever does it.
    runOverCheck(car);
  }
}

// Car-to-car bumps for every moving car (traffic, police, player, rivals).
export function updateCarCollisions(dt) {
  const cars = S.cars;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = a.def.len * 0.44 + b.def.len * 0.44;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      a.x -= ux * push;
      a.y -= uy * push;
      b.x += ux * push;
      b.y += uy * push;
      const rel = Math.abs(a.speed - b.speed);
      if (rel > 40) {
        damageCar(a, rel * 0.08, a.x, a.y);
        damageCar(b, rel * 0.08, b.x, b.y);
        sfxCrash(rel / 26);
        if (a.driver === 'player' || b.driver === 'player') {
          S.shake = Math.min(12, rel * 0.05);
          if (S.wanted.stars >= 0) S.crimes.push({ kind: 'crash', x: S.player.x, y: S.player.y });
        }
      }
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg * 0.9;
      b.speed = avg * 0.9;
    }
  }
}

export function runOverCheck(car) {
  if (Math.abs(car.speed) < 26) return;
  for (const ped of S.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    if (Math.abs(dx) > car.def.len * 0.6 + 8 || Math.abs(dy) > car.def.len * 0.6 + 8) continue;
    if (Math.hypot(dx, dy) < car.def.len * 0.42 + 7) {
      ped.state = 'down';
      ped.downFor = 7;
      if (car.driver === 'player') {
        S.crimes.push({ kind: 'runover', x: car.x, y: car.y });
        S.shake = Math.max(S.shake, 5);
      }
      car.speed *= 0.82;
    }
  }
  // Hostiles can be run down too — it is that kind of game.
  for (const hst of S.hostiles) {
    if (hst.state === 'down') continue;
    if (Math.hypot(hst.x - car.x, hst.y - car.y) < car.def.len * 0.42 + 7) {
      hst.state = 'down';
      hst.hp = 0;
      car.speed *= 0.85;
    }
  }
}

export function nearestCar(x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of S.cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}
