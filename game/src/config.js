// config.js — the fixed numbers and names of Solano Heat: world geometry,
// palette, vehicle and weapon tables. Everything else reads from here so the
// city stays one consistent size everywhere.

export const GAME_TITLE = 'SOLANO HEAT';
export const CITY_NAME = 'Port Solano';
export const HERO_NAME = 'Dario Mercer';
export const SAVE_KEY = 'solano-heat-save-v1';

// The city is a grid: square blocks of BLOCK px separated by roads of ROAD px,
// PITCH apart, COLS by ROWS blocks, with a beach and the sea along the south.
export const PITCH = 384;
export const ROAD = 120;
export const BLOCK = PITCH - ROAD;
export const COLS = 8;
export const ROWS = 6;
export const WORLD_W = COLS * PITCH + ROAD;
export const COAST_Y = ROWS * PITCH + ROAD; // south edge of the coast road
export const BEACH_H = 110; // sand between the coast road and the water
export const WORLD_H = COAST_Y + BEACH_H + 330; // the rest is open sea

// Sun-soaked Port Solano palette: warm concrete, deco pastels, teal sea.
export const PALETTE = {
  grass: '#79a24e',
  grassDark: '#6b9345',
  concrete: '#c9bb9c',
  sidewalk: '#ddd2b2',
  asphalt: '#3d4149',
  asphaltEdge: '#2f3238',
  laneMark: '#e9cd6d',
  sand: '#ecd28f',
  water: '#1f7d8c',
  waterDeep: '#155e6e',
  shadow: 'rgba(46, 32, 20, 0.28)',
  ink: '#20242c',
  paper: '#f7ecd2',
  gold: '#ffc53d',
  coral: '#ff6b57',
  teal: '#2ec4b6',
};

// Building skins by district flavour: deco pastels with darker roofs.
export const BUILDING_SKINS = [
  { wall: '#f2dfba', roof: '#c96f4a' },
  { wall: '#f6c9a0', roof: '#a8573f' },
  { wall: '#bfe3dd', roof: '#4e7d78' },
  { wall: '#f9e7e7', roof: '#b0616d' },
  { wall: '#dfe8f5', roof: '#5d7290' },
  { wall: '#f3e2c7', roof: '#8a6d4b' },
  { wall: '#e8d8f0', roof: '#7a5f8f' },
  { wall: '#fdf3d8', roof: '#c2923d' },
];

// Vehicle table: footprint, pace and the colours each type rolls in.
export const CAR_TYPES = {
  sedan: { len: 46, wid: 22, top: 265, accel: 190, grip: 3.4, colors: ['#c94f42', '#3f6fb5', '#e8e3d5', '#5d8a66', '#7a4f9d', '#d9a441'] },
  taxi: { len: 46, wid: 22, top: 255, accel: 185, grip: 3.4, colors: ['#f5b921'] },
  sports: { len: 48, wid: 23, top: 360, accel: 300, grip: 4.1, colors: ['#e33f5f', '#ffb400', '#19b3a6', '#ece7df'] },
  van: { len: 56, wid: 25, top: 225, accel: 150, grip: 2.9, colors: ['#cfd4d9', '#8fa3b8', '#b5a642'] },
  truck: { len: 74, wid: 27, top: 205, accel: 120, grip: 2.5, colors: ['#7d8a99', '#a34d3f', '#4f6152'] },
  police: { len: 48, wid: 23, top: 335, accel: 285, grip: 4.0, colors: ['#f2f2f0'] },
};

export const WEAPONS = {
  fist: { name: 'Fists', rate: 0.34, range: 30, dmg: 22, spread: 0 },
  pistol: { name: 'Pistol', rate: 0.26, range: 560, dmg: 34, spread: 0.012 },
  smg: { name: 'Micro SMG', rate: 0.09, range: 520, dmg: 22, spread: 0.045 },
};

export const CONTROLS_TEXT = [
  'W A S D / arrows — move & drive',
  'Mouse — aim · Left click — shoot / punch',
  'E — enter or steal a car · talk · use',
  'Shift — sprint / handbrake · Space — brake',
  'F — shove · 1 / 2 / 3 — fist, pistol, SMG',
  'P or Esc — pause · M — mute · Enter — advance talk',
];
