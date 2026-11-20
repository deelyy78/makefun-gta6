// input.js — keyboard and mouse state for the game: which keys are held,
// which were pressed this frame, and where the mouse points in view pixels.

export const keys = new Set();
export const pressed = new Set();
export const mouse = { x: 0, y: 0, down: false, rdown: false, clicked: false };

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyP', 'KeyM',
  'Digit1', 'Digit2', 'Digit3', 'ShiftLeft', 'ShiftRight', 'Enter', 'Escape',
]);

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
    mouse.rdown = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
    if (e.button === 2) mouse.rdown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rdown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function down(code) {
  return keys.has(code);
}

export function wasPressed(code) {
  return pressed.has(code);
}

// Call once at the end of each frame so wasPressed means "this frame only".
export function endFrameInput() {
  pressed.clear();
  mouse.clicked = false;
}

// Movement axes from the keys: x -1..1 (D/A, arrows), y -1..1 (S/W, arrows).
export function moveAxes() {
  const x = (down('KeyD') || down('ArrowRight') ? 1 : 0) - (down('KeyA') || down('ArrowLeft') ? 1 : 0);
  const y = (down('KeyS') || down('ArrowDown') ? 1 : 0) - (down('KeyW') || down('ArrowUp') ? 1 : 0);
  return { x, y };
}
