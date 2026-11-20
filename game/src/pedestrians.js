// pedestrians.js — the people of Port Solano: they stroll the sidewalks and
// parks, chat in pairs, and run screaming when the shooting starts or a car
// comes at them. Kept near the player, recycled as the camera moves.

import { BLOCK, ROAD, PITCH } from './config.js';
import { S } from './state.js';
import { collideCircle } from './world.js';
import { createRng, pick, range, clamp } from './random.js';

const rng = createRng(4451);
const SHIRTS = ['#e2725b', '#f2d16b', '#7fb3d5', '#a3d9a5', '#e8a2c8', '#f5f0e6', '#5b8e7d', '#c97b4a', '#88c0d0', '#b56576'];
const SKINS = ['#f2c79b', '#c68863', '#8d5a3b', '#6e4230', '#ffd9b3'];

export function makePed(x, y) {
  const ped = {
    x, y, angle: range(rng, 0, Math.PI * 2),
    speed: 0, shirt: pick(rng, SHIRTS), skin: pick(rng, SKINS),
    state: 'walk', // walk | wait | flee | down
    tx: x, ty: y, wait: 0, fleeFor: 0, downFor: 0,
    walkPhase: range(rng, 0, 6),
  };
  S.peds.push(ped);
  return ped;
}

// A point on a sidewalk or in a park near (x, y): the rim of a random block.
function sidewalkPointNear(x, y, spread) {
  const bi = clamp(Math.floor(x / PITCH) + Math.floor(range(rng, -1.6, 1.6)), 0, 7);
  const bj = clamp(Math.floor(y / PITCH) + Math.floor(range(rng, -1.6, 1.6)), 0, 5);
  const bx = bi * PITCH + ROAD;
  const by = bj * PITCH + ROAD;
  const edge = Math.floor(range(rng, 0, 4));
  const t = range(rng, 8, BLOCK - 8);
  if (edge === 0) return { x: bx + t, y: by + 7 };
  if (edge === 1) return { x: bx + t, y: by + BLOCK - 7 };
  if (edge === 2) return { x: bx + 7, y: by + t };
  return { x: bx + BLOCK - 7, y: by + t };
}

let spawnCd = 0;

export function updatePeds(dt) {
  const px = S.player.car ? S.player.car.x : S.player.x;
  const py = S.player.car ? S.player.car.y : S.player.y;
  spawnCd -= dt;
  if (spawnCd <= 0 && S.peds.length < 16) {
    const p = sidewalkPointNear(px, py, 600);
    if (Math.hypot(p.x - px, p.y - py) > 330) {
      const ped = makePed(p.x, p.y);
      const t = sidewalkPointNear(p.x, p.y, 300);
      ped.tx = t.x;
      ped.ty = t.y;
    }
    spawnCd = 0.5;
  }

  const shot = S.lastShot;
  const shotFresh = shot && S.time - shot.t < 1.6;
  for (let i = S.peds.length - 1; i >= 0; i--) {
    const ped = S.peds[i];
    const dPlayer = Math.hypot(ped.x - px, ped.y - py);
    if (dPlayer > 1300 && ped.state !== 'down') {
      S.peds.splice(i, 1);
      continue;
    }
    if (ped.state === 'down') {
      ped.downFor -= dt;
      if (ped.downFor <= 0) S.peds.splice(i, 1);
      continue;
    }
    // Panic: a fresh gunshot nearby, a hostile shooting, or a fast car close.
    let threat = null;
    if (shotFresh && Math.hypot(ped.x - shot.x, ped.y - shot.y) < 250) threat = shot;
    if (!threat && S.player.car && Math.abs(S.player.car.speed) > 150 && dPlayer < 85) {
      threat = { x: S.player.car.x, y: S.player.car.y };
    }
    if (threat && ped.state !== 'flee') {
      ped.state = 'flee';
      ped.fleeFor = range(rng, 1.4, 2.8);
      ped.angle = Math.atan2(ped.y - threat.y, ped.x - threat.x);
    }
    if (ped.state === 'flee') {
      ped.fleeFor -= dt;
      ped.speed = 158;
      if (ped.fleeFor <= 0) {
        ped.state = 'walk';
        const t = sidewalkPointNear(ped.x, ped.y, 200);
        ped.tx = t.x;
        ped.ty = t.y;
      }
    } else if (ped.state === 'wait') {
      ped.speed = 0;
      ped.wait -= dt;
      if (ped.wait <= 0) {
        ped.state = 'walk';
        const t = sidewalkPointNear(ped.x, ped.y, 380);
        ped.tx = t.x;
        ped.ty = t.y;
      }
    } else {
      // Walk toward the target; stroll speed varies per person.
      const dx = ped.tx - ped.x;
      const dy = ped.ty - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 9) {
        if (rng() < 0.3) {
          ped.state = 'wait';
          ped.wait = range(rng, 1, 4);
        } else {
          const t = sidewalkPointNear(ped.x, ped.y, 380);
          ped.tx = t.x;
          ped.ty = t.y;
        }
        ped.speed = 0;
      } else {
        ped.angle = Math.atan2(dy, dx);
        ped.speed = 62;
      }
    }
    if (ped.speed > 0) {
      ped.walkPhase += dt * (ped.speed / 9);
      let nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
      let ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
      const res = collideCircle(S.world, nx, ny, 9);
      nx = res.x;
      ny = res.y;
      if (res.hit && ped.state === 'flee') ped.angle += 0.9 * dt * 3;
      ped.x = nx;
      ped.y = ny;
    }
  }
}

// The nearest living pedestrian to a point (for shoves, fares and dialogue).
export function nearestPed(x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const ped of S.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - x, ped.y - y);
    if (d < bestD) {
      bestD = d;
      best = ped;
    }
  }
  return best;
}
