import type {
  ModelSpec,
  ModelSpecChannel,
  ModelSpecPart,
  ModelSpecShot,
} from '@smarteverything/domain';
import { look } from '../screens/look';

export type Size = readonly [number, number, number, number];

export type Options = Omit<ModelSpecPart, 'id' | 'geometry' | 'material'>;

export const FLAT = { yaw: 30, pitch: 35, fov: 28, padding: 0.1, focus: 'body' } as const;

export function box(id: string, size: Size, material: string, options: Options): ModelSpecPart {
  return {
    id,
    geometry: {
      type: 'roundedBox',
      width: size[0],
      height: size[1],
      depth: size[2],
      radius: size[3],
      segments: 4,
    },
    material,
    ...options,
  };
}

export function face(
  id: string,
  size: readonly [number, number, number],
  material: string,
  options: Options,
): ModelSpecPart {
  return {
    id,
    geometry: {
      type: 'roundedPlane',
      width: size[0],
      height: size[1],
      radius: size[2],
      segments: 4,
    },
    material,
    ...options,
  };
}

export function lens(
  id: string,
  parent: string,
  at: readonly [number, number, number],
  material: string,
): ModelSpecPart {
  return {
    id,
    parent,
    geometry: { type: 'torus', radius: 0.0052, tube: 0.0011, segments: 32 },
    material,
    transform: { position: [at[0], at[1], at[2]], rotation: [90, 0, 0] },
    minLod: 1,
  };
}

export function screenChannels(screen: string): ModelSpecChannel[] {
  return [
    look(`${screen}Tint`, [screen, 'colour'], ['screenOn', { true: '#22304F' }]),
    look(`${screen}Lit`, [screen, 'emissive'], ['screenOn', { true: 0.9, false: 0 }], 300),
    look(`${screen}Ring`, [screen, 'colour'], ['ringing', { true: '#2FB5A8' }], 250),
    look(`${screen}Offline`, [screen, 'emissive'], ['online', { false: 0 }], 450),
  ];
}

export function signalChannels(charge: string, ripple: string): ModelSpecChannel[] {
  return [
    look('chargeTint', [charge, 'colour'], ['charging', { true: '#5ED38A' }]),
    look('chargeLit', [charge, 'emissive'], ['charging', { true: 0.8, false: 0 }], 300),
    look('chargeShow', [charge, 'opacity'], ['charging', { true: 0.7, false: 0 }], 300),
    look('rippleShow', [ripple, 'opacity'], ['ringing', { true: 0.6, false: 0 }], 250),
  ];
}

export function phoneShot(focus: string, zoom: number): ModelSpecShot {
  return {
    id: 'active',
    when: {
      anyOf: [
        { allOf: [{ signal: 'ringing', op: 'eq', value: true }] },
        { allOf: [{ signal: 'screenOn', op: 'eq', value: true }] },
        { allOf: [{ signal: 'charging', op: 'eq', value: true }] },
      ],
    },
    focus,
    zoom,
    yaw: 20,
    pitch: 45,
    easeMs: 800,
    loopS: 2,
    symmetry: 360,
    stillAt: 1,
  };
}

export const PHONE_STATES: NonNullable<ModelSpec['states']> = {
  off: { power: false, screenOn: false },
  idle: { power: true, online: true, screenOn: false, charging: false },
  on: { power: true, online: true, screenOn: true },
  ringing: { power: true, online: true, screenOn: true, ringing: true },
  charging: { power: true, online: true, screenOn: false, charging: true, battery: 0.4 },
  offline: { online: false },
};
