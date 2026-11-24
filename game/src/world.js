// The city of Solmar Bay: a procedural grid of streets, buildings with lit windows,
// palms and streetlights, traffic that drives the roads, pedestrians on the sidewalks,
// police that chase, and the particle pool. Nothing here knows about missions or the HUD.
import { CITY, PALETTE, mulberry32 } from './config.js';

const THREE = window.THREE;
const GRID = CITY.blockSize;
const HALF = 3 * GRID; // roads run from -132 to +132
const ROAD = CITY.roadWidth;

/** A lit-window facade texture (map) and its glow-only twin (emissive map). */
function facadeTextures(random, litRatio) {
  const map = document.createElement('canvas');
  map.width = 128;
  map.height = 256;
  const glow = document.createElement('canvas');
  glow.width = 128;
  glow.height = 256;
  const m = map.getContext('2d');
  const g = glow.getContext('2d');
  const base = PALETTE.building[Math.floor(random() * PALETTE.building.length)];
  m.fillStyle = '#' + base.toString(16).padStart(6, '0');
  m.fillRect(0, 0, 128, 256);
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 128, 256);
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const lit = random() < litRatio;
      m.fillStyle = lit ? '#ffd98a' : '#2a3242';
      m.fillRect(10 + col * 19, 12 + row * 20, 13, 14);
      if (lit) {
        g.fillStyle = '#ffca6a';
        g.fillRect(10 + col * 19, 12 + row * 20, 13, 14);
      }
    }
  }
  const mapTex = new THREE.CanvasTexture(map);
  const glowTex = new THREE.CanvasTexture(glow);
  return { map: mapTex, emissiveMap: glowTex };
}

function box(w, h, d, color, opts) {
  const mat = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

/** Build the whole city into the scene and return its colliders and spawn points. */
export function buildCity(scene, seed) {
  const random = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // Ground, beach and water.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 760),
    new THREE.MeshLambertMaterial({ color: 0x565b4a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  group.add(ground);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 40),
    new THREE.MeshLambertMaterial({ color: 0xc9a86a }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.0, HALF + 26);
  group.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 220),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.1, HALF + 150);
  group.add(water);

  // Roads: dark strips on every grid line, with dashed centre lines.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.road });
  const dashMat = new THREE.MeshLambertMaterial({ color: PALETTE.roadLine });
  for (let k = -3; k <= 3; k += 1) {
    const c = k * GRID;
    const alongX = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + ROAD, ROAD), roadMat);
    alongX.rotation.x = -Math.PI / 2;
    alongX.position.set(0, 0.02, c);
    group.add(alongX);
    const alongZ = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, HALF * 2 + ROAD), roadMat);
    alongZ.rotation.x = -Math.PI / 2;
    alongZ.position.set(c, 0.02, 0);
    group.add(alongZ);
    for (let d = -HALF; d <= HALF; d += 8) {
      const dashX = box(3.4, 0.06, 0.5, PALETTE.roadLine);
      dashX.position.set(d, 0.04, c);
      group.add(dashX);
      const dashZ = box(0.5, 0.06, 3.4, PALETTE.roadLine);
      dashZ.position.set(c, 0.04, d);
      group.add(dashZ);
    }
  }

  // Sidewalks and buildings, one block at a time.
  const facades = [facadeTextures(random, 0.45), facadeTextures(random, 0.3), facadeTextures(random, 0.6)];
  const sideMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  for (let bx = -3; bx < 3; bx += 1) {
    for (let bz = -3; bz < 3; bz += 1) {
      const cx = bx * GRID + GRID / 2;
      const cz = bz * GRID + GRID / 2;
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(GRID - ROAD, GRID - ROAD), sideMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(cx, 0.03, cz);
      group.add(walk);
      const quadrants = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (const [qx, qz] of quadrants) {
        if (random() < 0.22) continue; // an empty lot, a plaza, a parking patch
        const w = 9 + random() * 5;
        const d = 9 + random() * 5;
        const h = CITY.minBuildingHeight + random() * (CITY.maxBuildingHeight - CITY.minBuildingHeight);
        const x = cx + qx * 8;
        const z = cz + qz * 8;
        const f = facades[Math.floor(random() * facades.length)];
        const mat = new THREE.MeshLambertMaterial({
          map: f.map,
          emissive: 0xffffff,
          emissiveMap: f.emissiveMap,
          emissiveIntensity: 0.55,
        });
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        building.position.set(x, h / 2, z);
        group.add(building);
        const roof = box(w * 0.5, 1.2, d * 0.5, 0x4a4a52);
        roof.position.set(x, h + 0.6, z);
        group.add(roof);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }

  // Palms and streetlights along the sidewalks.
  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x22242a });
  const bulbMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffd98a, emissiveIntensity: 1 });
  for (let k = -3; k < 3; k += 1) {
    for (let m = -3; m <= 3; m += 1) {
      if (random() < 0.45) continue;
      const px = k * GRID + GRID / 2 + (random() < 0.5 ? -15 : 15);
      const pz = m * GRID + (random() < 0.5 ? -8 : 8);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat);
      trunk.position.set(px, 3, pz);
      group.add(trunk);
      for (let leaf = 0; leaf < 6; leaf += 1) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 4), leafMat);
        const a = (leaf / 6) * Math.PI * 2;
        cone.position.set(px + Math.cos(a) * 1.4, 6.4, pz + Math.sin(a) * 1.4);
        cone.rotation.z = Math.cos(a) * 0.9;
        cone.rotation.x = -Math.sin(a) * 0.9;
        group.add(cone);
      }
      const lx = m * GRID + (random() < 0.5 ? -8 : 8);
      const lz = k * GRID + GRID / 2 + (random() < 0.5 ? -15 : 15);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 6), poleMat);
      pole.position.set(lx, 2.7, lz);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bulbMat);
      bulb.position.set(lx, 5.5, lz);
      group.add(bulb);
    }
  }

  // The marina: a wooden dock and a speedboat at the south-west corner.
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const dock = box(10, 0.5, 22, 0x7a5a38);
  dock.position.set(-128, 0.4, HALF + 12);
  group.add(dock);
  const boat = createBoat();
  boat.position.set(-128, 0.6, HALF + 26);
  group.add(boat);

  return { colliders, group };
}

function createBoat() {
  const boat = new THREE.Group();
  const hull = box(3, 1.2, 8, 0xe8e8e8);
  hull.position.y = 0.6;
  boat.add(hull);
  const cabin = box(2, 1, 3.4, 0x2a4a6a);
  cabin.position.set(0, 1.6, -0.6);
  boat.add(cabin);
  const stripe = box(3.1, 0.3, 8.1, 0xd84a4a);
  stripe.position.y = 1.1;
  boat.add(stripe);
  return boat;
}

/** A low-poly car: body, cabin, four wheels, headlights and taillights. */
export function createCarMesh(color, opts) {
  const o = opts || {};
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 4.4), paint);
  body.position.y = 0.65;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.2), new THREE.MeshLambertMaterial({ color: 0x1a2028 }));
  cabin.position.set(0, 1.25, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.38, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  for (const x of [-0.6, 0.6]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    head.position.set(x, 0.7, 2.22);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), new THREE.MeshLambertMaterial({ color: 0xd81e1e, emissive: 0xaa0000, emissiveIntensity: 0.7 }));
    tail.position.set(x, 0.7, -2.22);
    group.add(tail);
  }
  if (o.taxi) {
    const sign = box(0.9, 0.28, 0.5, PALETTE.taxi);
    sign.position.set(0, 1.7, -0.2);
    group.add(sign);
  }
  if (o.police) {
    const bar = box(1.1, 0.22, 0.5, 0xffffff);
    bar.position.set(0, 1.68, -0.2);
    group.add(bar);
    const lightbar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 0.5), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x2244ff, emissiveIntensity: 1 }));
    lightbar.position.set(0, 1.68, -0.2);
    lightbar.name = 'lightbar';
    group.add(lightbar);
  }
  return { group, wheels };
}

/** A simple box person: torso, head, arms and legs that swing while walking. */
export function createPersonMesh(shirt, pants) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const torso = box(0.62, 0.72, 0.34, shirt);
  torso.position.y = 1.05;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skin);
  head.position.y = 1.62;
  group.add(head);
  const hair = box(0.38, 0.12, 0.38, 0x1a1210);
  hair.position.y = 1.82;
  group.add(hair);
  const legs = [];
  for (const x of [-0.16, 0.16]) {
    const leg = box(0.24, 0.68, 0.26, pants);
    leg.position.set(x, 0.34, 0);
    leg.geometry.translate(0, -0.34, 0);
    leg.position.y = 0.68;
    group.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const x of [-0.42, 0.42]) {
    const arm = box(0.18, 0.62, 0.2, shirt);
    arm.position.set(x, 1.34, 0);
    arm.geometry.translate(0, -0.31, 0);
    arm.position.y = 1.34;
    group.add(arm);
    arms.push(arm);
  }
  return { group, legs, arms };
}

/** Push a circle (x, z, radius) out of every building AABB. Returns true on a hit. */
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (let i = 0; i < colliders.length; i += 1) {
    const c = colliders[i];
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        pos.x = c.maxX + radius;
      }
    }
  }
  // The city edge: sand and water stop the player, the sea is not drivable.
  const limit = HALF + 30;
  pos.x = Math.max(-limit, Math.min(limit, pos.x));
  pos.z = Math.max(-limit, Math.min(HALF + 34, pos.z));
  return hit;
}

/** Traffic: cars that drive the road grid, turning at intersections, slowing for the car ahead. */
export function createTraffic(scene, random, count) {
  const cars = [];
  const palette = [0xc23b2e, 0x2e6fc2, 0xdadada, 0x2a2a2e, 0x3a7a3a, 0xd8a03a, 0x7a3aa0];
  for (let i = 0; i < count; i += 1) {
    const color = palette[Math.floor(random() * palette.length)];
    const { group, wheels } = createCarMesh(color);
    const road = random() < 0.5 ? 'x' : 'z';
    const line = (Math.floor(random() * 7) - 3) * GRID;
    const dir = random() < 0.5 ? 1 : -1;
    const lane = road === 'x' ? (dir > 0 ? 3 : -3) : (dir > 0 ? -3 : 3);
    const along = (Math.floor(random() * 7) - 3) * GRID + random() * 30;
    group.position.set(road === 'x' ? along : line + lane, 0, road === 'x' ? line + lane : along);
    group.rotation.y = road === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    scene.add(group);
    cars.push({
      group, wheels, kind: 'traffic', road, line, dir, lane,
      speed: 8 + random() * 6, baseSpeed: 8 + random() * 6, color,
    });
  }
  return cars;
}

function nextIntersection(along, dir) {
  const k = Math.floor(along / GRID);
  return dir > 0 ? (k + 1) * GRID : k * GRID;
}

export function updateTraffic(cars, dt, random) {
  for (const car of cars) {
    // Slow down for a car ahead on the same road and lane.
    let target = car.baseSpeed;
    const p = car.group.position;
    for (const other of cars) {
      if (other === car || other.road !== car.road || other.line !== car.line || other.dir !== car.dir) continue;
      const op = other.group.position;
      const ahead = car.road === 'x' ? (op.x - p.x) * car.dir : (op.z - p.z) * car.dir;
      if (ahead > 0 && ahead < 9) target = Math.min(target, other.speed);
    }
    car.speed += (target - car.speed) * Math.min(1, dt * 3);
    const move = car.speed * dt;
    if (car.road === 'x') {
      const stop = nextIntersection(p.x, car.dir);
      if ((car.dir > 0 && p.x + move >= stop) || (car.dir < 0 && p.x - move <= stop)) {
        const cross = Math.abs(stop) <= HALF;
        const turn = cross && random() < 0.32;
        if (turn) {
          const newDir = random() < 0.5 ? 1 : -1;
          car.road = 'z';
          car.line = stop;
          car.dir = newDir;
          car.lane = newDir > 0 ? -3 : 3;
          p.x = stop + car.lane;
          p.z = stop;
          car.group.rotation.y = newDir > 0 ? 0 : Math.PI;
        } else if (!cross) {
          car.dir *= -1;
          car.lane = -car.lane;
          car.group.rotation.y = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
        p.x = car.road === 'x' ? stop : p.x;
      } else {
        p.x += car.dir * move;
      }
      if (car.road === 'x') p.z = car.line + car.lane;
    } else {
      const stop = nextIntersection(p.z, car.dir);
      if ((car.dir > 0 && p.z + move >= stop) || (car.dir < 0 && p.z - move <= stop)) {
        const cross = Math.abs(stop) <= HALF;
        const turn = cross && random() < 0.32;
        if (turn) {
          const newDir = random() < 0.5 ? 1 : -1;
          car.road = 'x';
          car.line = stop;
          car.dir = newDir;
          car.lane = newDir > 0 ? 3 : -3;
          p.z = stop + car.lane;
          p.x = stop;
          car.group.rotation.y = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else if (!cross) {
          car.dir *= -1;
          car.lane = -car.lane;
          car.group.rotation.y = car.dir > 0 ? 0 : Math.PI;
        }
        p.z = car.road === 'z' ? stop : p.z;
      } else {
        p.z += car.dir * move;
      }
      if (car.road === 'z') p.x = car.line + car.lane;
    }
    // Wheels spin with speed.
    for (const wheel of car.wheels || []) wheel.rotation.x += (car.speed * dt) / 0.38;
  }
}

/** Pedestrians that stroll the sidewalks and run from trouble. */
export function createPeds(scene, random, count) {
  const peds = [];
  const shirts = [0xd8d8d8, 0xc23b2e, 0x2e6fc2, 0xd8a03a, 0x3a7a3a, 0x7a3aa0];
  for (let i = 0; i < count; i += 1) {
    const { group, legs, arms } = createPersonMesh(shirts[Math.floor(random() * shirts.length)], 0x2a2a30);
    const bx = (Math.floor(random() * 6) - 3) * GRID + GRID / 2;
    const bz = (Math.floor(random() * 6) - 3) * GRID + GRID / 2;
    group.position.set(bx + (random() - 0.5) * 24, 0, bz + (random() - 0.5) * 24);
    scene.add(group);
    peds.push({
      group, legs, arms, kind: 'ped',
      target: new THREE.Vector3(group.position.x, 0, group.position.z),
      speed: 1.2 + random() * 0.8, walkPhase: random() * 6, fleeing: false, down: false, downTimer: 0,
    });
  }
  return peds;
}

export function updatePeds(peds, dt, playerPos, danger) {
  for (const ped of peds) {
    if (ped.down) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.down = false;
        ped.group.rotation.x = 0;
        ped.group.position.y = 0;
      }
      continue;
    }
    const p = ped.group.position;
    const dx = playerPos.x - p.x;
    const dz = playerPos.z - p.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (danger || dist < 6) ped.fleeing = true;
    else if (dist > 30) ped.fleeing = false;
    let tx;
    let tz;
    let speed = ped.speed;
    if (ped.fleeing) {
      tx = p.x - dx / (dist || 1) * 20;
      tz = p.z - dz / (dist || 1) * 20;
      speed = 4.2;
    } else {
      const tdx = ped.target.x - p.x;
      const tdz = ped.target.z - p.z;
      if (tdx * tdx + tdz * tdz < 1) {
        ped.target.set(
          Math.max(-HALF, Math.min(HALF, p.x + (Math.random() - 0.5) * 60)),
          0,
          Math.max(-HALF, Math.min(HALF, p.z + (Math.random() - 0.5) * 60)),
        );
      }
      tx = ped.target.x;
      tz = ped.target.z;
    }
    const mx = tx - p.x;
    const mz = tz - p.z;
    const len = Math.sqrt(mx * mx + mz * mz) || 1;
    p.x += (mx / len) * speed * dt;
    p.z += (mz / len) * speed * dt;
    ped.group.rotation.y = Math.atan2(mx, mz);
    ped.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(ped.walkPhase) * 0.5;
    ped.legs[0].rotation.x = swing;
    ped.legs[1].rotation.x = -swing;
    ped.arms[0].rotation.x = -swing * 0.7;
    ped.arms[1].rotation.x = swing * 0.7;
  }
}

/** A small particle pool: one THREE.Points, reused bursts for crashes, shots and exhaust. */
export function createParticles(scene, max) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(max * 3);
  const colors = new Float32Array(max * 3);
  for (let i = 0; i < max; i += 1) positions[i * 3 + 1] = -100;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 0.95 });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  let cursor = 0;
  return {
    burst(pos, color, count, speed, up) {
      const c = new THREE.Color(color);
      for (let n = 0; n < count; n += 1) {
        const i = cursor;
        cursor = (cursor + 1) % max;
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
        vel[i * 3] = (Math.random() - 0.5) * speed;
        vel[i * 3 + 1] = Math.random() * (up || speed * 0.5);
        vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
        life[i] = 0.5 + Math.random() * 0.5;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < max; i += 1) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -100;
          continue;
        }
        positions[i * 3] += vel[i * 3] * dt;
        positions[i * 3 + 1] += vel[i * 3 + 1] * dt;
        positions[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3 + 1] -= 9 * dt;
        if (positions[i * 3 + 1] < 0.05) positions[i * 3 + 1] = 0.05;
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

/** The mission marker: a pulsing ring and a beam of light over the target. */
export function createBeacon(scene, color) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.2, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.9, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 13;
  group.add(beam);
  scene.add(group);
  return {
    group,
    setPosition(x, z) {
      group.position.set(x, 0, z);
    },
    setVisible(v) {
      group.visible = v;
    },
    update(time) {
      const s = 1 + Math.sin(time * 4) * 0.15;
      ring.scale.set(s, s, 1);
      beam.material.opacity = 0.22 + Math.sin(time * 4) * 0.08;
    },
  };
}
