// Keyboard and mouse input for Solmar Bay. Held keys are a live set; one-shot presses
// (enter car, punch, pause, interact) are queued as flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice. Mouse look uses pointer
// lock on the canvas; the accumulated deltas are read and cleared every frame.

export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_CONFIRM = 8;
export const ACTION_SHOOT = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const CONFIRM = new Set(['Enter', 'Space']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseDX = 0;
  let mouseDY = 0;
  let mouseDown = false;
  let locked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    if (FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    mouseDX += event.movementX || 0;
    mouseDY += event.movementY || 0;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouseDown = true;
      actions |= ACTION_SHOOT;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouseDown = false;
  });

  return {
    held(code) {
      return keys.has(code);
    },
    /** -1/0/1 for forward and strafe, from WASD or the arrow keys. */
    move() {
      const f = (FORWARD.has('KeyW') && keys.has('KeyW')) || keys.has('ArrowUp') ? 1 : 0;
      const b = keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0;
      const l = keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0;
      const r = keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0;
      return { forward: f - b, strafe: r - l };
    },
    running() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
    shooting() {
      return mouseDown;
    },
    /** Mouse deltas since the last call, in pixels. */
    takeMouse() {
      const dx = mouseDX;
      const dy = mouseDY;
      mouseDX = 0;
      mouseDY = 0;
      return { dx, dy };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Ask the browser to lock the pointer to the canvas (mouse look). */
    lockPointer() {
      try {
        if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
      } catch {
        // Pointer lock can be refused (headless, iframe): mouse look then stays off.
      }
    },
    unlockPointer() {
      try {
        if (document.pointerLockElement === canvas) document.exitPointerLock();
      } catch {
        // Nothing to unlock.
      }
    },
    isLocked() {
      return locked;
    },
  };
}
