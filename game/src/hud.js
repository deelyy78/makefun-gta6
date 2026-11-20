// hud.js — everything drawn over the world: cash and respect, wanted stars,
// health and armour, the bust meter, the objective panel and timer, toasts
// and banners, the dialogue box, the E prompt, and the Port Solano minimap.

import { WORLD_W, WORLD_H, COAST_Y, BEACH_H, WEAPONS, PITCH, COLS, ROWS } from './config.js';
import { S } from './state.js';
import { roundRect } from './render.js';
import { clamp } from './random.js';

function star(ctx, x, y, r, filled, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? '#ffc53d' : 'rgba(230,230,225,0.35)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,26,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(18,22,30,0.62)';
  roundRect(ctx, x, y, w, h, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawHUD(ctx, w, h, dt) {
  S.hurtFlash = Math.max(0, S.hurtFlash - dt * 1.6);
  if (S.mode !== 'play' && S.mode !== 'pause') return;
  const p = S.player;

  // Cash and respect, top-left.
  panel(ctx, 14, 14, 208, 64);
  ctx.fillStyle = '#ffc53d';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('$' + S.cash.toLocaleString('en-US'), 26, 44);
  const level = Math.floor(S.respect / 50) + 1;
  ctx.fillStyle = '#e8e2d2';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('RESPECT LV ' + level, 26, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(112, 56, 98, 7);
  ctx.fillStyle = '#2ec4b6';
  ctx.fillRect(112, 56, 98 * ((S.respect % 50) / 50), 7);

  // Wanted stars, top-right. They flash while the PSPD is searching.
  const flash = S.searching ? 0.45 + Math.sin(S.time * 6) * 0.3 : 1;
  for (let i = 0; i < 5; i++) {
    star(ctx, w - 34 - i * 34, 38, 13, i < S.wanted.stars, i < S.wanted.stars ? flash : 1);
  }
  if (S.searching) {
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('SEARCHING…', w - 22, 66);
  }

  // Objective panel, top-centre, with the mission timer when one runs.
  if (S.objective) {
    const tw = Math.min(560, w - 480);
    if (tw > 240) {
      panel(ctx, (w - tw) / 2, 14, tw, S.mission && S.mission.timer != null ? 62 : 44);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13.5px system-ui, sans-serif';
      ctx.textAlign = 'center';
      let text = S.objective;
      if (S.marker) {
        const d = Math.hypot(p.x - S.marker.x, p.y - S.marker.y);
        text += '  ·  ' + Math.round(d / 10) + 'm';
      }
      ctx.fillText(text, w / 2, 40, tw - 20);
      if (S.mission && S.mission.timer != null) {
        const t = Math.max(0, S.mission.timer);
        const frac = clamp(t / 150, 0, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect((w - tw) / 2 + 14, 50, tw - 28, 7);
        ctx.fillStyle = t < 20 ? '#ff5040' : '#ffc53d';
        ctx.fillRect((w - tw) / 2 + 14, 50, (tw - 28) * frac, 7);
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'), w / 2, 72);
      }
    }
  }

  // Health, armour and weapon, bottom-left.
  panel(ctx, 14, h - 84, 232, 70);
  bar(ctx, 26, h - 66, 150, 13, p.hp / 100, p.hp > 30 ? '#58c24a' : '#e0402e', 'HP');
  bar(ctx, 26, h - 44, 150, 9, p.armor / 100, '#5b9bd5', 'ARM');
  ctx.fillStyle = '#e8e2d2';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(WEAPONS[p.weapon].name.toUpperCase(), 186, h - 54);
  if (p.car) {
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(Math.round(Math.abs(p.car.speed) * 0.36) + ' km/h', 186, h - 32);
  }

  // The bust meter, centre-bottom, only while it is filling.
  if (p.bust > 0.02) {
    const bw = 260;
    panel(ctx, (w - bw) / 2, h - 128, bw, 34);
    ctx.fillStyle = '#ff5040';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', w / 2, h - 116);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect((w - bw) / 2 + 12, h - 110, bw - 24, 8);
    ctx.fillStyle = '#ff5040';
    ctx.fillRect((w - bw) / 2 + 12, h - 110, (bw - 24) * p.bust, 8);
  }

  drawMinimap(ctx, w, h);
  drawToastBanner(ctx, w, h);
  if (S.dialogue) drawDialogue(ctx, w, h);
  if (S.useTarget) drawUsePrompt(ctx, w, h);

  // Damage vignette and the low-health pulse.
  if (S.hurtFlash > 0) {
    ctx.fillStyle = `rgba(200,30,20,${S.hurtFlash * 0.22})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (p.hp < 25 && S.mode === 'play') {
    ctx.fillStyle = `rgba(200,30,20,${0.08 + Math.sin(S.time * 5) * 0.04})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 3, y + h - 2.5);
}

function drawMinimap(ctx, w, h) {
  const mw = 198;
  const mh = 178;
  const x0 = w - mw - 14;
  const y0 = h - mh - 14;
  panel(ctx, x0 - 4, y0 - 4, mw + 8, mh + 8);
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, mw, mh);
  ctx.clip();
  ctx.fillStyle = '#274b63';
  ctx.fillRect(x0, y0, mw, mh);
  ctx.fillStyle = '#8a9a5b';
  ctx.fillRect(x0, y0, mw, COAST_Y * sy);
  ctx.fillStyle = '#d9c184';
  ctx.fillRect(x0, y0 + COAST_Y * sy, mw, BEACH_H * sy);
  // Roads.
  ctx.strokeStyle = 'rgba(235,235,230,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= COLS; i++) {
    ctx.moveTo(x0 + (i * PITCH + 60) * sx, y0);
    ctx.lineTo(x0 + (i * PITCH + 60) * sx, y0 + COAST_Y * sy);
  }
  for (let j = 0; j <= ROWS; j++) {
    ctx.moveTo(x0, y0 + (j * PITCH + 60) * sy);
    ctx.lineTo(x0 + mw, y0 + (j * PITCH + 60) * sy);
  }
  ctx.stroke();
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x0 + x * sx, y0 + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const st of S.world.stashes) if (!st.taken) dot(st.x, st.y, '#7dff8a', 1.8);
  for (const hst of S.hostiles) if (hst.state !== 'down') dot(hst.x, hst.y, '#ff5040', 2.6);
  for (const car of S.cars) {
    if (car.type === 'police') dot(car.x, car.y, Math.sin(S.time * 10) > 0 ? '#ff5040' : '#4d7dff', 2.8);
  }
  if (S.marker) {
    const pulse = 3 + Math.sin(S.time * 5) * 1.1;
    dot(S.marker.x, S.marker.y, S.marker.color || '#ffc53d', pulse);
  }
  // The player: a white arrow on the facing.
  const px = x0 + S.player.x * sx;
  const py = y0 + S.player.y * sy;
  const a = S.player.car ? S.player.car.angle : S.player.aim;
  ctx.translate(px, py);
  ctx.rotate(a);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.4);
  ctx.lineTo(-5, 4.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 9.5px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('PORT SOLANO', x0 + mw - 4, y0 + 13);
}

function drawToastBanner(ctx, w, h) {
  if (S.banner && S.time < S.banner.until) {
    const left = S.banner.until - S.time;
    const pop = clamp((2.6 - left) * 5, 0, 1);
    ctx.save();
    ctx.globalAlpha = clamp(left * 2, 0, 1);
    ctx.translate(w / 2, h * 0.3);
    ctx.scale(0.7 + pop * 0.3, 0.7 + pop * 0.3);
    ctx.font = '900 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(16,18,24,0.85)';
    ctx.lineWidth = 9;
    ctx.strokeText(S.banner.text, 0, 0);
    ctx.fillStyle = '#ffc53d';
    ctx.fillText(S.banner.text, 0, 0);
    if (S.banner.sub) {
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.lineWidth = 6;
      ctx.strokeText(S.banner.sub, 0, 30);
      ctx.fillStyle = '#fff';
      ctx.fillText(S.banner.sub, 0, 30);
    }
    ctx.restore();
  }
  if (S.toast && S.time < S.toast.until) {
    ctx.save();
    ctx.globalAlpha = clamp((S.toast.until - S.time) * 2, 0, 1);
    const tw = Math.min(520, w - 60);
    panel(ctx, (w - tw) / 2, 92, tw, S.toast.sub ? 52 : 36);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(S.toast.text, w / 2, 116, tw - 24);
    if (S.toast.sub) {
      ctx.fillStyle = '#cfd6dd';
      ctx.font = '12.5px system-ui, sans-serif';
      ctx.fillText(S.toast.sub, w / 2, 134, tw - 24);
    }
    ctx.restore();
  }
}

function drawDialogue(ctx, w, h) {
  const d = S.dialogue;
  const line = d.lines[d.i];
  const bw = Math.min(740, w - 70);
  const x0 = (w - bw) / 2;
  const y0 = h - 196;
  panel(ctx, x0, y0, bw, 76);
  ctx.fillStyle = '#ffc53d';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(line[0].toUpperCase(), x0 + 18, y0 + 24);
  ctx.fillStyle = '#fff';
  ctx.font = '15.5px system-ui, sans-serif';
  wrapText(ctx, line[1], x0 + 18, y0 + 47, bw - 36, 19);
  if (Math.sin(S.time * 4) > -0.2) {
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('E ▸', x0 + bw - 14, y0 + 66);
  }
}

function drawUsePrompt(ctx, w, h) {
  const t = S.useTarget;
  const near = Math.hypot(S.player.x - t.x, S.player.y - t.y) < t.r + 26;
  if (!near) return;
  const text = 'E — ' + t.label;
  ctx.font = 'bold 14px system-ui, sans-serif';
  const tw = ctx.measureText(text).width + 30;
  panel(ctx, (w - tw) / 2, h - 238, tw, 32);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h - 217);
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
