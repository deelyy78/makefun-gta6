// world.js — Port Solano itself: a seeded art-deco city on a grid of blocks
// and roads, with a beach and the sea along the south edge. Generates the
// buildings, parks, parking lots, props, landmarks and hidden cash stashes,
// and answers the collision and road questions every other system asks.

import {
  PITCH, ROAD, BLOCK, COLS, ROWS, WORLD_W, WORLD_H, COAST_Y, BEACH_H,
  BUILDING_SKINS,
} from './config.js';
import { createRng, range, intRange, pick, chance, clamp } from './random.js';

export const CITY_SEED = 20261117;

const SHOP_SIGNS = [
  'Café Brisa', 'Solano Surf Co.', 'Marlin Hotel', 'Palma Records',
  'Deli Ocho', 'Hotel Vista', 'Neon Wash', 'Taco Faro', 'Banco Sol',
  'Farmacia Luz', 'Gull Wings', 'Vista Cinema', 'Bar El Faro', 'Panadería Sol',
];

export function intersectionX(i) {
  return i * PITCH + ROAD / 2;
}

export function intersectionY(j) {
  return j * PITCH + ROAD / 2;
}

export function isRoad(x, y) {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= COAST_Y) return false;
  return x % PITCH < ROAD || y % PITCH < ROAD;
}

export function isWater(x, y) {
  return y > COAST_Y + BEACH_H && !onPier(x, y);
}

export function onPier(x, y) {
  const p = PIER;
  return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
}

// The ferry pier: a drivable, walkable strip of planks into the sea.
export const PIER = { x: 2900, y: COAST_Y - 6, w: 104, h: 268 };

function blockOrigin(i, j) {
  return { x: i * PITCH + ROAD, y: j * PITCH + ROAD };
}

export function buildCity() {
  const rng = createRng(CITY_SEED);
  const world = {
    buildings: [],
    grounds: [], // {x,y,w,h,kind} block surfaces: block | park | lot | plaza
    props: [], // {x,y,kind} palm | lamp | bench
    solids: [], // small circle obstacles {x,y,r} (palms, lamps)
    lotSpots: [], // parking spots {x,y,angle}
    stashes: [],
    landmarks: {},
    signs: [],
  };

  const landmarkBlocks = {
    '0,5': 'depot',
    '4,1': 'precinct',
    '6,4': 'hospital',
    '2,2': 'shop',
    '6,0': 'carlot',
  };
  const parkBlocks = new Set(['1,1', '5,2', '3,4', '7,5', '5,0', '1,3']);
  const lotBlocks = new Set(['3,1', '7,2', '0,2', '5,5', '2,4']);

  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      const { x, y } = blockOrigin(i, j);
      const key = i + ',' + j;
      const landmark = landmarkBlocks[key];
      if (parkBlocks.has(key) && !landmark) {
        world.grounds.push({ x, y, w: BLOCK, h: BLOCK, kind: 'park' });
        for (let n = 0; n < 7; n++) {
          const px = x + range(rng, 24, BLOCK - 24);
          const py = y + range(rng, 24, BLOCK - 24);
          world.props.push({ x: px, y: py, kind: 'palm' });
          world.solids.push({ x: px, y: py, r: 6 });
        }
        for (let n = 0; n < 3; n++) {
          world.props.push({ x: x + range(rng, 30, BLOCK - 30), y: y + range(rng, 30, BLOCK - 30), kind: 'bench' });
        }
        continue;
      }
      if (lotBlocks.has(key) && !landmark) {
        world.grounds.push({ x, y, w: BLOCK, h: BLOCK, kind: 'lot' });
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 4; c++) {
            if (chance(rng, 0.72)) {
              world.lotSpots.push({ x: x + 34 + c * 62, y: y + 44 + r * 84, angle: Math.PI / 2 });
            }
          }
        }
        continue;
      }
      world.grounds.push({ x, y, w: BLOCK, h: BLOCK, kind: landmark ? 'plaza' : 'block' });
      // Four lots per block; landmark blocks keep one feature building.
      const lots = landmark
        ? [{ lx: x + 52, ly: y + 46, lw: 160, lh: 150 }]
        : [
            { lx: x + 12, ly: y + 12, lw: 112, lh: 112 },
            { lx: x + 140, ly: y + 12, lw: 112, lh: 112 },
            { lx: x + 12, ly: y + 140, lw: 112, lh: 112 },
            { lx: x + 140, ly: y + 140, lw: 112, lh: 112 },
          ];
      for (const lot of lots) {
        const inset = landmark ? 0 : range(rng, 4, 14);
        const bx = lot.lx + inset;
        const by = lot.ly + inset;
        const bw = lot.lw - inset * 2;
        const bh = lot.lh - inset * 2;
        // Downtown (the middle blocks) grows tall; the edges stay low.
        const dx = Math.abs(i - 3.5) / 3.5;
        const dy = Math.abs(j - 2.5) / 2.5;
        const downtown = Math.max(0, 1 - (dx + dy) / 2);
        const hgt = landmark ? 34 : Math.round(range(rng, 20, 44) + downtown * range(rng, 30, 95));
        const skin = pick(rng, BUILDING_SKINS);
        const building = {
          x: bx, y: by, w: bw, h: bh, hgt,
          wall: skin.wall, roof: skin.roof,
          seed: intRange(rng, 1, 99999),
          name: null,
        };
        if (landmark) building.name = {
          depot: 'MERCER COURIERS', precinct: 'PSPD — PRECINCT 9',
          hospital: 'SOLANO GENERAL', shop: 'AMMU-MART', carlot: 'AUTO FARO',
        }[landmark];
        else if (chance(rng, 0.3)) building.name = pick(rng, SHOP_SIGNS);
        world.buildings.push(building);
      }
      if (landmark) {
        world.landmarks[landmark] = { x: x + BLOCK / 2, y: y + BLOCK / 2, block: key };
      }
    }
  }

  // The ferry dock at the end of the pier, and the street-race start line.
  world.landmarks.dock = { x: PIER.x + PIER.w / 2, y: PIER.y + PIER.h - 26 };
  world.landmarks.race = { x: intersectionX(0) + 30, y: intersectionY(ROWS) };
  world.landmarks.shop = world.landmarks.shop || { x: 0, y: 0 };
  world.spawn = { x: intersectionX(0) + 40, y: intersectionY(ROWS) - 10 };

  // Palms along the beach and lamps along every road.
  for (let x = 46; x < WORLD_W - 30; x += 92) {
    if (Math.abs(x - (PIER.x + PIER.w / 2)) < 90) continue;
    world.props.push({ x: x + range(rng, -8, 8), y: COAST_Y + 34 + range(rng, 0, 26), kind: 'palm' });
    world.solids.push({ x, y: COAST_Y + 34, r: 6 });
  }
  for (let i = 0; i <= COLS; i++) {
    for (let y = 66; y < COAST_Y - 40; y += 172) {
      world.props.push({ x: i * PITCH + 12, y, kind: 'lamp' });
      world.props.push({ x: i * PITCH + ROAD - 12, y: y + 86, kind: 'lamp' });
    }
  }

  // Twenty cash stashes: on sidewalks, in parks, along the beach.
  let stashId = 0;
  while (world.stashes.length < 20) {
    const i = intRange(rng, 0, COLS - 1);
    const j = intRange(rng, 0, ROWS - 1);
    const { x, y } = blockOrigin(i, j);
    const edge = intRange(rng, 0, 3);
    const sx = edge === 0 ? x + 8 : edge === 1 ? x + BLOCK - 8 : x + range(rng, 10, BLOCK - 10);
    const sy = edge === 2 ? y + 8 : edge === 3 ? y + BLOCK - 8 : y + range(rng, 10, BLOCK - 10);
    if (circleHitsBuilding(world, sx, sy, 14)) continue;
    world.stashes.push({ id: stashId++, x: sx, y: sy, taken: false });
  }
  return world;
}

export function circleHitsBuilding(world, x, y, r) {
  for (const b of world.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

// Push a circle out of every building, solid prop, the sea and the world
// edge. Returns the corrected position and whether anything was hit (and how
// hard, for crash sounds: the caller compares speeds itself).
export function collideCircle(world, x, y, r) {
  let hit = false;
  x = clamp(x, r, WORLD_W - r);
  if (y < r) y = r;
  const waterline = COAST_Y + BEACH_H;
  if (y > waterline - r && !onPier(x, y)) {
    y = waterline - r;
    hit = true;
  }
  if (y > WORLD_H - r) y = WORLD_H - r;
  for (const b of world.buildings) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = nx + (dx / d) * r;
      y = ny + (dy / d) * r;
    } else {
      // Centre inside the box: leave by the shortest side.
      const left = x - b.x;
      const right = b.x + b.w - x;
      const top = y - b.y;
      const bottom = b.y + b.h - y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) x = b.x - r;
      else if (m === right) x = b.x + b.w + r;
      else if (m === top) y = b.y - r;
      else y = b.y + b.h + r;
    }
  }
  for (const s of world.solids) {
    const dx = x - s.x;
    const dy = y - s.y;
    const rr = r + s.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      x = s.x + (dx / d) * rr;
      y = s.y + (dy / d) * rr;
      hit = true;
    }
  }
  return { x, y, hit };
}

// A random point on a road, for spawning traffic and police out of sight.
export function randomRoadPoint(rng, nearX, nearY, minD, maxD) {
  for (let tries = 0; tries < 24; tries++) {
    const vertical = rng() < 0.5;
    const i = intRange(rng, 0, COLS);
    const j = intRange(rng, 0, ROWS);
    const x = vertical ? intersectionX(i) + range(rng, -26, 26) : range(rng, 60, WORLD_W - 60);
    const y = vertical ? range(rng, 60, COAST_Y - 60) : intersectionY(j) + range(rng, -26, 26);
    const d = Math.hypot(x - nearX, y - nearY);
    if (d >= minD && d <= maxD) return { x, y };
  }
  return { x: intersectionX(0), y: intersectionY(0) };
}
