import type {
  ModelSpec,
  ModelSpecAnchor,
  ModelSpecChannel,
  ModelSpecMaterial,
  ModelSpecPart,
} from '@smarteverything/domain';
import { box, part, type Place } from '../../helpers/geometry';
import { ACCENT, WARNING, leaf, look, puck, pulse, shot, whenAll, type Vec } from '../energy/kit';

export const IR = '#6FB7FF';
export const COOL = '#5ED3CF';
export const WARM = '#F2B45E';
export const POWER = '#F2716A';

export interface Handset {
  readonly length: number;
  readonly width: number;
  readonly height: number;
}

export interface Face {
  readonly at: (fromNose: number, across: number, lift?: number) => Vec;
  readonly top: number;
}

export function faceOf({ length, height }: Handset): Face {
  return {
    top: height,
    at: (fromNose, across, lift = 0) => [length / 2 - fromNose, height + lift, across],
  };
}

export function shellParts({ length, width, height }: Handset): ModelSpecPart[] {
  const nose = length / 2;
  return [
    box('shell', [length, height, width, height * 0.46], 'body', {
      at: [0, height / 2, 0],
      contact: true,
      segments: 5,
    }),
    box('grip', [length * 0.42, height * 0.5, width * 0.82, height * 0.24], 'body', {
      at: [-length * 0.24, height * 0.2, 0],
      minLod: 1,
    }),
    box('window', [height * 0.5, height * 0.62, width * 0.56, height * 0.22], 'glass', {
      at: [nose - height * 0.16, height * 0.54, 0],
    }),
    box('nose', [height * 0.12, height * 0.34, width * 0.34, height * 0.1], 'accent', {
      at: [nose + height * 0.1, height * 0.54, 0],
    }),
    part(
      'beam',
      { type: 'glow', width: length * 0.3, height: width * 1.4, segments: 16 },
      'accent',
      {
        transform: { position: [nose + length * 0.14, 0.0012, 0], rotation: [-90, 0, 0] },
        minLod: 1,
      },
    ),
    box('seam', [length * 0.96, height * 0.06, width * 0.98, height * 0.03], 'glass', {
      at: [0, height * 0.42, 0],
      minLod: 2,
    }),
  ];
}

export function key(
  id: string,
  [radius, at]: readonly [number, Vec],
  material = 'keys',
  place: Omit<Place, 'at'> = {},
): ModelSpecPart {
  return puck(id, [radius, 0.0026, 0.0009], material, {
    at: [at[0], at[1] + 0.0011, at[2]],
    segments: 24,
    ...place,
  });
}

export function pill(
  id: string,
  [width, depth, at]: readonly [number, number, Vec],
  material = 'keys',
  place: Omit<Place, 'at'> = {},
): ModelSpecPart {
  return box(id, [width, 0.0028, depth, Math.min(width, depth) * 0.45], material, {
    at: [at[0], at[1] + 0.0012, at[2]],
    ...place,
  });
}

export function plate(
  id: string,
  [width, depth, at]: readonly [number, number, Vec],
  place: Omit<Place, 'at'> = {},
): ModelSpecPart {
  return part(
    id,
    {
      type: 'roundedPlane',
      width,
      height: depth,
      radius: Math.min(width, depth) * 0.3,
      segments: 3,
    },
    'accent',
    {
      ...place,
      transform: { position: [at[0], at[1] + 0.0004, at[2]], rotation: [-90, 0, 0] },
    },
  );
}

export function halo(
  id: string,
  [inner, outer, at]: readonly [number, number, Vec],
  place: Omit<Place, 'at'> = {},
): ModelSpecPart {
  return part(
    id,
    { type: 'ring', innerRadius: inner, outerRadius: outer, segments: 48 },
    'accent',
    {
      ...place,
      transform: { position: [at[0], at[1] + 0.0004, at[2]], rotation: [-90, 0, 0] },
    },
  );
}

export function dpad(prefix: string, [radius, at]: readonly [number, Vec]): ModelSpecPart[] {
  return [
    part(
      `${prefix}Ring`,
      {
        type: 'cylinder',
        height: 0.0026,
        topRadius: radius,
        bottomRadius: radius,
        bevel: 0.0009,
        segments: 40,
      },
      'keys',
      { transform: { position: [at[0], at[1] + 0.0011, at[2]] } },
    ),
    key(`${prefix}Ok`, [radius * 0.42, [at[0], at[1] + 0.0009, at[2]]], 'body'),
    halo(`${prefix}Halo`, [radius * 1.04, radius * 1.16, at]),
    ...[0, 90, 180, 270].map((angle, index) =>
      box(
        `${prefix}Arrow${String(index)}`,
        [radius * 0.16, 0.0008, radius * 0.16, 0.0003],
        'glass',
        {
          at: [
            at[0] + Math.cos((angle * Math.PI) / 180) * radius * 0.72,
            at[1] + 0.0025,
            at[2] + Math.sin((angle * Math.PI) / 180) * radius * 0.72,
          ],
          transform: { rotation: [0, 45, 0] },
          minLod: 2,
        },
      ),
    ),
  ];
}

export function grid(
  prefix: string,
  [columns, rows, pitch]: readonly [readonly number[], readonly number[], number],
  face: Face,
): ModelSpecPart[] {
  return rows.flatMap((fromNose, row) =>
    columns.map((across, column) =>
      key(
        `${prefix}${String(row * columns.length + column)}`,
        [pitch, face.at(fromNose, across)],
        'keys',
        { minLod: 1, segments: 16 },
      ),
    ),
  );
}

export function lit(id: string, colour: string, level = 0.9): ModelSpecChannel[] {
  return [
    look(`${id}Tint`, [id, 'colour'], ['online', { true: colour }]),
    look(`${id}Show`, [id, 'opacity'], ['power', { true: 1, false: 0 }]),
    look(`${id}Lit`, [id, 'emissive'], ['power', { true: level, false: 0 }]),
    look(`${id}Offline`, [id, 'opacity'], ['online', { false: 0 }], 450),
  ];
}

export function irChannels(): ModelSpecChannel[] {
  return [
    look('noseTint', ['nose', 'colour'], ['online', { true: IR }]),
    look('noseShow', ['nose', 'opacity'], ['mode', { sending: 1, idle: 0 }]),
    pulse('noseSend', ['nose', 'emissive'], ['mode', { sending: 1.8 }], [0.5, 0.9]),
    look('noseLow', ['nose', 'colour'], ['batteryLow', { true: WARNING }]),
    look('noseLowShow', ['nose', 'opacity'], ['batteryLow', { true: 1 }]),
    pulse('noseLowLit', ['nose', 'emissive'], ['batteryLow', { true: 0.9 }], [2, 0.7]),
    look('noseOffline', ['nose', 'opacity'], ['online', { false: 0 }], 450),
    look('beamTint', ['beam', 'colour'], ['online', { true: IR }]),
    look('beamShow', ['beam', 'opacity'], ['mode', { sending: 0.75, idle: 0 }], 200),
    pulse('beamSend', ['beam', 'emissive'], ['mode', { sending: 1.4 }], [0.5, 0.9]),
    look('beamOffline', ['beam', 'opacity'], ['online', { false: 0 }], 450),
    look('irGlowIdle', ['irGlow', 'emissive'], ['mode', { idle: 0 }]),
    pulse('irGlowSend', ['irGlow', 'emissive'], ['mode', { sending: 1 }], [0.5, 0.9]),
    look('irGlowOffline', ['irGlow', 'emissive'], ['online', { false: 0 }], 450),
  ];
}

function anchors({ length, width, height }: Handset): ModelSpecAnchor[] {
  const nose = length / 2 + height * 0.2;
  return [
    {
      kind: 'emitter',
      id: 'irGlow',
      position: [nose, height * 0.54, 0],
      color: IR,
      intensity: 0.6,
      radius: 0.05,
      cone: 60,
    },
    {
      kind: 'effect',
      id: 'sendRipple',
      position: [nose + 0.01, height * 0.54, 0],
      effect: 'ripple',
      size: width * 1.6,
    },
    { kind: 'mount', id: 'desk', position: [0, 0, 0], mount: 'desk' },
    { kind: 'label', id: 'pin', position: [0, height + 0.04, 0] },
    { kind: 'hit', id: 'tap', position: [0, height / 2, 0], size: [length, height, width] },
  ];
}

export interface RemoteInput {
  readonly id: string;
  readonly title: string;
  readonly synonyms: readonly string[];
  readonly size: Handset;
  readonly materials: Readonly<Record<'body' | 'keys' | 'glass', ModelSpecMaterial>>;
  readonly finishes: NonNullable<ModelSpec['finishes']>;
  readonly defaultFinish: string;
  readonly parts: readonly ModelSpecPart[];
  readonly channels: readonly ModelSpecChannel[];
}

const SENDING = whenAll(leaf('mode', 'eq', 'sending'));
const VIEW = { yaw: 24, pitch: 40, fov: 28 } as const;

export function remote(input: RemoteInput): ModelSpec {
  const { size } = input;
  return {
    schema: 1,
    id: input.id,
    version: '1.0.0',
    title: input.title,
    category: 'infrared',
    family: 'ir_remote',
    footprint: { width: size.length, depth: size.width, height: size.height },
    framing: {
      tile: { ...VIEW, padding: 0.03 },
      card: { ...VIEW, padding: 0.05 },
      hero: { ...VIEW, padding: 0.08, focus: 'shell' },
    },
    shots: [
      shot('sending', SENDING, 'nose', { zoom: 1.5, yaw: 34, pitch: 30, loopS: 1, stillAt: 0.25 }),
    ],
    meta: {
      names: { display: input.title, synonyms: [...input.synonyms] },
      sizeClass: 'small',
      variants: Object.keys(input.finishes),
    },
    materials: { ...input.materials, accent: { ...ACCENT, color: IR } },
    finishes: input.finishes,
    defaultFinish: input.defaultFinish,
    parts: [...shellParts(size), ...input.parts],
    anchors: anchors(size),
    channels: [...input.channels, ...irChannels()],
    states: {
      on: { power: true, online: true, mode: 'idle' },
      sending: { power: true, online: true, mode: 'sending' },
      off: { power: false, online: true, mode: 'idle' },
      lowBattery: { power: true, online: true, mode: 'idle', batteryLow: true },
      offline: { online: false },
    },
  };
}

export const DARK_BODY: RemoteInput['materials'] = {
  body: { finish: 'satin-black' },
  keys: { finish: 'graphite', roughness: 0.6 },
  glass: { finish: 'smoked-acrylic', roughness: 0.12, clearcoat: 1 },
};

export const LIGHT_BODY: RemoteInput['materials'] = {
  body: { finish: 'matte-white', clearcoat: 0.4 },
  keys: { color: '#AEB2B8', roughness: 0.55, clearcoat: 0.2 },
  glass: { finish: 'smoked-acrylic', roughness: 0.12, clearcoat: 1 },
};
