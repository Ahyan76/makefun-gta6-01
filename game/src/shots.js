// The screenshot scenes behind ?shot=chase|street|combat|start. Each one stages a real
// game state — the same code the player plays, driven a few seconds forward — then the
// loop renders it and sets window.__shotReady, so a screenshot is a frame of real play.
import { MISSIONS } from './config.js';
import { createCarMesh } from './world.js';
import { spawnGuards } from './combat.js';
import { startMission } from './missions.js';

const THREE = window.THREE;

/** Put the player in a car, heading east on the road at z = 0. */
function putPlayerInCar(G, x, z, color) {
  const { group, wheels } = createCarMesh(color || 0xc23b2e);
  group.position.set(x, 0, z);
  G.scene.add(group);
  const car = { group, wheels, kind: 'player', speed: 0, yaw: Math.PI / 2 };
  G.cars.push(car);
  G.player.inCar = car;
  G.player.group.visible = false;
  G.player.pos.set(x, 0, z);
  G.player.camYaw = Math.PI / 2;
  return car;
}

/** A Bay PD cruiser that chases the player, placed behind them on the same road. */
function spawnPoliceCar(G, x, z) {
  const { group } = createCarMesh(0x1d3fae, { police: true });
  group.position.set(x, 0, z);
  G.scene.add(group);
  const car = { group, kind: 'police', speed: 20, yaw: Math.PI / 2, chase: true };
  G.cars.push(car);
  return car;
}

/**
 * Stage the named scene and return how many fixed steps to run before the shot.
 * 'start' shows the title screen over a slow orbit of the city; the others play.
 */
export function stageShot(name, G) {
  G.screen = 'play';
  G.hud.hideOverlays();
  // The HUD starts hidden (it is only shown by startGame); in-game shots need it visible.
  if (name !== 'start') document.getElementById('hud').classList.remove('hidden');
  if (name === 'start') {
    G.screen = 'title';
    document.getElementById('title-screen').classList.remove('hidden');
    G.shotOrbit = true;
    return 0;
  }
  if (name === 'street') {
    G.player.pos.set(2, 0, 44);
    G.player.camYaw = Math.PI * 0.85;
    G.player.group.position.copy(G.player.pos);
    G.hud.setObjective('Explore Solmar Bay — steal a car with E, or follow the yellow marker');
    G.mission.beacon.setPosition(88, -88);
    G.mission.beacon.setVisible(true);
    G.shotDrive = null;
    return 200;
  }
  if (name === 'chase') {
    startMission(G, 2);
    G.player.money = 850;
    putPlayerInCar(G, -40, 0, 0xc23b2e);
    G.player.inCar.speed = 26;
    G.player.wanted = 3;
    G.player.wantedTimer = 30;
    // Trail 6 and 12 units behind; with the shot speed cap they hold that
    // gap for the whole 5 s instead of ramming the getaway car, and both
    // cruisers stay inside the south camera's frame.
    spawnPoliceCar(G, -46, 3);
    spawnPoliceCar(G, -52, -3);
    G.shotPoliceGap = true;
    // Side view from the south (camera due south of the car, looking north):
    // the getaway car reads in profile driving right, and the cruisers trail
    // visibly to its left instead of hiding behind it. (camYaw easing in
    // main.js turns player.camYaw -PI/2 into camera yaw PI.)
    G.player.camYaw = -Math.PI / 2;
    // Roadside palms stand at z = +/-8, right between this camera and the
    // road; one next to the lens filled the old frame with trunk and canopy.
    // Hide the palms flanking this stretch for the shot only (palm colours
    // are unique to trunks/leaves, so nothing else is touched).
    G.scene.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.color) return;
      const c = o.material.color.getHex();
      if (c !== 0x6b4a2f && c !== 0x2f7a3a) return;
      const p = o.position;
      if (p.x > -90 && p.x < 140 && p.z > -20 && p.z < 20) o.visible = false;
    });
    // Clear the chase corridor of traffic and parked cars placed there at
    // init (a parked green car sits right in front of the getaway car);
    // shot only, cars elsewhere in the city stay visible.
    for (const c of G.cars) {
      if (c.kind !== 'traffic' && c.kind !== 'parked') continue;
      const p = c.group.position;
      if (p.x > -90 && p.x < 140 && Math.abs(p.z) < 12) c.group.visible = false;
    }
    G.shotDrive = { forward: 1, strafe: 0, seconds: 6 };
    return 300;
  }
  if (name === 'combat') {
    startMission(G, 3);
    G.mission.step = 1;
    G.mission.killed = 1;
    G.player.money = 1250;
    G.player.health = 78;
    G.player.wanted = 2;
    G.player.wantedTimer = 30;
    G.player.pos.set(-72, 0, -38);
    // Face the guards: they spawn around (-88, -44), i.e. direction (-16, -6)
    // from the player, which is yaw atan2(-16, -6) ≈ -1.93 rad (≈ 1.385π).
    G.player.camYaw = Math.PI * 1.385;
    G.player.group.position.copy(G.player.pos);
    G.enemies = spawnGuards(G.scene, [-88, 0, -44], 4);
    G.enemies[0].health = 0;
    G.enemies[0].bar.scale.x = 0;
    G.enemies[0].group.rotation.x = Math.PI / 2;
    G.enemies[0].group.position.y = 0.3;
    G.hud.setObjective('Clear the warehouse guards (1/4)');
    G.shotDrive = null;
    G.shotFireAt = 100;
    return 150;
  }
  return stageShot('street', G);
}
