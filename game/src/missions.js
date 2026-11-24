// The Solmar Bay story: five missions, each a short list of steps. A step is a small job —
// walk somewhere, drive somewhere, get in a car, clear the guards, hold E at the vault, or
// lose the police — and the beacon in the world plus the objective line always say what is
// next. Finishing a mission pays out, saves the game and opens the next one.
import { MISSIONS } from './config.js';
import { createBeacon, createPersonMesh } from './world.js';
import { spawnGuards } from './combat.js';

const THREE = window.THREE;

export function createMissionState(scene) {
  return {
    index: 0,
    step: 0,
    active: false,
    stepTimer: 0,
    evadeTimer: 0,
    holdTimer: 0,
    killed: 0,
    beacon: createBeacon(scene, 0xf2c200),
    rico: null,
    finished: false,
  };
}

function currentStep(mission) {
  const def = MISSIONS[mission.index];
  return def ? def.steps[mission.step] : null;
}

function stepPos(step) {
  return step.pos ? new THREE.Vector3(step.pos[0], 0, step.pos[2]) : null;
}

export function startMission(G, index) {
  const mission = G.mission;
  mission.index = index;
  mission.step = 0;
  mission.active = true;
  mission.stepTimer = 0;
  mission.evadeTimer = 0;
  mission.holdTimer = 0;
  mission.killed = 0;
  const def = MISSIONS[index];
  G.hud.showDialogue(def.giver, def.briefing);
  G.hud.showToast(`Mission: ${def.title} — $${def.reward}`);
  beginStep(G);
}

function beginStep(G) {
  const mission = G.mission;
  const step = currentStep(mission);
  if (!step) {
    completeMission(G);
    return;
  }
  mission.stepTimer = step.time || 0;
  mission.holdTimer = 0;
  const pos = stepPos(step);
  if (pos) mission.beacon.setPosition(pos.x, pos.z);
  mission.beacon.setVisible(!!pos);
  if (step.type === 'setWanted') {
    G.player.wanted = Math.max(G.player.wanted, step.stars);
    G.player.wantedTimer = 30;
    advanceStep(G);
    return;
  }
  if (step.type === 'kill') {
    G.enemies = spawnGuards(G.scene, step.area, step.count);
    mission.killed = 0;
  }
  if (step.type === 'goto' && mission.index === 3 && mission.step === 2) {
    spawnRico(G);
  }
  if (step.type === 'driveTo' && mission.index === 3 && mission.step === 3 && mission.rico) {
    G.scene.remove(mission.rico.group);
    mission.rico = null;
    G.hud.showDialogue('Rico', 'You came for me! Let\'s get out of here — drive!');
  }
  if (step.type === 'evade') mission.evadeTimer = step.seconds;
  G.hud.setObjective(step.text);
}

function advanceStep(G) {
  const mission = G.mission;
  mission.step += 1;
  if (G.audio) G.audio.blip();
  beginStep(G);
}

function completeMission(G) {
  const mission = G.mission;
  const def = MISSIONS[mission.index];
  G.player.money += def.reward;
  mission.beacon.setVisible(false);
  mission.active = false;
  G.hud.setObjective('Mission complete!');
  G.hud.showToast(`Mission complete: ${def.title} — +$${def.reward}`);
  if (G.audio) G.audio.pickup();
  G.saveGame();
  if (mission.index >= MISSIONS.length - 1) {
    mission.finished = true;
    G.screen = 'win';
    G.hud.showWin(G.player.money);
    return;
  }
  mission.index += 1;
  mission.step = 0;
  window.setTimeout(() => {
    if (G.screen === 'play') startMission(G, mission.index);
  }, 2500);
}

function distanceTo(player, pos) {
  return Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
}

/** Advance the active mission one step. Call every fixed step while playing. */
export function updateMissions(G, dt) {
  const mission = G.mission;
  if (!mission.active) return;
  const step = currentStep(mission);
  if (!step) return;
  const player = G.player;
  const pos = stepPos(step);

  if (step.time) {
    mission.stepTimer -= dt;
    G.hud.setObjective(`${step.text} — ${Math.max(0, Math.ceil(mission.stepTimer))}s`);
    if (mission.stepTimer <= 0) {
      G.hud.showToast('Too slow — try the mission again');
      mission.active = false;
      mission.beacon.setVisible(false);
      G.hud.setObjective('Mission failed — walk to the yellow marker to retry');
      window.setTimeout(() => {
        if (G.screen === 'play' && !G.mission.active) startMission(G, mission.index);
      }, 3000);
      return;
    }
  }

  if (step.type === 'goto' || step.type === 'driveTo') {
    if (distanceTo(player, pos) < step.radius) {
      if (step.type === 'driveTo' && !player.inCar) {
        G.hud.setObjective(`${step.text} — get in a car!`);
        return;
      }
      advanceStep(G);
    }
  } else if (step.type === 'enterCar') {
    if (player.inCar) advanceStep(G);
  } else if (step.type === 'kill') {
    const alive = G.enemies.filter((e) => e.health > 0).length;
    const killed = step.count - alive;
    if (killed !== mission.killed) {
      mission.killed = killed;
      G.hud.setObjective(`Clear the warehouse guards (${killed}/${step.count})`);
    }
    if (alive === 0) advanceStep(G);
  } else if (step.type === 'hold') {
    const holding = G.input.held('KeyE') && distanceTo(player, pos) < step.radius;
    if (holding) {
      mission.holdTimer += dt;
      G.hud.setObjective(`Grabbing the cash… ${Math.ceil(step.seconds - mission.holdTimer)}s (hold E)`);
      if (mission.holdTimer >= step.seconds) advanceStep(G);
    } else {
      mission.holdTimer = 0;
    }
  } else if (step.type === 'evade') {
    if (player.wanted === 0) {
      mission.evadeTimer -= dt;
      G.hud.setObjective(`Stay out of sight — ${Math.max(0, Math.ceil(mission.evadeTimer))}s`);
      if (mission.evadeTimer <= 0) advanceStep(G);
    } else {
      mission.evadeTimer = step.seconds;
      G.hud.setObjective('Lose the police first!');
    }
  }
  mission.beacon.update(G.time);
}

/** Rico, the crew member to rescue in mission four: a green-shirted friend by the warehouse. */
export function spawnRico(G) {
  const mesh = createPersonMesh(0x3a7a3a, 0x2a2a30);
  mesh.group.position.set(-88, 0, -44);
  G.scene.add(mesh.group);
  G.mission.rico = { group: mesh.group, legs: mesh.legs, arms: mesh.arms };
  return G.mission.rico;
}
