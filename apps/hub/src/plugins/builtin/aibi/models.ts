import type {
  ModelMatch,
  ModelSpec,
  ModelSpecChannel,
  ModelSpecCondition,
} from '@smarteverything/domain';

const WIDTH = 0.0488;
const HEIGHT = 0.0667;
const DEPTH = 0.0355;
const BODY_W = 0.042;
const BODY_H = 0.03;
const BODY_D = 0.031;
const NECK_H = 0.0035;
const HEAD_H = HEIGHT - BODY_H - NECK_H;
const HEAD_Y = BODY_H + NECK_H + HEAD_H / 2;
const FACE_W = 0.04;
const FACE_H = 0.026;
const FRONT = DEPTH / 2;
const EYE_X = 0.0085;
const EYE_BLUE = '#5FD4F4';
const LISTEN_BLUE = '#7FA8FF';
const WORRY_AMBER = '#F2A04E';
const POSE = { type: 'pose', easeMs: 400 } as const;
const GLOW = { type: 'pose', easeMs: 300 } as const;

const HOUSE = { yaw: 24, pitch: 12, fov: 28, padding: 0.12, focus: 'head' } as const;

const TALKING: ModelSpecCondition = {
  anyOf: [
    {
      allOf: [
        { signal: 'online', op: 'eq', value: true },
        { signal: 'phase', op: 'eq', value: 'speaking' },
      ],
    },
    {
      allOf: [
        { signal: 'online', op: 'eq', value: true },
        { signal: 'phase', op: 'eq', value: 'listening' },
      ],
    },
  ],
};

const EYE = {
  type: 'roundedBox',
  width: 0.0072,
  height: 0.0105,
  depth: 0.0008,
  radius: 0.0032,
  segments: 4,
} as const;

const MIC = { type: 'cylinder', height: 0.0004, topRadius: 0.0005, bottomRadius: 0.0005 } as const;

function eyeChannels(eye: string): ModelSpecChannel[] {
  return [
    {
      id: `${eye}Mood`,
      target: eye,
      property: 'emissive',
      source: 'phase',
      map: {
        type: 'enum',
        table: { awake: 1.1, listening: 1.25, worried: 1, asleep: 0.12 },
      },
      motion: GLOW,
      reduced: 'hold',
    },
    {
      id: `${eye}Speak`,
      target: eye,
      property: 'emissive',
      source: 'phase',
      map: { type: 'enum', table: { speaking: 1.3 } },
      motion: { type: 'pulse', periodS: 0.6, amplitude: 0.35 },
      reduced: 'hold',
    },
  ];
}

function eyeLookChannels(eye: string): ModelSpecChannel[] {
  return [
    {
      id: `${eye}Tint`,
      target: eye,
      property: 'colour',
      source: 'phase',
      map: {
        type: 'enum',
        table: {
          awake: EYE_BLUE,
          speaking: EYE_BLUE,
          listening: LISTEN_BLUE,
          worried: WORRY_AMBER,
          asleep: EYE_BLUE,
        },
      },
      motion: { type: 'pose', easeMs: 250 },
      reduced: 'hold',
    },
    {
      id: `${eye}Lid`,
      target: eye,
      property: 'scale',
      axis: 'y',
      source: 'phase',
      map: {
        type: 'enum',
        table: { awake: 1, speaking: 1, listening: 1.12, worried: 0.7, asleep: 0.22 },
      },
      motion: POSE,
      reduced: 'hold',
    },
    {
      id: `${eye}Off`,
      target: eye,
      property: 'emissive',
      source: 'online',
      map: { type: 'enum', table: { false: 0 } },
      motion: { type: 'pose', easeMs: 450 },
      reduced: 'hold',
    },
  ];
}

const HEAD_CHANNELS: ModelSpecChannel[] = [
  {
    id: 'headTilt',
    target: 'neck',
    property: 'rotate',
    axis: 'z',
    source: 'phase',
    map: {
      type: 'enum',
      table: { awake: 0, speaking: 0, listening: 9, worried: -7, asleep: 0 },
    },
    motion: POSE,
    reduced: 'hold',
  },
  {
    id: 'headNod',
    target: 'neck',
    property: 'rotate',
    axis: 'x',
    source: 'phase',
    map: {
      type: 'enum',
      table: { awake: 0, speaking: -4, listening: -6, worried: 8, asleep: 14 },
    },
    motion: POSE,
    reduced: 'hold',
  },
  {
    id: 'headTalk',
    target: 'neck',
    property: 'rotate',
    axis: 'y',
    source: 'phase',
    map: { type: 'enum', table: { speaking: 1 } },
    motion: { type: 'oscillate', limits: [-6, 6], speed: 20 },
    reduced: 'hold',
  },
];

const MICS: ModelSpec['parts'] = [-0.006, 0, 0.006].map((x, index) => ({
  id: `mic${String(index + 1)}`,
  parent: 'head',
  geometry: MIC,
  material: 'face',
  transform: { position: [x, HEAD_H / 2 + 0.0001, -0.004] },
  minLod: 2,
}));

export const AIBI_POCKET_MODEL: ModelSpec = {
  schema: 1,
  id: 'dev.robot.aibi-pocket',
  version: '1.0.0',
  title: 'AIBI Pocket',
  category: 'robot',
  family: 'robot',
  footprint: { width: WIDTH, depth: DEPTH, height: HEIGHT },
  framing: {
    tile: { ...HOUSE, padding: 0.08 },
    card: HOUSE,
    hero: { ...HOUSE, yaw: 20, padding: 0.14 },
  },
  shots: [
    {
      id: 'talking',
      when: TALKING,
      focus: 'face',
      zoom: 1.4,
      yaw: 14,
      pitch: 8,
      easeMs: 800,
      loopS: 1.2,
      symmetry: 360,
      stillAt: 0.3,
    },
  ],
  meta: {
    names: {
      display: 'AIBI Pocket',
      synonyms: ['AIBI', 'AIBI robot', 'pocket pet', 'desk robot', 'robot pet'],
    },
    sizeClass: 'small',
    aliases: ['AIBI robot'],
  },
  materials: {
    shell: { finish: 'warm-white', roughness: 0.35, clearcoat: 0.5 },
    face: { finish: 'satin-black', roughness: 0.12, clearcoat: 0.9 },
    trim: { finish: 'graphite' },
    accent: { color: '#1E4A55', roughness: 0.2 },
  },
  finishes: { cream: {} },
  defaultFinish: 'cream',
  parts: [
    {
      id: 'body',
      geometry: {
        type: 'roundedBox',
        width: BODY_W,
        height: BODY_H,
        depth: BODY_D,
        radius: 0.0115,
        segments: 6,
      },
      material: 'shell',
      transform: { position: [0, BODY_H / 2, 0] },
      contact: true,
    },
    {
      id: 'backWindow',
      parent: 'body',
      geometry: { type: 'roundedPlane', width: 0.012, height: 0.006, radius: 0.0025, segments: 6 },
      material: 'face',
      transform: { position: [0, 0.004, -BODY_D / 2 - 0.0002], rotation: [0, 180, 0] },
      minLod: 2,
    },
    {
      id: 'neck',
      geometry: {
        type: 'cylinder',
        height: NECK_H + 0.002,
        topRadius: 0.0085,
        bottomRadius: 0.0095,
        bevel: 0.0006,
        segments: 48,
      },
      material: 'trim',
      transform: { position: [0, BODY_H + NECK_H / 2, 0] },
    },
    {
      id: 'head',
      parent: 'neck',
      geometry: {
        type: 'roundedBox',
        width: WIDTH,
        height: HEAD_H,
        depth: DEPTH,
        radius: 0.0125,
        segments: 6,
      },
      material: 'shell',
      transform: { position: [0, HEAD_Y - BODY_H - NECK_H / 2, 0] },
    },
    {
      id: 'face',
      parent: 'head',
      geometry: {
        type: 'roundedPlane',
        width: FACE_W,
        height: FACE_H,
        radius: 0.0085,
        segments: 8,
      },
      material: 'face',
      transform: { position: [0, -0.0005, FRONT + 0.0002] },
    },
    {
      id: 'eyeLeft',
      parent: 'face',
      geometry: EYE,
      material: 'accent',
      transform: { position: [-EYE_X, 0.0005, 0.0003] },
    },
    {
      id: 'eyeRight',
      parent: 'face',
      geometry: EYE,
      material: 'accent',
      transform: { position: [EYE_X, 0.0005, 0.0003] },
    },
    {
      id: 'lensRing',
      parent: 'head',
      geometry: { type: 'ring', innerRadius: 0.0016, outerRadius: 0.0026, segments: 32 },
      material: 'trim',
      transform: { position: [0, HEAD_H / 2 - 0.0042, FRONT + 0.0003] },
      minLod: 1,
    },
    {
      id: 'lens',
      parent: 'lensRing',
      geometry: {
        type: 'sphere',
        radius: 0.0016,
        thetaLength: 90,
        segments: 24,
      },
      material: 'face',
      transform: { rotation: [90, 0, 0] },
      minLod: 1,
    },
    {
      id: 'touchPad',
      parent: 'head',
      geometry: { type: 'roundedPlane', width: 0.02, height: 0.012, radius: 0.005, segments: 6 },
      material: 'trim',
      transform: { position: [0, HEAD_H / 2 + 0.0002, 0.003], rotation: [-90, 0, 0] },
      minLod: 2,
    },
    ...MICS,
  ],
  anchors: [
    { kind: 'screen', id: 'eyeScreen', parent: 'face', width: FACE_W, height: FACE_H },
    {
      kind: 'emitter',
      id: 'eyeGlow',
      parent: 'face',
      position: [0, 0, 0.003],
      color: EYE_BLUE,
      intensity: 0.6,
      radius: 0.03,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, HEIGHT + 0.012, 0] },
    { kind: 'hit', id: 'robot', position: [0, HEIGHT / 2, 0], size: [WIDTH, HEIGHT, DEPTH] },
  ],
  channels: [
    ...eyeChannels('eyeLeft'),
    ...eyeLookChannels('eyeLeft'),
    ...eyeChannels('eyeRight'),
    ...eyeLookChannels('eyeRight'),
    ...HEAD_CHANNELS,
  ],
  states: {
    off: { online: false },
    on: { online: true, phase: 'awake' },
    listening: { online: true, phase: 'listening' },
    speaking: { online: true, phase: 'speaking' },
    worried: { online: true, phase: 'worried' },
    asleep: { online: true, phase: 'asleep' },
  },
};

export const AIBI_MODELS: readonly ModelSpec[] = [AIBI_POCKET_MODEL];

export const AIBI_MODEL_MATCH: Partial<ModelMatch> = { exact: ['AIBI robot'] };
