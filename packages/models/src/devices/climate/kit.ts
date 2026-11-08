import type { ModelSpecAnchor, ModelSpecChannel, ModelSpecPart } from '@smarteverything/domain';
import { part, type Place } from '../../helpers/geometry';
import { FAULT, look, type Vec } from '../energy/kit';

export const COOL = '#8EAEFF';

export function pivot(id: string, { at, segments: _segments, ...options }: Place): ModelSpecPart {
  return part(id, { type: 'sphere', radius: 0.0005, segments: 6 }, 'accent', {
    ...options,
    transform: { position: [at[0], at[1], at[2]], ...options.transform },
  });
}

export function powered(
  target: string,
  [show, lit]: readonly [number, number],
): ModelSpecChannel[] {
  return [
    look(`${target}Show`, [target, 'opacity'], ['power', { true: show, false: 0 }]),
    look(`${target}Lit`, [target, 'emissive'], ['power', { true: lit, false: 0 }]),
    look(`${target}Fault`, [target, 'colour'], ['fault', { true: FAULT }]),
    look(`${target}Offline`, [target, 'opacity'], ['online', { false: 0 }], 450),
  ];
}

export function powerOff(target: string): ModelSpecChannel[] {
  return [
    look(`${target}Off`, [target, 'opacity'], ['power', { false: 0 }], 450),
    look(`${target}Offline`, [target, 'opacity'], ['online', { false: 0 }], 450),
  ];
}

export function thermalTint(target: string, heat: string): ModelSpecChannel {
  return look(
    `${target}Thermal`,
    [target, 'colour'],
    ['thermal', { heating: heat, cooling: COOL }],
  );
}

export function around(count: number, radius: number, z: number): readonly [number, Vec][] {
  return Array.from({ length: count }, (_, index): [number, Vec] => {
    const angle = (index * 360) / count;
    const radial = (angle * Math.PI) / 180;
    return [angle, [Math.cos(radial) * radius, Math.sin(radial) * radius, z]];
  });
}

export function floorAnchors([width, height, depth]: Vec): ModelSpecAnchor[] {
  return [
    { kind: 'mount', id: 'mount', position: [0, 0, 0], mount: 'floor' },
    { kind: 'label', id: 'pin', position: [0, height + 0.05, 0] },
    { kind: 'hit', id: 'tap', position: [0, height / 2, 0], size: [width, height, depth] },
  ];
}

export function rod(
  id: string,
  [radius, length]: readonly [number, number],
  material: string,
  { at, segments = 8, ...options }: Place,
): ModelSpecPart {
  return part(
    id,
    { type: 'cylinder', height: length, topRadius: radius, bottomRadius: radius, segments },
    material,
    { ...options, transform: { position: [at[0], at[1], at[2]], ...options.transform } },
  );
}
