// render.js — draws the whole world each frame: sea, beach, roads, blocks,
// oblique-projected buildings with lit windows and shop signs, palms and
// lamps, then cars, pedestrians and the player sorted by depth, then
// tracers, particles and floating text, all under a warm late-sun grade.

import {
  PITCH, ROAD, COLS, ROWS, WORLD_W, WORLD_H, COAST_Y, BEACH_H, PALETTE,
} from './config.js';
import { S } from './state.js';
import { PIER } from './world.js';
import { hash2, clamp } from './random.js';

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function inView(x, y, m) {
  return x > S.cam.x - m && y > S.cam.y - m && x < S.cam.x + S.view.w + m && y < S.cam.y + S.view.h + m;
}

export function drawScene(ctx, w, h) {
  const cam = S.cam;
  ctx.save();
  if (S.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
  }
  ctx.translate(-cam.x, -cam.y);
  drawGround(ctx);
  drawSkids(ctx);
  drawStashes(ctx);
  drawMarker(ctx);
  drawEntities(ctx);
  drawTracers(ctx);
  drawParticles(ctx);
  drawFloats(ctx);
  ctx.restore();
  drawGrade(ctx, w, h);
}

function drawGround(ctx) {
  const world = S.world;
  // Sea, then sand, then the city's base slab.
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(S.cam.x - 40, COAST_Y + BEACH_H - 40, S.view.w + 80, WORLD_H - COAST_Y - BEACH_H + 80);
  ctx.fillStyle = PALETTE.water;
  const top = Math.max(COAST_Y + BEACH_H, S.cam.y - 40);
  ctx.fillRect(S.cam.x - 40, top, S.view.w + 80, S.view.h + 80);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 26; i++) {
    const x = hash2(i, 7) * WORLD_W;
    const y = COAST_Y + BEACH_H + 24 + hash2(i, 13) * 240 + Math.sin(S.time * 0.7 + i) * 4;
    if (!inView(x, y, 90)) continue;
    ctx.moveTo(x, y);
    ctx.lineTo(x + 34 + hash2(i, 3) * 30, y);
  }
  ctx.stroke();
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(-40, COAST_Y, WORLD_W + 80, BEACH_H + 6);
  ctx.fillStyle = PALETTE.concrete;
  ctx.fillRect(-40, -40, WORLD_W + 80, COAST_Y + 46);

  // Block surfaces (parks, lots, plazas), each with its sidewalk rim.
  for (const g of world.grounds) {
    if (!inView(g.x + g.w / 2, g.y + g.h / 2, 320)) continue;
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(g.x - 10, g.y - 10, g.w + 20, g.h + 20);
    ctx.fillStyle = g.kind === 'park' ? PALETTE.grass : g.kind === 'lot' ? '#565b63' : '#bfb094';
    ctx.fillRect(g.x, g.y, g.w, g.h);
    if (g.kind === 'park') {
      ctx.fillStyle = PALETTE.grassDark;
      ctx.fillRect(g.x + 16, g.y + 16, g.w - 32, 10);
      ctx.fillRect(g.x + 16, g.y + 16, 10, g.h - 32);
    }
    if (g.kind === 'lot') {
      ctx.strokeStyle = 'rgba(240,240,230,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          ctx.strokeRect(g.x + 8 + c * 62, g.y + 14 + r * 84, 52, 66);
        }
      }
      ctx.stroke();
    }
  }

  drawRoads(ctx);

  // The ferry pier: planks over the water.
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(PIER.x, PIER.y, PIER.w, PIER.h);
  ctx.strokeStyle = 'rgba(60,40,20,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let y = PIER.y + 14; y < PIER.y + PIER.h; y += 18) {
    ctx.moveTo(PIER.x, y);
    ctx.lineTo(PIER.x + PIER.w, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#6d5439';
  ctx.fillRect(PIER.x - 6, PIER.y, 8, PIER.h);
  ctx.fillRect(PIER.x + PIER.w - 2, PIER.y, 8, PIER.h);

  // Building shadows first, then props behind buildings, then buildings.
  for (const b of world.buildings) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, 340)) continue;
    const e = b.hgt * 0.55;
    ctx.fillStyle = PALETTE.shadow;
    ctx.fillRect(b.x + 14 - e * 0.3, b.y + 16 - e, b.w, b.h);
  }
  for (const p of world.props) {
    if (p.kind === 'palm' && inView(p.x, p.y, 60)) drawPalm(ctx, p.x, p.y);
  }
  const sorted = world.buildings.slice().sort((a, b) => a.y - b.y);
  for (const b of sorted) {
    if (!inView(b.x + b.w / 2, b.y + b.h / 2, 340)) continue;
    drawBuilding(ctx, b);
  }
  for (const p of world.props) {
    if (!inView(p.x, p.y, 60)) continue;
    if (p.kind === 'lamp') drawLamp(ctx, p.x, p.y);
    if (p.kind === 'bench') {
      ctx.fillStyle = '#7d5a38';
      ctx.fillRect(p.x - 11, p.y - 4, 22, 8);
    }
  }
}

function drawRoads(ctx) {
  ctx.fillStyle = PALETTE.asphalt;
  for (let i = 0; i <= COLS; i++) ctx.fillRect(i * PITCH, 0, ROAD, COAST_Y);
  for (let j = 0; j <= ROWS; j++) ctx.fillRect(0, j * PITCH, WORLD_W, ROAD);
  ctx.fillStyle = PALETTE.asphaltEdge;
  for (let i = 0; i <= COLS; i++) {
    ctx.fillRect(i * PITCH, 0, 3, COAST_Y);
    ctx.fillRect(i * PITCH + ROAD - 3, 0, 3, COAST_Y);
  }
  // Dashed centre lines.
  ctx.fillStyle = PALETTE.laneMark;
  for (let i = 0; i <= COLS; i++) {
    for (let y = 8; y < COAST_Y - 20; y += 34) {
      if (y % PITCH < ROAD - 24 && y % PITCH > 4) continue; // keep crossings clear
      ctx.fillRect(i * PITCH + ROAD / 2 - 2, y, 4, 18);
    }
  }
  for (let j = 0; j <= ROWS; j++) {
    for (let x = 8; x < WORLD_W - 20; x += 34) {
      if (x % PITCH < ROAD - 24 && x % PITCH > 4) continue;
      ctx.fillRect(x, j * PITCH + ROAD / 2 - 2, 18, 4);
    }
  }
  // Crosswalks at every intersection.
  ctx.fillStyle = 'rgba(240,240,235,0.75)';
  for (let i = 0; i <= COLS; i++) {
    for (let j = 0; j <= ROWS; j++) {
      const x = i * PITCH;
      const y = j * PITCH;
      for (let s = 0; s < 5; s++) {
        ctx.fillRect(x + 8 + s * 22, y + 3, 12, 5);
        ctx.fillRect(x + 8 + s * 22, y + ROAD - 8, 12, 5);
        ctx.fillRect(x + 3, y + 8 + s * 22, 5, 12);
        ctx.fillRect(x + ROAD - 8, y + 8 + s * 22, 5, 12);
      }
    }
  }
}

function drawBuilding(ctx, b) {
  const e = b.hgt * 0.55; // oblique lift of the roof
  const sx = -e * 0.3;
  const sy = -e;
  // South face (the tall front, with the windows and any sign).
  ctx.fillStyle = shade(b.wall, 0.86);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + b.h);
  ctx.lineTo(b.x + b.w, b.y + b.h);
  ctx.lineTo(b.x + b.w + sx, b.y + b.h + sy);
  ctx.lineTo(b.x + sx, b.y + b.h + sy);
  ctx.closePath();
  ctx.fill();
  // East face.
  ctx.fillStyle = shade(b.wall, 0.7);
  ctx.beginPath();
  ctx.moveTo(b.x + b.w, b.y);
  ctx.lineTo(b.x + b.w, b.y + b.h);
  ctx.lineTo(b.x + b.w + sx, b.y + b.h + sy);
  ctx.lineTo(b.x + b.w + sx, b.y + sy);
  ctx.closePath();
  ctx.fill();
  // Windows on the front face.
  const rows = Math.max(1, Math.floor(e / 15));
  const cols = Math.max(2, Math.floor(b.w / 17));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = hash2(b.seed + c * 7, r * 13) > 0.42;
      ctx.fillStyle = lit ? 'rgba(255,214,130,0.9)' : 'rgba(38,52,68,0.55)';
      const wx = b.x + 7 + c * ((b.w - 12) / cols) + (sx * r) / rows;
      const wy = b.y + b.h - 10 - (e * r) / rows;
      ctx.fillRect(wx, wy, 6, 7);
    }
  }
  // Roof with parapet and rooftop clutter.
  ctx.fillStyle = b.roof;
  ctx.fillRect(b.x + sx, b.y + sy, b.w, b.h);
  ctx.strokeStyle = shade(b.roof, 0.72);
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x + sx + 3, b.y + sy + 3, b.w - 6, b.h - 6);
  ctx.fillStyle = shade(b.roof, 0.8);
  const ac = hash2(b.seed, 31);
  if (ac > 0.3) ctx.fillRect(b.x + sx + b.w * ac * 0.6, b.y + sy + 10, 20, 14);
  if (b.hgt > 95) {
    ctx.fillRect(b.x + sx + b.w * 0.62, b.y + sy + b.h * 0.4, 16, 16);
    ctx.fillStyle = shade(b.roof, 0.6);
    ctx.fillRect(b.x + sx + b.w * 0.62 + 6, b.y + sy + b.h * 0.4 - 8, 4, 10);
  }
  // Sign band across the front.
  if (b.name) {
    const bandY = b.y + b.h - 4 + sy;
    ctx.fillStyle = '#26303c';
    ctx.fillRect(b.x + sx + 4, bandY, b.w - 8, 15);
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.name, b.x + sx + b.w / 2, bandY + 11, b.w - 12);
  }
}

function drawPalm(ctx, x, y) {
  ctx.strokeStyle = '#7d5a38';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 3, y - 12, x + 7, y - 22);
  ctx.stroke();
  ctx.strokeStyle = '#3f8f4f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.moveTo(x + 7, y - 22);
    ctx.quadraticCurveTo(
      x + 7 + Math.cos(a) * 13, y - 22 + Math.sin(a) * 6 - 5,
      x + 7 + Math.cos(a) * 21, y - 22 + Math.sin(a) * 10 + 5,
    );
  }
  ctx.stroke();
}

function drawLamp(ctx, x, y) {
  ctx.fillStyle = 'rgba(46,32,20,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 3, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3a3f47';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 20);
  ctx.stroke();
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.arc(x, y - 22, 3.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkids(ctx) {
  ctx.lineCap = 'round';
  for (const s of S.skids) {
    ctx.strokeStyle = `rgba(24,24,28,${0.35 * Math.max(0, s.life)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
}

function drawStashes(ctx) {
  for (const st of S.world.stashes) {
    if (st.taken || !inView(st.x, st.y, 60)) continue;
    const pulse = 0.6 + Math.sin(S.time * 4 + st.id) * 0.25;
    ctx.fillStyle = `rgba(255,197,61,${0.3 * pulse})`;
    ctx.beginPath();
    ctx.arc(st.x, st.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6d4c2f';
    ctx.fillRect(st.x - 8, st.y - 5, 16, 11);
    ctx.fillStyle = '#ffc53d';
    ctx.fillRect(st.x - 8, st.y - 1, 16, 3);
  }
}

function drawMarker(ctx) {
  const m = S.marker;
  if (!m) return;
  const bob = Math.sin(S.time * 3.2) * 6;
  const grad = ctx.createLinearGradient(0, m.y - 190, 0, m.y);
  grad.addColorStop(0, 'rgba(255,201,61,0)');
  grad.addColorStop(1, 'rgba(255,201,61,0.4)');
  ctx.fillStyle = grad;
  ctx.fillRect(m.x - 13, m.y - 190, 26, 190);
  ctx.strokeStyle = m.color || '#ffc53d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(m.x, m.y, 20 + Math.sin(S.time * 3.2) * 3, 9, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = m.color || '#ffc53d';
  ctx.beginPath();
  ctx.moveTo(m.x - 11, m.y - 52 + bob);
  ctx.lineTo(m.x + 11, m.y - 52 + bob);
  ctx.lineTo(m.x, m.y - 36 + bob);
  ctx.closePath();
  ctx.fill();
  if (m.label) {
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(20,20,25,0.8)';
    ctx.lineWidth = 4;
    ctx.strokeText(m.label, m.x, m.y - 62 + bob);
    ctx.fillText(m.label, m.x, m.y - 62 + bob);
  }
}

// Cars, pedestrians, hostiles and the player, sorted by y so nearer things
// overlap farther ones correctly.
function drawEntities(ctx) {
  const items = [];
  for (const c of S.cars) items.push({ y: c.y, kind: 'car', o: c });
  for (const p of S.peds) items.push({ y: p.y, kind: 'ped', o: p });
  for (const hst of S.hostiles) items.push({ y: hst.y, kind: 'hostile', o: hst });
  if (!S.player.car && !S.player.dead) items.push({ y: S.player.y, kind: 'player', o: S.player });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    if (!inView(it.o.x, it.o.y, 130)) continue;
    if (it.kind === 'car') drawCar(ctx, it.o);
    else if (it.kind === 'ped') drawPed(ctx, it.o, false);
    else if (it.kind === 'hostile') drawPed(ctx, it.o, true);
    else drawPlayer(ctx);
  }
  // The police helicopter's shadow at five stars.
  if (S.wanted.stars >= 5 && S.mode === 'play') {
    const hx = S.player.x + Math.cos(S.time * 0.5) * 130;
    const hy = S.player.y + Math.sin(S.time * 0.5) * 95;
    ctx.fillStyle = 'rgba(20,24,30,0.3)';
    ctx.beginPath();
    ctx.ellipse(hx, hy, 44, 15, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(hx - 4, hy - 30, 8, 60);
  }
}

export function drawCar(ctx, car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.fillStyle = 'rgba(46,32,20,0.3)';
  ctx.beginPath();
  ctx.ellipse(4, 6, car.def.len * 0.52, car.def.wid * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(car.angle);
  const L = car.def.len;
  const W = car.def.wid;
  // Wheels.
  ctx.fillStyle = '#15161a';
  const wy = W / 2 - 2;
  ctx.fillRect(-L * 0.32, -wy - 2, 11, 5);
  ctx.fillRect(-L * 0.32, wy - 3, 11, 5);
  ctx.save();
  ctx.translate(L * 0.3, -wy - 2);
  ctx.rotate(car.steerVis || 0);
  ctx.fillRect(-5, 0, 11, 5);
  ctx.restore();
  ctx.save();
  ctx.translate(L * 0.3, wy - 3);
  ctx.rotate(car.steerVis || 0);
  ctx.fillRect(-5, 0, 11, 5);
  ctx.restore();
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,26,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (car.type === 'truck') {
    ctx.fillStyle = shade(car.color, 0.92);
    ctx.fillRect(-L / 2, -W / 2 + 2, L * 0.58, W - 4);
    ctx.fillStyle = '#2e3d4d';
    ctx.fillRect(L * 0.14, -W / 2 + 3, L * 0.12, W - 6);
  } else {
    // Cabin, windshield and rear glass.
    ctx.fillStyle = shade(car.color, 1.14);
    roundRect(ctx, -L * 0.16, -W * 0.38, L * 0.4, W * 0.76, 4);
    ctx.fill();
    ctx.fillStyle = '#22384c';
    ctx.fillRect(L * 0.16, -W * 0.36, L * 0.09, W * 0.72);
    ctx.fillRect(-L * 0.2, -W * 0.36, L * 0.06, W * 0.72);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-L * 0.05, -W * 0.2, L * 0.16, W * 0.4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', L * 0.03, 2.5);
  }
  if (car.type === 'police') {
    ctx.fillStyle = '#20242c';
    ctx.fillRect(-L * 0.12, -W / 2, L * 0.3, W);
    const flash = Math.sin(S.time * 11) > 0;
    ctx.fillStyle = flash ? '#ff4040' : '#7a1616';
    ctx.fillRect(-4, -W * 0.3, 8, W * 0.28);
    ctx.fillStyle = flash ? '#2a4bff' : '#4090ff';
    ctx.fillRect(-4, W * 0.04, 8, W * 0.28);
  }
  // Lights.
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(L / 2 - 3, -W * 0.34, 3, 5);
  ctx.fillRect(L / 2 - 3, W * 0.34 - 5, 3, 5);
  ctx.fillStyle = '#d23b2e';
  ctx.fillRect(-L / 2, -W * 0.34, 3, 5);
  ctx.fillRect(-L / 2, W * 0.34 - 5, 3, 5);
  // Damage smoke scorch.
  if (car.health < 40) {
    ctx.fillStyle = 'rgba(30,30,34,0.5)';
    ctx.beginPath();
    ctx.arc(L * 0.32, 0, 7 + Math.sin(S.time * 9 + car.x) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, p, hostile) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(46,32,20,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (p.state === 'down') {
    ctx.rotate(1.35);
    ctx.fillStyle = p.shirt;
    roundRect(ctx, -9, -5, 18, 10, 5);
    ctx.fill();
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(12, 0, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const moving = p.state === 'walk' || p.state === 'flee' || hostile;
  const bob = moving ? Math.sin(p.walkPhase) * 1.6 : 0;
  // Legs.
  ctx.strokeStyle = '#33383f';
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-3 + bob, 9);
  ctx.moveTo(0, 2);
  ctx.lineTo(3 - bob, 9);
  ctx.stroke();
  // Body and head.
  ctx.fillStyle = hostile ? '#a3271e' : p.shirt;
  ctx.beginPath();
  ctx.arc(0, -2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(0, -10.5, 4.4, 0, Math.PI * 2);
  ctx.fill();
  if (hostile) {
    ctx.strokeStyle = '#1c1e24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(3, -3);
    ctx.lineTo(3 + Math.cos(p.aim) * 13, -3 + Math.sin(p.aim) * 13);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(ctx) {
  const p = S.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(46,32,20,0.32)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 9, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = p.walkPhase ? Math.sin(p.walkPhase) * 1.8 : 0;
  ctx.strokeStyle = '#2c3138';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(-3 + bob, 10);
  ctx.moveTo(0, 2);
  ctx.lineTo(3 - bob, 10);
  ctx.stroke();
  // Teal jacket — Dario is always readable on screen.
  ctx.fillStyle = '#0f7d8c';
  ctx.beginPath();
  ctx.arc(0, -2, 7.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0a4b55';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#e8b98a';
  ctx.beginPath();
  ctx.arc(0, -11, 4.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#20242c';
  ctx.beginPath();
  ctx.arc(0, -13.4, 4.8, Math.PI, Math.PI * 2);
  ctx.fill();
  // Gun toward the aim.
  if (p.weapon !== 'fist') {
    ctx.strokeStyle = '#14161a';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.aim) * 4, -3 + Math.sin(p.aim) * 4);
    ctx.lineTo(Math.cos(p.aim) * 15, -3 + Math.sin(p.aim) * 15);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTracers(ctx) {
  for (const t of S.tracers) {
    ctx.strokeStyle = `rgba(255,230,150,${Math.max(0, t.life * 6)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
}

function drawParticles(ctx) {
  for (const pt of S.parts) {
    const a = clamp(pt.life / pt.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloats(ctx) {
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const f of S.floats) {
    const rise = (1.1 - f.life) * 34;
    ctx.globalAlpha = clamp(f.life, 0, 1);
    ctx.strokeStyle = 'rgba(20,20,25,0.85)';
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, f.x, f.y - rise);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - rise);
  }
  ctx.globalAlpha = 1;
}

// Warm late-afternoon grade and a soft vignette over everything.
function drawGrade(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255,166,66,0.07)');
  grad.addColorStop(0.55, 'rgba(255,120,60,0.02)');
  grad.addColorStop(1, 'rgba(24,32,72,0.10)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
  vig.addColorStop(0, 'rgba(20,16,30,0)');
  vig.addColorStop(1, 'rgba(20,16,30,0.26)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
