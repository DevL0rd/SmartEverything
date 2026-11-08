import type { ModelSpec } from '@smarteverything/domain';
import { colorMaterial, finishSet, lathe, part, roundedBox, tokenMaterial } from '../src/index';

const VIEW = { yaw: 30, pitch: 20, fov: 30, padding: 0.1 } as const;

function lampParts(): ModelSpec['parts'] {
  return [
    part(
      'base',
      lathe({
        profile: [
          [0, 0],
          [0.1, 0.02],
          [0.08, 0.2],
          [0, 0.22],
        ],
      }),
      'body',
      {
        contact: true,
      },
    ),
    part('shade', roundedBox({ width: 0.2, height: 0.1, depth: 0.2, radius: 0.02 }), 'glass', {
      transform: { position: [{ param: 'reach', scale: 0.1, offset: 0.1 }, 0.25, 0] },
    }),
    part('trim', roundedBox({ width: 0.05, height: 0.05, depth: 0.05, radius: 0.01 }), 'accent', {
      minLod: 2,
      transform: { scale: [{ param: 'reach' }, 1, 1] },
    }),
  ];
}

export function lampSpec(): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test-lamp',
    version: '1.0.0',
    title: 'Test lamp',
    category: 'light',
    footprint: { width: 0.2, depth: 0.2, height: 0.4 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    params: { reach: { min: 0, max: 1, default: 0.5, unit: 'm' } },
    materials: {
      body: colorMaterial('#d8d8d8', { roughness: 0.5 }),
      glass: tokenMaterial('glass', { opacity: 0.6 }),
      accent: colorMaterial('#ffb347'),
    },
    ...finishSet(
      {
        white: { body: colorMaterial('#f4f4f4') },
        graphite: { body: colorMaterial('#303030') },
      },
      'white',
    ),
    parts: lampParts(),
    anchors: [{ kind: 'emitter', id: 'bulb', color: '#ffd9a0', intensity: 1, radius: 0.08 }],
    channels: [
      {
        id: 'glow',
        target: 'shade',
        property: 'emissive',
        source: 'brightness',
        map: { type: 'linear', in: [0, 1], out: [0, 1], clamp: true },
        motion: { type: 'pose' },
        reduced: 'hold',
      },
    ],
    states: { on: { power: true, brightness: 0.8 }, off: { power: false } },
  };
}
