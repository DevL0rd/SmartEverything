import { ApiError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  MapSourceRegistry,
  type MapSource,
  type SourceInventory,
} from '../../../src/home-map/sources/registry';

const capabilities = {
  rooms: true,
  walls: false,
  doors: false,
  carpets: false,
  furniture: false,
  livePose: false,
  zones: false,
} as const;

const sourceOf = (candidates: readonly string[]): MapSource => ({
  kind: 'xiaomi_vacuum',
  label: 'Fake',
  capabilities,
  devicesOf: (inventory: SourceInventory): string[] =>
    inventory.filter((device) => candidates.includes(device.id)).map((device) => device.id),
  read: (): null => null,
  onChange: (): (() => void) => (): void => {
    return;
  },
  isSettled: (): boolean => true,
});

const inventory: SourceInventory = [
  { id: 'a', provider: 'xiaomi', model: 'm' },
  { id: 'b', provider: 'tuya', model: 'm' },
];

describe('the map source registry', () => {
  it('holds one entry per kind and finds it', () => {
    const source = sourceOf([]);
    const registry = new MapSourceRegistry([source]);
    expect(registry.get('xiaomi_vacuum')).toBe(source);
    expect(registry.list()).toEqual([source]);
  });

  it('refuses a second entry of the same kind', () => {
    const registry = new MapSourceRegistry([sourceOf([])]);
    expect(() => {
      registry.register(sourceOf([]));
    }).toThrow(ApiError);
  });

  it('lists the devices that can be a source with the entry that reads them', () => {
    const source = sourceOf(['a']);
    const registry = new MapSourceRegistry([source]);
    expect(registry.candidates(inventory)).toEqual([{ source, deviceId: 'a' }]);
  });
});
