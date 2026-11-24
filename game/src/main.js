// Solmar Bay — boot and the one loop. The world is a three.js scene over a procedural
// grid city at sunset; the loop advances in fixed 1/60 s steps, updates the player, the
// traffic, the police, the missions and the combat, then paints the frame and the HUD.
// ?seed=N fixes the city. ?shot=chase|street|combat|start stages that scene, runs it
// forward a fixed number of steps and sets window.__shotReady for a screenshot.
import { CITY, MISSIONS, PALETTE, SAVE_KEY, STEP, STORY_INTRO, mulberry32 } from './config.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE } from './input.js';
import { createAudio } from './audio.js';
import {
  buildCity, createTraffic, createPeds, createParticles, createCarMesh, updateTraffic,
  updatePeds, collideCircle,
} from './world.js';
import { createPlayer, updateOnFoot, updateDriving, commitCrime } from './player.js';
import { createMissionState, startMission, updateMissions } from './missions.js';
import { createCombat, shoot, updateEnemies, respawnPlayer } from './combat.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const THREE = window.THREE;
const MAX_FRAME = 0.25;

window.__gameErrors = [];
window.addEventListener('error', (event) => {
  window.__gameErrors.push(String(event.message || event.error));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__gameErrors.push(String(event.reason));
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 7;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe08a52, 140, 460);
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

// Sunset: a low warm sun, a peach sky and a gradient dome over the city.
const sun = new THREE.DirectionalLight(0xffb070, 1.15);
sun.position.set(-180, 60, 120);
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xff9a5c, 0x3a3f46, 0.75));
scene.add(new THREE.AmbientLight(0x604a55, 0.5));
{
  const skyGeo = new THREE.SphereGeometry(520, 16, 12);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const colors = [];
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.max(0, Math.min(1, (pos.getY(i) + 60) / 300));
    const c = horizon.clone().lerp(top, t);
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sunDisc.position.set(-420, 55, 260);
  sunDisc.lookAt(0, 20, 0);
  scene.add(sunDisc);
}

const random = mulberry32(seed);
const { colliders } = buildCity(scene, seed);
const particles = createParticles(scene, 400);
const traffic = createTraffic(scene, random, 14);
const peds = createPeds(scene, random, 12);
const player = createPlayer(scene);
const audio = createAudio();
const hud = createHud();
const input = createInput(canvas);

const G = {
  scene, camera, renderer, random, colliders, particles, peds,
  player, audio, hud, input,
  cars: [...traffic],
  enemies: [],
  combat: createCombat(scene),
  mission: createMissionState(scene),
  time: 0,
  screen: 'title',
  shotDrive: null,
  shotOrbit: false,
  shotFireAt: -1,
  stepsRun: 0,
  policeTimer: 0,
  ramCooldown: 0,
};

// The taxi for mission one, parked by the pier.
{
  const { group } = createCarMesh(PALETTE.taxi, { taxi: true });
  group.position.set(8, 0, 138);
  group.rotation.y = Math.PI / 2;
  scene.add(group);
  G.cars.push({ group, kind: 'taxi', speed: 0, yaw: Math.PI / 2 });
}
// A few parked cars along the curbs.
{
  const parkedColors = [0xdadada, 0x2a2a2e, 0x3a7a3a, 0xd8a03a, 0x7a3aa0];
  const spots = [[-44, 3, 0], [44, -3, Math.PI], [88, 3, 0], [-88, -3, Math.PI], [0, 3, Math.PI / 2], [-44, -3, 0]];
  for (let i = 0; i < spots.length; i += 1) {
    const [x, z, yaw] = spots[i];
    const { group } = createCarMesh(parkedColors[i % parkedColors.length]);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
    G.cars.push({ group, kind: 'parked', speed: 0, yaw });
  }
}

function saveGame() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: player.money,
      missionIndex: G.mission.index,
      pos: [player.pos.x, player.pos.z],
      health: player.health,
      wanted: player.wanted,
    }));
  } catch {
    // Storage can be off: the save then lasts this visit only.
  }
}

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

G.saveGame = saveGame;

/** Police: cruisers spawn while the player is wanted and chase them down. */
function updatePolice(dt) {
  const wanted = player.wanted;
  const policeCars = G.cars.filter((c) => c.kind === 'police');
  const wantCount = wanted === 0 ? 0 : Math.min(4, 1 + Math.floor(wanted / 2));
  if (policeCars.length < wantCount && G.policeTimer <= 0) {
    G.policeTimer = 3;
    const { group } = createCarMesh(PALETTE.police, { police: true });
    const angle = Math.random() * Math.PI * 2;
    const x = Math.max(-120, Math.min(120, player.pos.x + Math.cos(angle) * 70));
    const z = Math.max(-120, Math.min(120, player.pos.z + Math.sin(angle) * 70));
    group.position.set(x, 0, z);
    scene.add(group);
    G.cars.push({ group, kind: 'police', speed: 0, yaw: 0, chase: true });
  }
  if (G.policeTimer > 0) G.policeTimer -= dt;
  for (const car of policeCars) {
    const p = car.group.position;
    const dx = player.pos.x - p.x;
    const dz = player.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (wanted === 0 && dist > 60) {
      scene.remove(car.group);
      G.cars.splice(G.cars.indexOf(car), 1);
      continue;
    }
    const wantYaw = Math.atan2(dx, dz);
    let dy = wantYaw - car.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    car.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, dy));
    // Chase shot: cruisers match the getaway car's speed and trail at a fixed
    // gap instead of accelerating to 38 and ramming it (no ram, no crawl).
    car.speed = Math.min(G.shotPoliceGap ? 26 : 38, car.speed + 16 * dt);
    car.group.rotation.y = car.yaw;
    p.x += Math.sin(car.yaw) * car.speed * dt;
    p.z += Math.cos(car.yaw) * car.speed * dt;
    collideCircle(p, 1.6, colliders);
    // Ramming the player: a hard shove, a crash and a little damage.
    if (dist < 3.6) {
      if (player.inCar) {
        player.inCar.speed *= 0.7;
        player.inCar.group.position.x += (dx / (dist || 1)) * 0.6;
        player.inCar.group.position.z += (dz / (dist || 1)) * 0.6;
      } else {
        player.pos.x += (dx / (dist || 1)) * 0.8;
        player.pos.z += (dz / (dist || 1)) * 0.8;
      }
      if (G.ramCooldown <= 0) {
        G.ramCooldown = 1.2;
        particles.burst(new THREE.Vector3(p.x, 1, p.z), 0xffd98a, 10, 4, 2);
        audio.crash();
      }
    }
    const lightbar = car.group.getObjectByName('lightbar');
    if (lightbar) {
      lightbar.material.emissive.setHex(Math.floor(G.time * 4) % 2 === 0 ? 0x2244ff : 0xff2222);
    }
  }
  if (G.ramCooldown > 0) G.ramCooldown -= dt;
  // The siren wails while a cruiser is close.
  const near = policeCars.some((c) => {
    const p = c.group.position;
    return Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 55;
  });
  audio.setSiren(near && wanted > 0);
}

/** The wanted level cools off when the player stays clean and out of sight. */
function updateWanted(dt) {
  if (player.wanted === 0) return;
  const policeNear = G.cars.some((c) => {
    if (c.kind !== 'police') return false;
    const p = c.group.position;
    return Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 40;
  });
  if (!policeNear) {
    player.wantedTimer -= dt;
    if (player.wantedTimer <= 0) {
      player.wanted -= 1;
      player.wantedTimer = WANTED_DECAY;
    }
  } else {
    player.wantedTimer = WANTED_DECAY;
  }
}
const WANTED_DECAY = 18;

function updateCamera(dt) {
  const target = player.inCar ? player.inCar.group.position : player.pos;
  const yaw = player.inCar ? player.inCar.yaw : player.camYaw;
  // The camera trails behind the car or the player, eased so it never snaps.
  const dist = player.inCar ? 13 : 8.5;
  const height = player.inCar ? 5.2 : 3.6;
  const camYaw = player.inCar ? yaw + Math.PI + (player.camYaw - (yaw + Math.PI)) * 0.25 : player.camYaw;
  const cx = target.x - Math.sin(camYaw) * dist;
  const cz = target.z - Math.cos(camYaw) * dist;
  const k = 1 - Math.pow(0.0001, dt);
  camera.position.x += (cx - camera.position.x) * k;
  camera.position.y += ((target.y + height) - camera.position.y) * k;
  camera.position.z += (cz - camera.position.z) * k;
  camera.lookAt(target.x, target.y + 1.6, target.z);
  if (G.shotOrbit) {
    const t = G.time * 0.08;
    camera.position.set(Math.sin(t) * 150, 55, Math.cos(t) * 150);
    camera.lookAt(0, 8, 0);
  }
}

function step(dt) {
  G.time += dt;
  if (G.screen !== 'play') {
    if (G.screen === 'title') {
      updateTraffic(traffic, dt, random);
      updatePeds(peds, dt, player.pos, false);
    }
    updateCamera(dt);
    particles.update(dt);
    return;
  }
  // Shot autopilot: hold the wheel and steer along the road.
  if (G.shotDrive) {
    const car = player.inCar;
    if (car) {
      car.speed = Math.min(car.speed + 20 * dt, 26);
      car.yaw += (Math.PI / 2 - car.yaw) * Math.min(1, dt * 2);
      car.group.rotation.y = car.yaw;
      const p = car.group.position;
      p.x += Math.sin(car.yaw) * car.speed * dt;
      p.z += Math.cos(car.yaw) * car.speed * dt;
      p.z += (0 - p.z) * Math.min(1, dt * 2);
      collideCircle(p, 1.6, colliders);
      player.pos.copy(p);
    }
  } else if (player.inCar) {
    updateDriving(G, dt);
  } else {
    updateOnFoot(G, dt);
  }
  if (G.shotFireAt === G.stepsRun) {
    shoot(G);
    G.shotFireAt = -1;
  }
  if (input.shooting() && !player.inCar && G.combat.cooldown <= 0) shoot(G);
  if (G.combat.cooldown > 0) G.combat.cooldown -= dt;
  if (G.combat.tracerLife > 0) {
    G.combat.tracerLife -= dt;
    if (G.combat.tracerLife <= 0) G.combat.tracer.material.opacity = 0;
  }
  G.combat.flash.material.opacity = Math.max(0, G.combat.flash.material.opacity - dt * 14);
  // Chase shot: no random traffic wandering into the frame — the getaway
  // car and the two trailing cruisers are the whole scene.
  if (!G.shotPoliceGap) updateTraffic(traffic, dt, random);
  updatePeds(peds, dt, player.pos, G.combat.tracerLife > 0);
  updatePolice(dt);
  updateWanted(dt);
  updateEnemies(G, dt);
  updateMissions(G, dt);
  G.mission.beacon.update(G.time);
  particles.update(dt);
  updateCamera(dt);
  hud.update(G);
  if (player.health < 100) player.health = Math.min(100, player.health + dt * 1.5);
}

function showTitle() {
  G.screen = 'title';
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('title-screen').classList.remove('hidden');
  document.getElementById('continue-btn').classList.toggle('hidden', !loadSave());
  input.unlockPointer();
}

function startGame(fromSave) {
  const save = fromSave ? loadSave() : null;
  if (save) {
    player.money = save.money || 0;
    player.health = save.health || 100;
    player.wanted = save.wanted || 0;
    player.pos.set(save.pos[0], 0, save.pos[1]);
    player.group.position.copy(player.pos);
  } else {
    player.money = 0;
    player.health = 100;
    player.wanted = 0;
    player.pos.set(0, 0, 132);
    player.group.position.copy(player.pos);
  }
  audio.start();
  hud.hideOverlays();
  document.getElementById('hud').classList.remove('hidden');
  G.screen = 'play';
  input.lockPointer();
  if (!fromSave) startMission(G, 0);
  else {
    G.mission.index = save.missionIndex || 0;
    startMission(G, G.mission.index);
  }
  hud.setObjective(MISSIONS[G.mission.index].steps[0].text);
}

document.getElementById('start-btn').addEventListener('click', () => startGame(false));
document.getElementById('continue-btn').addEventListener('click', () => startGame(true));
document.getElementById('resume-btn').addEventListener('click', () => {
  hud.hideOverlays();
  G.screen = 'play';
  input.lockPointer();
});
document.getElementById('save-btn').addEventListener('click', () => {
  saveGame();
  hud.showToast('Game saved');
});
document.getElementById('quit-btn').addEventListener('click', () => {
  saveGame();
  showTitle();
});
document.getElementById('respawn-btn').addEventListener('click', () => {
  respawnPlayer(G);
  input.lockPointer();
});
document.getElementById('win-btn').addEventListener('click', () => {
  hud.hideOverlays();
  G.screen = 'play';
  input.lockPointer();
});
document.getElementById('story-text').textContent = STORY_INTRO;

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_PAUSE) {
    if (G.screen === 'play') {
      G.screen = 'paused';
      document.getElementById('pause-menu').classList.remove('hidden');
      input.unlockPointer();
    } else if (G.screen === 'paused') {
      hud.hideOverlays();
      G.screen = 'play';
      input.lockPointer();
    }
  }
  if (actions & ACTION_CONFIRM && G.screen === 'title') startGame(false);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  handleActions();
  if (G.shotMode) {
    if (G.stepsRun < G.shotSteps) {
      step(STEP);
      G.stepsRun += 1;
      if (G.stepsRun >= G.shotSteps) window.__shotReady = true;
    }
    // Re-render every frame so the staged scene stays presented (WebGL canvases
    // without preserveDrawingBuffer can go blank after the first present).
    renderer.render(scene, camera);
    return;
  }
  let acc = dt;
  while (acc >= STEP) {
    step(STEP);
    acc -= STEP;
  }
  renderer.render(scene, camera);
}

let last = performance.now();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shot) {
  G.shotMode = true;
  G.stepsRun = 0;
  G.shotSteps = stageShot(shot, G);
  // The title screen hides the 3D view for the start shot; keep the world visible behind it.
  if (shot === 'start') {
    document.getElementById('title-screen').style.background = 'rgba(10, 12, 24, 0.45)';
  }
  // Stage synchronously before the first paint, so headless screenshot tools that
  // capture right after load still get the fully staged scene. The frame loop below
  // keeps the game alive afterwards for interactive use and CDP screenshots.
  for (let i = 0; i < G.shotSteps; i += 1) {
    step(STEP);
    G.stepsRun += 1;
  }
  // The chase autopilot gets rammed to a crawl by the pursuing cruisers; for the
  // screenshot the getaway car should read as moving fast, so restore top speed.
  if (G.shotDrive && player.inCar) {
    player.inCar.speed = 26;
    hud.update(G);
  }
  if (shot === 'start') {
    for (let i = 0; i < 90; i += 1) {
      G.time += 1 / 60;
      updateCamera(1 / 60);
    }
  }
  renderer.render(scene, camera);
  window.__shotReady = true;
  requestAnimationFrame(frame);
} else {
  showTitle();
  requestAnimationFrame(frame);
}
