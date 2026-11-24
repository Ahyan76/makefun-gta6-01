// Combat: hitscan shooting with a tracer and muzzle flash, warehouse guards who shoot
// back, and damage to the player. Shots are raycasts from the camera through the centre
// of the screen; enemies are spheres, buildings are their AABBs.
import { WANTED } from './config.js';
import { createPersonMesh } from './world.js';
import { commitCrime } from './player.js';

const THREE = window.THREE;

export function createCombat(scene) {
  // The tracer: one line, redrawn on every shot and faded out over a few frames.
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const tracer = new THREE.Line(
    tracerGeo,
    new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }),
  );
  tracer.frustumCulled = false;
  scene.add(tracer);
  // The muzzle flash: a small bright sprite at the barrel.
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 }),
  );
  scene.add(flash);
  return { tracer, flash, cooldown: 0, tracerLife: 0 };
}

/** Warehouse guards: red-shirted gunmen with a health bar over their heads. */
export function spawnGuards(scene, area, count) {
  const guards = [];
  for (let i = 0; i < count; i += 1) {
    const { group, legs, arms } = createPersonMesh(0xc23b2e, 0x2a2a30);
    const a = (i / count) * Math.PI * 2;
    group.position.set(area[0] + Math.cos(a) * 9, 0, area[2] + Math.sin(a) * 9);
    scene.add(group);
    const barBg = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.14, 0.05),
      new THREE.MeshBasicMaterial({ color: 0x330000 }),
    );
    barBg.position.y = 2.1;
    group.add(barBg);
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.14, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xff3333 }),
    );
    bar.position.y = 2.1;
    bar.position.z = 0.01;
    group.add(bar);
    guards.push({
      group, legs, arms, bar, kind: 'guard',
      health: 100, shootTimer: 1 + Math.random() * 1.5, walkPhase: Math.random() * 6,
    });
  }
  return guards;
}

function rayHitsSphere(origin, dir, centre, radius) {
  const ox = centre.x - origin.x;
  const oy = centre.y - origin.y;
  const oz = centre.z - origin.z;
  const t = ox * dir.x + oy * dir.y + oz * dir.z;
  if (t < 0) return Infinity;
  const dx = ox - dir.x * t;
  const dy = oy - dir.y * t;
  const dz = oz - dir.z * t;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 > radius * radius) return Infinity;
  return t - Math.sqrt(radius * radius - d2);
}

function rayHitsAABB(origin, dir, c) {
  let tmin = 0;
  let tmax = 200;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  const mn = [c.minX, 0, c.minZ];
  const mx = [c.maxX, 60, c.maxZ];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < mn[i] || o[i] > mx[i]) return Infinity;
    } else {
      let t1 = (mn[i] - o[i]) / d[i];
      let t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/** Fire one shot from the camera through the crosshair. Returns true if it hit someone. */
export function shoot(G) {
  const combat = G.combat;
  if (combat.cooldown > 0) return false;
  combat.cooldown = 0.14;
  const camera = G.camera;
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const muzzle = origin.clone().add(dir.clone().multiplyScalar(1.2));
  muzzle.y -= 0.25;

  let bestT = 200;
  let bestEnemy = null;
  let bestPed = null;
  for (const enemy of G.enemies) {
    if (enemy.health <= 0) continue;
    const c = enemy.group.position.clone();
    c.y += 1.1;
    const t = rayHitsSphere(origin, dir, c, 1.1);
    if (t < bestT) {
      bestT = t;
      bestEnemy = enemy;
      bestPed = null;
    }
  }
  for (const ped of G.peds) {
    if (ped.down) continue;
    const c = ped.group.position.clone();
    c.y += 1.1;
    const t = rayHitsSphere(origin, dir, c, 1.0);
    if (t < bestT) {
      bestT = t;
      bestPed = ped;
      bestEnemy = null;
    }
  }
  for (const c of G.colliders) {
    const t = rayHitsAABB(origin, dir, c);
    if (t < bestT) {
      bestT = t;
      bestEnemy = null;
      bestPed = null;
    }
  }
  const end = origin.clone().add(dir.clone().multiplyScalar(Math.min(bestT, 120)));
  const pos = combat.tracer.geometry.attributes.position;
  pos.setXYZ(0, muzzle.x, muzzle.y, muzzle.z);
  pos.setXYZ(1, end.x, end.y, end.z);
  pos.needsUpdate = true;
  combat.tracer.material.opacity = 0.95;
  combat.tracerLife = 0.07;
  combat.flash.position.copy(muzzle);
  combat.flash.material.opacity = 1;
  G.particles.burst(end, 0xffd98a, 6, 2, 1.5);
  if (G.audio) G.audio.gunshot();
  commitCrime(G.player, WANTED.shoot, G.audio);

  if (bestEnemy) {
    bestEnemy.health -= 34;
    bestEnemy.bar.scale.x = Math.max(0, bestEnemy.health / 100);
    if (bestEnemy.health <= 0) {
      bestEnemy.group.rotation.x = Math.PI / 2;
      bestEnemy.group.position.y = 0.3;
      G.particles.burst(new THREE.Vector3(bestEnemy.group.position.x, 1, bestEnemy.group.position.z), 0xff5555, 12, 3, 2);
    }
    return true;
  }
  if (bestPed) {
    bestPed.down = true;
    bestPed.downTimer = 8;
    bestPed.group.rotation.x = Math.PI / 2;
    bestPed.group.position.y = 0.3;
    commitCrime(G.player, WANTED.hitPed, G.audio);
    return true;
  }
  return false;
}

/** Guards walk toward the player and shoot back when close enough. */
export function updateEnemies(G, dt) {
  const player = G.player;
  for (const enemy of G.enemies) {
    if (enemy.health <= 0) continue;
    const p = enemy.group.position;
    const dx = player.pos.x - p.x;
    const dz = player.pos.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 26) continue;
    if (dist > 10) {
      p.x += (dx / dist) * 3.4 * dt;
      p.z += (dz / dist) * 3.4 * dt;
      enemy.walkPhase += dt * 7;
      const swing = Math.sin(enemy.walkPhase) * 0.5;
      enemy.legs[0].rotation.x = swing;
      enemy.legs[1].rotation.x = -swing;
    }
    enemy.group.rotation.y = Math.atan2(dx, dz);
    enemy.shootTimer -= dt;
    if (enemy.shootTimer <= 0 && dist < 26) {
      enemy.shootTimer = 1.1 + Math.random() * 0.9;
      // A guard's shot: a tracer from the guard toward the player, hit or miss.
      const from = new THREE.Vector3(p.x, 1.4, p.z);
      const to = player.pos.clone();
      to.y = 1.2;
      const hit = Math.random() < 0.35;
      const combat = G.combat;
      const pos = combat.tracer.geometry.attributes.position;
      pos.setXYZ(0, from.x, from.y, from.z);
      pos.setXYZ(1, to.x, to.y, to.z);
      pos.needsUpdate = true;
      combat.tracer.material.opacity = 0.8;
      combat.tracerLife = 0.08;
      if (G.audio) G.audio.gunshot();
      if (hit) damagePlayer(G, 7);
    }
  }
}

/** Hurt the player; at zero health the game shows WASTED and respawns at the hospital. */
export function damagePlayer(G, amount) {
  const player = G.player;
  if (player.dead || G.screen !== 'play') return;
  player.health -= amount;
  if (player.health <= 0) {
    player.health = 0;
    player.dead = true;
    player.wanted = 0;
    G.screen = 'over';
    G.hud.showWasted();
    if (G.audio) G.audio.setSiren(false);
  }
}

/** Respawn at the hospital after WASTED: half the money is gone, health is back. */
export function respawnPlayer(G) {
  const player = G.player;
  player.health = 100;
  player.dead = false;
  player.money = Math.floor(player.money / 2);
  if (player.inCar) {
    player.inCar.kind = player.inCar.wasKind || 'parked';
    player.inCar = null;
  }
  player.pos.set(44, 0, -88);
  player.group.visible = true;
  player.group.position.copy(player.pos);
  G.screen = 'play';
  G.hud.hideOverlays();
}
