// Solmar Bay — every tuning number, colour and mission in one place.
// A sun-soaked coastal city of grid streets, built procedurally from a seed.

export const CITY = {
  blocks: 6, // 6 x 6 blocks of buildings
  blockSize: 44, // centre-to-centre distance of intersections
  roadWidth: 12,
  sidewalk: 3,
  maxBuildingHeight: 42,
  minBuildingHeight: 8,
};

export const STEP = 1 / 60;

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 12,
  health: 100,
  punchDamage: 25,
  punchRange: 2.2,
  punchCooldown: 0.45,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 14,
  maxSpeed: 42,
  maxReverse: 12,
  steer: 0.55,
  grip: 6,
};

export const WANTED = {
  stealCar: 1,
  hitPed: 1,
  hitCar: 1,
  shoot: 1,
  killCop: 1,
  decaySeconds: 18,
  maxStars: 5,
};

export const SAVE_KEY = 'solmar-bay.save.v1';

export const PALETTE = {
  skyTop: 0x2e4a7a,
  skyHorizon: 0xff9a5c,
  sun: 0xffd27a,
  ground: 0x3a3f46,
  road: 0x2c2f36,
  roadLine: 0xd8d3c0,
  sidewalk: 0x8f8a80,
  building: [0x9a7b5f, 0x7d8aa0, 0xb08d6a, 0x6f7f8f, 0xa89080, 0x8a6f7d],
  windowLit: 0xffd98a,
  windowDark: 0x2a3242,
  palmTrunk: 0x6b4a2f,
  palmLeaf: 0x2f7a3a,
  water: 0x1d5f7a,
  taxi: 0xf2c200,
  police: 0x1d3fae,
  player: 0x4fc3f7,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Mulberry32: a tiny seeded random generator, so one seed always builds one city. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Missions of the Solmar Bay story, in order. Money is in Solmar dollars. */
export const MISSIONS = [
  {
    id: 'taxi',
    title: 'Taxi Rush',
    giver: 'Lena',
    briefing: 'My cousin drives a cab and the fare is late. Take the yellow cab by the pier and get the client to the Grand Solmar hotel — fast, but in one piece.',
    reward: 300,
    steps: [
      { type: 'enterCar', car: 'taxi', text: 'Get in the yellow taxi by the pier' },
      { type: 'driveTo', pos: [88, 0, -88], radius: 7, time: 75, text: 'Drive the client to the Grand Solmar hotel' },
    ],
  },
  {
    id: 'courier',
    title: 'Courier Run',
    giver: 'Marco',
    briefing: 'Three parcels, three drop-offs, no questions. The city is watching, so keep it clean — or don\'t. Your call.',
    reward: 250,
    steps: [
      { type: 'goto', pos: [-88, 0, 44], radius: 5, text: 'Drop off parcel 1 — the blue kiosk' },
      { type: 'goto', pos: [44, 0, 88], radius: 5, text: 'Drop off parcel 2 — the marina gate' },
      { type: 'goto', pos: [-44, 0, -88], radius: 5, text: 'Drop off parcel 3 — the old arcade' },
    ],
  },
  {
    id: 'chase',
    title: 'The Chase',
    giver: 'Lena',
    briefing: 'The Bay PD knows your face now. Lose them. Get to the safehouse on Coral Street and stay out of sight until the heat dies down.',
    reward: 400,
    steps: [
      { type: 'setWanted', stars: 2, text: 'The police are onto you — run!' },
      { type: 'goto', pos: [0, 0, -44], radius: 6, text: 'Reach the safehouse on Coral Street' },
      { type: 'evade', seconds: 10, text: 'Stay out of sight until the heat dies down' },
    ],
  },
  {
    id: 'rescue',
    title: 'Rescue Rico',
    giver: 'Marco',
    briefing: 'They grabbed Rico and locked him in the warehouse by the docks. Go in loud, get him out, and bring him home. The crew owes you one.',
    reward: 600,
    steps: [
      { type: 'goto', pos: [-88, 0, -44], radius: 6, text: 'Reach the dock warehouse' },
      { type: 'kill', count: 4, area: [-88, 0, -44], radius: 18, text: 'Clear the warehouse guards (0/4)' },
      { type: 'goto', pos: [-88, 0, -44], radius: 4, text: 'Reach Rico' },
      { type: 'driveTo', pos: [0, 0, -44], radius: 7, text: 'Drive Rico to the safehouse' },
    ],
  },
  {
    id: 'heist',
    title: 'The Big Score',
    giver: 'Lena',
    briefing: 'One last job. The Solmar Reserve Bank. Grab the cash, hold E at the vault, and get to the boat at the marina. After this, we\'re legends — or ghosts.',
    reward: 1500,
    steps: [
      { type: 'goto', pos: [88, 0, 44], radius: 6, text: 'Reach the Solmar Reserve Bank' },
      { type: 'hold', seconds: 3, pos: [88, 0, 44], radius: 5, text: 'Hold E at the vault to grab the cash' },
      { type: 'setWanted', stars: 4, text: 'Four stars! Get to the boat!' },
      { type: 'driveTo', pos: [-110, 0, 110], radius: 8, text: 'Escape to the boat at the marina' },
    ],
  },
];

export const STORY_INTRO =
  'Solmar Bay, 2026. You are Alex Vane, a driver with nothing to lose and a city that owes you everything. ' +
  'Lena and Marco have a plan — five jobs, one big score. Steal cars, outrun the Bay PD, and take back the city, one sunset at a time.';
