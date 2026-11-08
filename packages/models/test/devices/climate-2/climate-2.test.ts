import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { CLIMATE_APPLIANCE_MODELS } from '../../../src/devices/climate-2';

const CASES = CLIMATE_APPLIANCE_MODELS.map((spec) => [spec.id, spec] as const);

function darkens(channels: readonly ModelSpecChannel[], target: string, source: string): boolean {
  return channels.some(
    (channel) =>
      channel.target === target &&
      channel.property === 'emissive' &&
      channel.source === source &&
      channel.map.type === 'enum' &&
      channel.map.table['false'] === 0,
  );
}

function emitters(spec: ModelSpec): readonly string[] {
  return (spec.anchors ?? [])
    .filter((anchor) => anchor.kind === 'emitter')
    .map((anchor) => anchor.id);
}

function stateSignals(spec: ModelSpec): readonly string[] {
  return Object.values(spec.states ?? {}).flatMap((state) => Object.keys(state));
}

describe('purifier, humidifier, diffuser, tower fan, microwave and front washer default models', () => {
  it('covers the six families with their plan default ids', () => {
    expect(CLIMATE_APPLIANCE_MODELS.map((spec) => [spec.family, spec.id])).toStrictEqual([
      ['air_purifier', 'dev.purifier.generic'],
      ['humidifier', 'dev.humidifier.generic'],
      ['diffuser', 'dev.diffuser.ultrasonic'],
      ['tower_fan', 'dev.fan.tower'],
      ['microwave', 'dev.microwave.countertop'],
      ['laundry', 'dev.laundry.washer-front'],
    ]);
  });

  it.each(CASES)('%s passes every authoring check and shows an offline state', (_id, spec) => {
    expect(checkAuthoring(spec).problems).toStrictEqual([]);
    expect(spec.states?.['offline']).toStrictEqual({ online: false });
  });

  it.each(CASES)('%s has at least one shot whose signals its states reach', (_id, spec) => {
    const signals = new Set(stateSignals(spec));
    expect(spec.shots?.length ?? 0).toBeGreaterThan(0);
    for (const shot of spec.shots ?? []) {
      const leaves = shot.when.anyOf.flatMap((branch) => branch.allOf);
      expect(
        leaves.every((leaf) => typeof leaf.signal === 'string' && signals.has(leaf.signal)),
      ).toBe(true);
      expect(spec.parts.some((part) => part.id === shot.focus)).toBe(true);
    }
  });

  it.each(CASES)('%s darkens every emitter when off or offline', (_id, spec) => {
    const channels = spec.channels ?? [];
    for (const emitter of emitters(spec)) {
      expect(darkens(channels, emitter, 'online')).toBe(true);
      expect(darkens(channels, emitter, 'power')).toBe(true);
    }
  });

  it.each(CASES)('%s spins its rotor only from a reported speed', (_id, spec) => {
    const rest = (spec.channels ?? []).flatMap((channel) =>
      channel.map.type === 'speed' && channel.map.in[0] === 0 ? [channel.map.perSecond[0]] : [],
    );
    expect(rest.every((perSecond) => perSecond === 0)).toBe(true);
  });
});
