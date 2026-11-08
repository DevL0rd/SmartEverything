import type { ModelSpec } from '@smarteverything/domain';

type Part = ModelSpec['parts'][number];

export const FRONT = 0.285;
export const DOOR_Y = 0.39;
export const PANEL_Y = 0.785;
export const PROGRESS_SEGMENTS = 18;

const DOOR_Z = 0.296;
const HINGE_X = -0.216;
const OPEN_DEG = 100;
const ARC_RADIUS = 0.244;
const RAD = Math.PI / 180;
const OPEN_X = HINGE_X + -HINGE_X * Math.cos(OPEN_DEG * RAD);
const OPEN_Z = DOOR_Z + -HINGE_X * Math.sin(OPEN_DEG * RAD);

const LIFTERS = [90, 210, 330].map((angle, index): Part => ({
  id: `lifter${String(index + 1)}`,
  parent: 'drum',
  geometry: {
    type: 'roundedBox',
    width: 0.06,
    height: 0.018,
    depth: 0.026,
    radius: 0.006,
    segments: 3,
  },
  material: 'metal',
  transform: {
    position: [0.135 * Math.cos(angle * RAD), 0.011, 0.135 * Math.sin(angle * RAD)],
    rotation: [0, -angle, 0],
  },
  minLod: 1,
}));

const CLOTHES: readonly (readonly [x: number, y: number, z: number, turn: number])[] = [
  [-0.052, 0.02, 0.088, 18],
  [0.058, 0.022, 0.08, -24],
  [0.004, 0.026, 0.112, 4],
];

const LAUNDRY = CLOTHES.map(([x, y, z, turn], index): Part => ({
  id: `laundry${String(index + 1)}`,
  parent: 'drum',
  geometry: { type: 'sphere', radius: 0.052, segments: 24 },
  material: 'body',
  transform: { position: [x, y, z], rotation: [0, turn, 0], scale: [1.3, 0.3, 0.75] },
  minLod: 1,
}));

const FEET = [-0.26, 0.26].flatMap((x) =>
  [-0.24, 0.24].map((z): Part => ({
    id: `foot${x < 0 ? 'Left' : 'Right'}${z < 0 ? 'Back' : 'Front'}`,
    geometry: {
      type: 'cylinder',
      height: 0.01,
      topRadius: 0.018,
      bottomRadius: 0.016,
      segments: 24,
    },
    material: 'metal',
    transform: { position: [x, 0.005, z] },
    minLod: 2,
  })),
);

export function progressAngle(index: number): number {
  return 90 - ((index + 0.5) * 360) / PROGRESS_SEGMENTS;
}

const PROGRESS_ARCS: Part = {
  id: 'progressArcs',
  geometry: { type: 'sphere', radius: 0.0005, segments: 6 },
  material: 'accent',
};

const PROGRESS = Array.from({ length: PROGRESS_SEGMENTS }, (_, index): Part => ({
  id: `progress${String(index + 1)}`,
  parent: 'progressArcs',
  geometry: { type: 'roundedPlane', width: 0.07, height: 0.012, radius: 0.006, segments: 4 },
  material: 'accent',
  transform: {
    position: [
      ARC_RADIUS * Math.cos(progressAngle(index) * RAD),
      DOOR_Y + ARC_RADIUS * Math.sin(progressAngle(index) * RAD),
      FRONT + 0.0012,
    ],
    rotation: [0, 0, progressAngle(index) - 90],
  },
}));

const DOOR_PARTS: ModelSpec['parts'] = [
  {
    id: 'door',
    geometry: { type: 'torus', radius: 0.19, tube: 0.026, segments: 64 },
    material: 'metal',
    transform: { position: [0, DOOR_Y, DOOR_Z] },
    poses: {
      closed: { position: [0, DOOR_Y, DOOR_Z], rotation: [0, 0, 0] },
      open: { position: [OPEN_X, DOOR_Y, OPEN_Z], rotation: [0, -OPEN_DEG, 0] },
    },
  },
  {
    id: 'doorGlass',
    parent: 'door',
    geometry: { type: 'sphere', radius: 0.3, thetaLength: 34.5, segments: 48 },
    material: 'glass',
    transform: { position: [0, 0, -0.3 * Math.cos(34.5 * RAD)], rotation: [90, 0, 0] },
  },
  {
    id: 'doorLip',
    parent: 'door',
    geometry: { type: 'torus', radius: 0.166, tube: 0.007, segments: 48 },
    material: 'body',
    transform: { position: [0, 0, 0.004] },
    minLod: 1,
  },
];

const PANEL_PARTS: ModelSpec['parts'] = [
  {
    id: 'panelBacking',
    parent: 'cabinet',
    geometry: { type: 'roundedPlane', width: 0.35, height: 0.082, radius: 0.014, segments: 4 },
    material: 'glass',
    transform: { position: [0.07, PANEL_Y - 0.43, FRONT + 0.0006] },
  },
  {
    id: 'panel',
    parent: 'cabinet',
    geometry: { type: 'roundedPlane', width: 0.34, height: 0.074, radius: 0.012, segments: 4 },
    material: 'glass',
    transform: { position: [0.07, PANEL_Y - 0.43, FRONT + 0.0018] },
  },
  {
    id: 'lockDot',
    parent: 'cabinet',
    geometry: {
      type: 'cylinder',
      height: 0.001,
      topRadius: 0.004,
      bottomRadius: 0.004,
      segments: 24,
    },
    material: 'accent',
    transform: { position: [0.215, PANEL_Y - 0.43, FRONT + 0.003], rotation: [90, 0, 0] },
    minLod: 1,
  },
  {
    id: 'drawer',
    parent: 'cabinet',
    geometry: {
      type: 'roundedBox',
      width: 0.17,
      height: 0.074,
      depth: 0.006,
      radius: 0.003,
      segments: 3,
    },
    material: 'body',
    transform: { position: [-0.19, PANEL_Y - 0.43, FRONT + 0.002] },
    minLod: 1,
  },
];

const DRUM_PARTS: ModelSpec['parts'] = [
  {
    id: 'drum',
    geometry: {
      type: 'cylinder',
      height: 0.006,
      topRadius: 0.175,
      bottomRadius: 0.175,
      segments: 96,
    },
    material: 'metal',
    transform: { position: [0, DOOR_Y, FRONT + 0.0025], rotation: [90, 0, 0] },
  },
  ...LIFTERS,
  ...LAUNDRY,
  {
    id: 'water',
    geometry: {
      type: 'extrude',
      path: [
        { op: 'move', x: -0.1537, y: -0.06 },
        { op: 'arc', rx: 0.165, ry: 0.165, large: false, sweep: false, x: 0.1537, y: -0.06 },
        { op: 'line', x: -0.1537, y: -0.06 },
      ],
      depth: 0.002,
    },
    material: 'accent',
    transform: { position: [0, DOOR_Y, FRONT - 0.004] },
    poses: {
      empty: { position: [0, DOOR_Y, FRONT - 0.004] },
      high: { position: [0, DOOR_Y, FRONT + 0.006] },
      medium: { position: [0, DOOR_Y - 0.018, FRONT + 0.006] },
      low: { position: [0, DOOR_Y - 0.04, FRONT + 0.006] },
    },
    minLod: 1,
  },
];

const CABINET: Part = {
  id: 'cabinet',
  geometry: {
    type: 'roundedBox',
    width: 0.598,
    height: 0.84,
    depth: 0.57,
    radius: 0.022,
    segments: 5,
  },
  material: 'body',
  transform: { position: [0, 0.43, 0] },
  contact: true,
};

export const LAUNDRY_PARTS: ModelSpec['parts'] = [
  CABINET,
  ...PANEL_PARTS,
  PROGRESS_ARCS,
  ...PROGRESS,
  ...DRUM_PARTS,
  ...DOOR_PARTS,
  ...FEET,
];
