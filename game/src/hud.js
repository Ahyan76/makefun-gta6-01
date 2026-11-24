// The HUD: health, money, wanted stars, speed and the mission objective as DOM, plus a
// live 2D minimap on a canvas — the player, cars, police, guards and the mission marker,
// drawn every frame. Dialogue, toasts and the end screens live here too.
import { CITY } from './config.js';

const GRID = CITY.blockSize;
const HALF = 3 * GRID;

export function createHud() {
  const el = (id) => document.getElementById(id);
  const healthFill = el('health-fill');
  const moneyText = el('money');
  const starsEl = el('stars');
  const speedText = el('speed');
  const speedBox = el('speed-box');
  const objectiveText = el('objective');
  const dialogueBox = el('dialogue');
  const dialogueName = el('dialogue-name');
  const dialogueText = el('dialogue-text');
  const toastEl = el('toast');
  const crosshair = el('crosshair');
  const minimap = el('minimap');
  const mapCtx = minimap.getContext('2d');
  let dialogueTimer = null;
  let toastTimer = null;
  let lastMoney = -1;
  let lastStars = -1;
  let lastHealth = -1;

  function showDialogue(name, text) {
    dialogueName.textContent = name;
    dialogueText.textContent = text;
    dialogueBox.classList.remove('hidden');
    if (dialogueTimer) window.clearTimeout(dialogueTimer);
    dialogueTimer = window.setTimeout(() => dialogueBox.classList.add('hidden'), 7000);
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), 4000);
  }

  function setObjective(text) {
    objectiveText.textContent = text;
  }

  function showWasted() {
    el('wasted').classList.remove('hidden');
  }

  function showWin(money) {
    el('win-money').textContent = `$${money}`;
    el('win').classList.remove('hidden');
  }

  function hideOverlays() {
    for (const id of ['wasted', 'win', 'pause-menu', 'title-screen']) {
      el(id).classList.add('hidden');
    }
  }

  /** Draw the minimap: roads, the sea, the player arrow, cars, police and the marker. */
  function drawMinimap(G) {
    const size = minimap.width;
    const scale = size / (HALF * 2 + 60);
    const toX = (x) => (x + HALF + 30) * scale;
    const toY = (z) => (z + HALF + 30) * scale;
    mapCtx.fillStyle = 'rgba(20, 26, 34, 0.85)';
    mapCtx.fillRect(0, 0, size, size);
    // The sea along the south edge.
    mapCtx.fillStyle = '#1d5f7a';
    mapCtx.fillRect(0, toY(HALF + 12), size, size - toY(HALF + 12));
    // Roads.
    mapCtx.strokeStyle = '#5a6068';
    mapCtx.lineWidth = 4;
    for (let k = -3; k <= 3; k += 1) {
      const c = k * GRID;
      mapCtx.beginPath();
      mapCtx.moveTo(toX(-HALF), toY(c));
      mapCtx.lineTo(toX(HALF), toY(c));
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(toX(c), toY(-HALF));
      mapCtx.lineTo(toX(c), toY(HALF));
      mapCtx.stroke();
    }
    // The mission marker, pulsing yellow.
    if (G.mission.beacon.group.visible) {
      const b = G.mission.beacon.group.position;
      const pulse = 4 + Math.sin(G.time * 5) * 1.5;
      mapCtx.fillStyle = '#f2c200';
      mapCtx.beginPath();
      mapCtx.arc(toX(b.x), toY(b.z), pulse, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Guards in red, police in flashing blue, traffic in white.
    for (const enemy of G.enemies) {
      if (enemy.health <= 0) continue;
      mapCtx.fillStyle = '#ff3333';
      mapCtx.fillRect(toX(enemy.group.position.x) - 2, toY(enemy.group.position.z) - 2, 4, 4);
    }
    for (const car of G.cars) {
      if (car.kind === 'player') continue;
      mapCtx.fillStyle = car.kind === 'police' ? (Math.floor(G.time * 4) % 2 === 0 ? '#3388ff' : '#ff3333') : '#e8e8e8';
      mapCtx.fillRect(toX(car.group.position.x) - 2, toY(car.group.position.z) - 2, 4, 4);
    }
    // The player: a white arrow that turns with the camera.
    const px = toX(G.player.pos.x);
    const py = toY(G.player.pos.z);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(Math.atan2(Math.sin(G.player.camYaw), Math.cos(G.player.camYaw)) + Math.PI);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 5);
    mapCtx.lineTo(-5, 5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  function update(G) {
    const player = G.player;
    if (player.health !== lastHealth) {
      lastHealth = player.health;
      healthFill.style.width = `${Math.max(0, player.health)}%`;
      healthFill.style.background = player.health > 50 ? '#3fae5a' : player.health > 25 ? '#e8a13a' : '#d83a3a';
    }
    if (player.money !== lastMoney) {
      lastMoney = player.money;
      moneyText.textContent = `$${player.money}`;
    }
    if (player.wanted !== lastStars) {
      lastStars = player.wanted;
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < player.wanted ? '★' : '☆';
      starsEl.textContent = stars;
      starsEl.style.color = player.wanted > 0 ? '#ffd23a' : '#888888';
    }
    if (player.inCar) {
      speedBox.classList.remove('hidden');
      speedText.textContent = `${Math.round(Math.abs(player.inCar.speed) * 3.2)}`;
    } else {
      speedBox.classList.add('hidden');
    }
    crosshair.classList.remove('hidden');
    drawMinimap(G);
  }

  return { showDialogue, showToast, setObjective, showWasted, showWin, hideOverlays, update };
}
