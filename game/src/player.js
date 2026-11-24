// The player, on foot and behind the wheel. On foot: WASD moves relative to the camera,
// Shift runs, F punches, E steals the nearest car. Driving: W/S accelerate and brake, A/D
// steer, E steps out. Cars collide with buildings (AABB push-out), traffic (circle push) and
// pedestrians (which the law notices).
import { CAR, PLAYER, WANTED } from './config.js';
import { collideCircle, createPersonMesh } from './world.js';

const THREE = window.THREE;

export function createPlayer(scene) {
  const { group, legs, arms } = createPersonMesh(0x4fc3f7, 0x2a2a30);
  scene.add(group);
  return {
    group, legs, arms,
    pos: new THREE.Vector3(0, 0, 132),
    yaw: Math.PI,
    camYaw: Math.PI,
    camPitch: 0.32,
    health: PLAYER.health,
    money: 0,
    wanted: 0,
    wantedTimer: 0,
    crimeCooldown: 0,
    inCar: null,
    walkPhase: 0,
    punchTimer: 0,
    dead: false,
    speed: 0,
  };
}

/** Raise the wanted level by `stars`, up to the cap, and restart the decay timer. */
export function commitCrime(player, stars, audio) {
  if (player.crimeCooldown > 0) return;
  player.crimeCooldown = 4;
  player.wanted = Math.min(WANTED.maxStars, player.wanted + stars);
  player.wantedTimer = WANTED.decaySeconds;
  if (audio) audio.blip();
}

/** The nearest stealable car within 4.5 units of the player, or null. */
export function nearestCar(player, cars) {
  let best = null;
  let bestD = 4.5;
  for (const car of cars) {
    if (car.kind === 'player') continue;
    const p = car.group.position;
    const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

function punchHit(player, enemies, peds, particles, audio) {
  const fx = Math.sin(player.yaw);
  const fz = Math.cos(player.yaw);
  for (const enemy of enemies) {
    if (enemy.health <= 0) continue;
    const p = enemy.group.position;
    const dx = p.x - player.pos.x;
    const dz = p.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < PLAYER.punchRange + 0.8 && (dx * fx + dz * fz) / (d || 1) > 0.4) {
      enemy.health -= PLAYER.punchDamage;
      particles.burst(new THREE.Vector3(p.x, 1.4, p.z), 0xffd98a, 8, 3, 2);
      if (audio) audio.punch();
      return true;
    }
  }
  for (const ped of peds) {
    if (ped.down) continue;
    const p = ped.group.position;
    const dx = p.x - player.pos.x;
    const dz = p.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < PLAYER.punchRange + 0.8 && (dx * fx + dz * fz) / (d || 1) > 0.4) {
      ped.down = true;
      ped.downTimer = 6;
      ped.group.rotation.x = Math.PI / 2;
      ped.group.position.y = 0.3;
      commitCrime(player, WANTED.hitPed, audio);
      if (audio) audio.punch();
      return true;
    }
  }
  if (audio) audio.punch();
  return false;
}

export function updateOnFoot(G, dt) {
  const { player, input, colliders } = G;
  const move = input.move();
  const mouse = input.takeMouse();
  player.camYaw -= mouse.dx * 0.0028;
  player.camPitch = Math.max(-0.15, Math.min(0.9, player.camPitch + mouse.dy * 0.0022));

  const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const sin = Math.sin(player.camYaw);
  const cos = Math.cos(player.camYaw);
  let mx = 0;
  let mz = 0;
  if (move.forward !== 0 || move.strafe !== 0) {
    mx = sin * move.forward + cos * move.strafe;
    mz = cos * move.forward - sin * move.strafe;
    const len = Math.hypot(mx, mz) || 1;
    mx /= len;
    mz /= len;
    player.yaw = Math.atan2(mx, mz);
    player.pos.x += mx * speed * dt;
    player.pos.z += mz * speed * dt;
    player.walkPhase += dt * speed * 1.6;
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  collideCircle(player.pos, 0.6, colliders);
  // Bumping into a parked or traffic car pushes the player out, not through it.
  for (const car of G.cars) {
    const p = car.group.position;
    const dx = player.pos.x - p.x;
    const dz = player.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.2 && d > 0.01) {
      player.pos.x = p.x + (dx / d) * 2.2;
      player.pos.z = p.z + (dz / d) * 2.2;
    }
  }
  player.group.position.copy(player.pos);
  player.group.rotation.y = player.yaw;
  const swing = player.speed > 0 ? Math.sin(player.walkPhase) * 0.55 : 0;
  player.legs[0].rotation.x = swing;
  player.legs[1].rotation.x = -swing;
  player.arms[0].rotation.x = -swing * 0.7;
  player.arms[1].rotation.x = swing * 0.7;

  if (player.punchTimer > 0) player.punchTimer -= dt;
  const actions = input.takeActions();
  if (actions & 2 && player.punchTimer <= 0) {
    player.punchTimer = PLAYER.punchCooldown;
    player.arms[0].rotation.x = -1.6;
    punchHit(player, G.enemies, G.peds, G.particles, G.audio);
  }
  if (actions & 1) {
    const car = nearestCar(player, G.cars);
    if (car) enterCar(G, car);
  }
  if (player.crimeCooldown > 0) player.crimeCooldown -= dt;
}

export function enterCar(G, car) {
  const { player } = G;
  const isTaxiJob = car.kind === 'taxi' && G.mission.index === 0 && G.mission.step === 0;
  if (car.kind !== 'taxi' || !isTaxiJob) commitCrime(player, WANTED.stealCar, G.audio);
  car.wasKind = car.kind;
  car.kind = 'player';
  player.inCar = car;
  player.group.visible = false;
  if (G.audio) G.audio.blip();
}

export function exitCar(G) {
  const { player } = G;
  const car = player.inCar;
  if (!car) return;
  car.kind = car.wasKind || 'parked';
  player.inCar = null;
  player.pos.set(car.group.position.x + 2.4, 0, car.group.position.z + 1.5);
  collideCircle(player.pos, 0.6, G.colliders);
  player.group.visible = true;
  player.group.position.copy(player.pos);
}

export function updateDriving(G, dt) {
  const { player, input } = G;
  const car = player.inCar;
  if (!car) return;
  const move = input.move();
  const mouse = input.takeMouse();
  player.camYaw -= mouse.dx * 0.0028;
  player.camPitch = Math.max(0.05, Math.min(0.8, player.camPitch + mouse.dy * 0.0022));

  const forward = move.forward;
  if (forward > 0) car.speed += CAR.accel * dt;
  else if (forward < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 8 * dt);
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  const steer = move.strafe * CAR.steer * (car.speed >= 0 ? 1 : -1);
  const turnRate = steer * Math.min(1, Math.abs(car.speed) / 10) * 1.9;
  car.yaw -= turnRate * dt;
  car.group.rotation.y = car.yaw;
  const fx = Math.sin(car.yaw);
  const fz = Math.cos(car.yaw);
  const p = car.group.position;
  const oldX = p.x;
  const oldZ = p.z;
  p.x += fx * car.speed * dt;
  p.z += fz * car.speed * dt;
  const hitWall = collideCircle(p, 1.6, G.colliders);
  if (hitWall && Math.abs(car.speed) > 8) {
    car.speed *= 0.45;
    G.particles.burst(new THREE.Vector3(p.x, 0.8, p.z), 0xffd98a, 14, 5, 3);
    if (G.audio) G.audio.crash();
  }
  // Shove traffic cars and pedestrians out of the way.
  for (const other of G.cars) {
    if (other === car || other.kind === 'player') continue;
    const op = other.group.position;
    const dx = p.x - op.x;
    const dz = p.z - op.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.4 && d > 0.01) {
      const push = (3.4 - d) / 2;
      op.x -= (dx / d) * push;
      op.z -= (dz / d) * push;
      if (other.kind === 'traffic') other.speed = Math.max(0, other.speed - 4);
      if (Math.abs(car.speed) > 10) {
        commitCrime(player, WANTED.hitCar, G.audio);
        if (G.audio) G.audio.crash();
        car.speed *= 0.8;
      }
    }
  }
  for (const ped of G.peds) {
    if (ped.down) continue;
    const pp = ped.group.position;
    const d = Math.hypot(p.x - pp.x, p.z - pp.z);
    if (d < 2.4 && Math.abs(car.speed) > 3) {
      ped.down = true;
      ped.downTimer = 8;
      ped.group.rotation.x = Math.PI / 2;
      ped.group.position.y = 0.3;
      G.particles.burst(new THREE.Vector3(pp.x, 1, pp.z), 0xff5555, 10, 3, 2);
      commitCrime(player, WANTED.hitPed, G.audio);
      if (G.audio) G.audio.crash();
      car.speed *= 0.85;
    }
  }
  // Exhaust puffs and skid smoke when the wheels spin hard.
  if (Math.abs(car.speed) > 20 && Math.random() < 0.35) {
    G.particles.burst(new THREE.Vector3(p.x - fx * 2.2, 0.4, p.z - fz * 2.2), 0x888888, 2, 1.2, 1);
  }
  if (G.audio) G.audio.setEngine(Math.abs(car.speed) / CAR.maxSpeed);
  const actions = input.takeActions();
  if (actions & 1) exitCar(G);
  if (player.crimeCooldown > 0) player.crimeCooldown -= dt;
  player.pos.copy(p);
  player.speed = car.speed;
}
