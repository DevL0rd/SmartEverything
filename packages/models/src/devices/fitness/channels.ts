import type { ModelSpecChannel } from '@smarteverything/domain';

export type Point = [number, number, number];

export function mirrored<T>(make: (side: number, name: string) => T): [T, T] {
  return [make(-1, 'Left'), make(1, 'Right')];
}

export function look(
  id: string,
  [target, property]: readonly [string, ModelSpecChannel['property']],
  [source, table]: readonly [string, Readonly<Record<string, number | string>>],
  easeMs = 300,
): ModelSpecChannel {
  return {
    id,
    target,
    property,
    source,
    map: { type: 'enum', table },
    motion: { type: 'pose', easeMs },
    reduced: 'hold',
  };
}

export function consoleChannels(screen: string): ModelSpecChannel[] {
  return [
    look(`${screen}Tint`, [screen, 'colour'], ['power', { true: '#5ED3CF' }]),
    look(`${screen}On`, [screen, 'emissive'], ['power', { true: 1.1, false: 0 }]),
    look(`${screen}Standby`, [screen, 'emissive'], ['phase', { standby: 0.35 }], 450),
    look(`${screen}FaultTint`, [screen, 'colour'], ['fault', { true: '#F2B45E' }], 250),
  ];
}
