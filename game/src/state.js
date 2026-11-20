// state.js — the one shared game state object. Every system imports S and
// works on the same player, cars, pedestrians and mission data; resetState
// rebuilds it for a new game so no run can leak into the next.

export const S = {};

export function resetState() {
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, {
    mode: 'title', // title | play | pause | busted | wasted | won
    time: 0, // seconds since boot, drives ambient animation
    playTime: 0, // seconds in the current run
    cam: { x: 0, y: 0 },
    view: { w: 1280, h: 800 }, // canvas size in pixels, set on resize
    shake: 0,
    world: null, // filled by world.js buildCity()
    player: {
      x: 0, y: 0, angle: -Math.PI / 2, aim: 0, hp: 100, armor: 0,
      car: null, weapon: 'pistol', fireCd: 0, hurtCd: 0, bust: 0,
      walkPhase: 0, dead: false,
    },
    cash: 250,
    respect: 0,
    smgOwned: false,
    hurtFlash: 0, // red damage vignette strength, faded by the HUD
    nearestCop: Infinity,
    searching: false,
    useTarget: null, // {x, y, r, label, action} E-key prompt from missions
    cars: [],
    peds: [],
    hostiles: [],
    tracers: [], // brief bullet lines {x1,y1,x2,y2,life}
    parts: [], // particles {x,y,vx,vy,life,max,color,size,grav}
    skids: [], // fading skid marks {x1,y1,x2,y2,life}
    floats: [], // floating text {x,y,text,life,color}
    wanted: { heat: 0, stars: 0, lastCrime: -999, lastSeen: -999, px: 0, py: 0 },
    crimes: [], // witnessed crimes queued by other systems, drained by police.js
    lastShot: null, // {x, y, t} of the latest gunshot, for pedestrian panic
    mission: null, // active story mission runtime {def, step, timer, ...}
    missionDone: 0, // story missions completed (index of the next one)
    bestRace: 0, // best Coast Run time in seconds (0 = never finished)
    saveDirty: false, // set when progress changed and should be persisted
    taxi: null, // active taxi fare {ped, x, y, pay}
    race: null, // active street race {gate, next, timer, best}
    dialogue: null, // {speaker, lines, i, onDone}
    toast: null, // {text, sub, until}
    banner: null, // big centre text {text, sub, until}
    objective: '', // current objective line for the HUD
    marker: null, // world-space objective marker {x, y, color, label}
    muted: false,
    autoDrive: false, // screenshot scenes hold the player's speed
    stats: { shots: 0, hits: 0, carsStolen: 0, fares: 0, stashes: 0, busted: 0, wasted: 0 },
  });
  return S;
}

// Add a floating combat/pickup text that rises and fades.
export function addFloat(x, y, text, color) {
  S.floats.push({ x, y, text, life: 1.1, color: color || '#ffd94d' });
}

// Show a toast at the top of the HUD for a few seconds.
export function showToast(text, sub, seconds) {
  S.toast = { text, sub: sub || '', until: S.time + (seconds || 3.2) };
}

// Show a big centre banner (MISSION PASSED, BUSTED, ...).
export function showBanner(text, sub, seconds) {
  S.banner = { text, sub: sub || '', until: S.time + (seconds || 2.6) };
}
