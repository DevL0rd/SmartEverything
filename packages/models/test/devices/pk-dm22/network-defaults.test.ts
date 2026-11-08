import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { NETWORK_DEFAULT_MODELS } from '../../../src/devices/network-defaults';

const FAMILIES: Readonly<Record<string, string>> = {
  'dev.ir.puck': 'ir_blaster',
  'dev.gateway.puck': 'gateway',
  'dev.router.generic': 'router',
  'dev.computer.laptop': 'computer',
  'dev.printer.inkjet': 'printer',
};

const CASES = NETWORK_DEFAULT_MODELS.map((spec) => [spec.id, spec] as const);

function darkens(channel: ModelSpecChannel, target: string, source: string): boolean {
  return (
    channel.target === target &&
    channel.property === 'emissive' &&
    channel.source === source &&
    channel.map.type === 'enum' &&
    channel.map.table['false'] === 0
  );
}

function emitters(spec: ModelSpec): readonly string[] {
  return (spec.anchors ?? []).filter((anchor) => anchor.kind === 'emitter').map(({ id }) => id);
}

function targets(spec: ModelSpec): ReadonlySet<string> {
  return new Set([...spec.parts.map(({ id }) => id), ...(spec.anchors ?? []).map(({ id }) => id)]);
}

describe('network and computing family default models', () => {
  it('covers exactly the five plan default ids with their families', () => {
    expect(
      Object.fromEntries(NETWORK_DEFAULT_MODELS.map((spec) => [spec.id, spec.family])),
    ).toStrictEqual(FAMILIES);
  });

  it.each(CASES)('%s passes every authoring check and shows an offline state', (_id, spec) => {
    expect(checkAuthoring(spec).problems).toStrictEqual([]);
    expect(spec.states?.['offline']).toStrictEqual({ online: false });
  });

  it.each(CASES)('%s binds every channel and shot to a real part', (_id, spec) => {
    const known = targets(spec);
    expect((spec.channels ?? []).filter((channel) => !known.has(channel.target))).toStrictEqual([]);
    expect((spec.shots ?? []).filter((shot) => !known.has(shot.focus))).toStrictEqual([]);
    expect(spec.shots?.length).toBeGreaterThan(0);
  });

  it.each(CASES)('%s turns every glow off when off or offline', (_id, spec) => {
    const channels = spec.channels ?? [];
    const lights = emitters(spec);
    expect(lights.length).toBeGreaterThan(0);
    for (const light of lights) {
      expect(channels.some((channel) => darkens(channel, light, 'online'))).toBe(true);
      expect(channels.some((channel) => darkens(channel, light, 'power'))).toBe(true);
    }
  });
});
