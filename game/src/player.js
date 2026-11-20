// player.js — Dario Mercer: walking and aiming on foot, entering and
// stealing cars, driving them, shooting and shoving, taking damage. Also the
// E-key interaction hook the mission system plugs its prompts into.

import { WEAPONS } from './config.js';
import { S, showToast } from './state.js';
import { down, wasPressed, mouse, moveAxes } from './input.js';
import { collideCircle } from './world.js';
import { stepCarPhysics, nearestCar, damageCar, runOverCheck } from './vehicles.js';
import { makePed } from './pedestrians.js';
import { sfxShot } from './audio.js';

export function updatePlayer(dt) {
  const p = S.player;
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.hurtCd += dt;
  if (p.hurtCd > 6 && p.hp > 0 && p.hp < 45) p.hp = Math.min(45, p.hp + 5 * dt);
  if (wasPressed('Digit1')) p.weapon = 'fist';
  if (wasPressed('Digit2')) p.weapon = 'pistol';
  if (wasPressed('Digit3')) {
    if (S.smgOwned) p.weapon = 'smg';
    else showToast('Micro SMG locked', 'On sale at Ammu-Mart, Plaza Ocho', 1.8);
  }
  if (p.car) updateDriving(dt);
  else updateOnFoot(dt);
}

function updateOnFoot(dt) {
  const p = S.player;
  p.aim = Math.atan2(mouse.y - (p.y - S.cam.y), mouse.x - (p.x - S.cam.x));
  const ax = moveAxes();
  const sprint = down('ShiftLeft') || down('ShiftRight');
  const firing = mouse.down && p.weapon !== 'fist';
  let speed = sprint ? 252 : 168;
  if (firing) speed *= 0.55;
  if (ax.x || ax.y) {
    const len = Math.hypot(ax.x, ax.y);
    const vx = (ax.x / len) * speed;
    const vy = (ax.y / len) * speed;
    const res = collideCircle(S.world, p.x + vx * dt, p.y + vy * dt, 11);
    p.x = res.x;
    p.y = res.y;
    p.walkPhase += dt * (speed / 8.5);
    p.angle = Math.atan2(vy, vx);
  }
  if (mouse.down && p.fireCd <= 0) fireWeapon();
  if (wasPressed('KeyF')) shove();
  if (wasPressed('KeyE')) useKey();
}

function useKey() {
  const p = S.player;
  const car = nearestCar(p.x, p.y, 56);
  if (car && car.health > 0) {
    enterCar(car);
    return;
  }
  if (car && car.health <= 0) showToast('This wreck will not run', '', 1.4);
  if (S.useTarget && Math.hypot(S.useTarget.x - p.x, S.useTarget.y - p.y) < S.useTarget.r) {
    S.useTarget.action();
  }
}

export function enterCar(car) {
  const p = S.player;
  if (car.driver === 'traffic') {
    // The driver bails out and runs.
    const bail = makePed(car.x, car.y + 16);
    bail.state = 'flee';
    bail.fleeFor = 3;
    S.crimes.push({ kind: car.type === 'police' ? 'stealCop' : 'steal', x: car.x, y: car.y });
    S.stats.carsStolen++;
  } else if (car.type === 'police') {
    S.crimes.push({ kind: 'stealCop', x: car.x, y: car.y });
    S.stats.carsStolen++;
  } else if (car.driver === 'parked') {
    S.crimes.push({ kind: 'steal', x: car.x, y: car.y });
    S.stats.carsStolen++;
  }
  car.driver = 'player';
  car.speed = 0;
  p.car = car;
  p.bust = 0;
}

function exitCar() {
  const p = S.player;
  const car = p.car;
  if (!car) return;
  const side = car.angle - Math.PI / 2;
  const res = collideCircle(
    S.world,
    car.x + Math.cos(side) * (car.def.wid / 2 + 15),
    car.y + Math.sin(side) * (car.def.wid / 2 + 15),
    11,
  );
  p.x = res.x;
  p.y = res.y;
  car.driver = 'parked';
  car.speed = 0;
  p.car = null;
}

function updateDriving(dt) {
  const p = S.player;
  const car = p.car;
  const throttle = (down('KeyW') || down('ArrowUp') ? 1 : 0) - (down('KeyS') || down('ArrowDown') ? 1 : 0);
  const steer = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
  const brake = down('Space') || down('ShiftLeft') || down('ShiftRight');
  stepCarPhysics(car, throttle, steer, brake, dt);
  runOverCheck(car);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  if (car.health <= 0) {
    showToast('The engine is dead', 'Find another ride', 2);
    exitCar();
    return;
  }
  if (wasPressed('KeyE')) exitCar();
}

function fireWeapon() {
  const p = S.player;
  const def = WEAPONS[p.weapon];
  p.fireCd = def.rate;
  if (p.weapon === 'fist') {
    // A swing: anything within arm's reach in front takes it.
    const tx = p.x + Math.cos(p.aim) * 30;
    const ty = p.y + Math.sin(p.aim) * 30;
    for (const ped of S.peds) {
      if (ped.state !== 'down' && Math.hypot(ped.x - tx, ped.y - ty) < 22) {
        ped.state = 'down';
        ped.downFor = 5;
        S.crimes.push({ kind: 'shove', x: p.x, y: p.y });
      }
    }
    for (const hst of S.hostiles) {
      if (hst.state !== 'down' && Math.hypot(hst.x - tx, hst.y - ty) < 22) hurtHostile(hst, def.dmg);
    }
    return;
  }
  S.stats.shots++;
  S.lastShot = { x: p.x, y: p.y, t: S.time };
  sfxShot(p.weapon === 'smg');
  const spread = (Math.random() - 0.5) * 2 * def.spread;
  const a = p.aim + spread;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  let bestT = def.range;
  let best = null;
  const testCircle = (o, r, kind) => {
    const ox = o.x - p.x;
    const oy = o.y - p.y;
    const t = ox * dx + oy * dy;
    if (t < 8 || t > bestT) return;
    const perp = Math.abs(ox * dy - oy * dx);
    if (perp < r) {
      bestT = t;
      best = { o, kind };
    }
  };
  for (const ped of S.peds) if (ped.state !== 'down') testCircle(ped, 12, 'ped');
  for (const hst of S.hostiles) if (hst.state !== 'down') testCircle(hst, 12, 'hostile');
  for (const car of S.cars) if (car !== p.car) testCircle(car, car.def.len * 0.46, 'car');
  const ex = p.x + dx * bestT;
  const ey = p.y + dy * bestT;
  S.tracers.push({ x1: p.x + dx * 14, y1: p.y + dy * 14 - 3, x2: ex, y2: ey - 3, life: 0.09 });
  for (let i = 0; i < 3; i++) {
    S.parts.push({
      x: ex, y: ey, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90,
      life: 0.22, max: 0.22, color: '#ffe9a8', size: 2.4, grav: 0,
    });
  }
  S.crimes.push({ kind: 'shot', x: p.x, y: p.y });
  if (!best) return;
  S.stats.hits++;
  if (best.kind === 'ped') {
    best.o.state = 'down';
    best.o.downFor = 8;
    S.crimes.push({ kind: 'shootPed', x: p.x, y: p.y });
  } else if (best.kind === 'hostile') {
    hurtHostile(best.o, def.dmg);
  } else if (best.kind === 'car') {
    damageCar(best.o, def.dmg * 0.5, ex, ey);
    if (best.o.driver === 'traffic') best.o.cruise = 1.05; // panic driver floors it
    if (best.o.type === 'police') S.crimes.push({ kind: 'shootCop', x: p.x, y: p.y });
  }
}

export function hurtHostile(hst, dmg) {
  hst.hp -= dmg;
  hst.alerted = true;
  for (let i = 0; i < 4; i++) {
    S.parts.push({
      x: hst.x, y: hst.y - 4, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80,
      life: 0.3, max: 0.3, color: '#c23b2e', size: 3, grav: 0,
    });
  }
  if (hst.hp <= 0 && hst.state !== 'down') {
    hst.state = 'down';
    hst.downFor = 999;
    S.stats.hostilesDown = (S.stats.hostilesDown || 0) + 1;
  }
}

function shove() {
  const p = S.player;
  const tx = p.x + Math.cos(p.aim) * 26;
  const ty = p.y + Math.sin(p.aim) * 26;
  for (const ped of S.peds) {
    if (ped.state !== 'down' && Math.hypot(ped.x - tx, ped.y - ty) < 24) {
      ped.state = 'down';
      ped.downFor = 4;
      S.crimes.push({ kind: 'shove', x: p.x, y: p.y });
    }
  }
}

// Damage to the player: armour soaks most of it. Death is main's business.
export function damagePlayer(amount, fromX, fromY) {
  const p = S.player;
  if (p.dead || S.mode !== 'play') return;
  const soaked = Math.min(p.armor, amount * 0.65);
  p.armor -= soaked;
  p.hp -= amount - soaked;
  p.hurtCd = 0;
  S.hurtFlash = 1;
  S.shake = Math.max(S.shake, 2.5);
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
  }
}
