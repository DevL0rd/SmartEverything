import type { ModelSpec, ModelSpecChannel } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { checkAuthoring } from '../../../src/index';
import { DEFAULT_MEDIA_CLEANING_MODELS } from '../../../src/devices/defaults-dm21';

const FAMILIES: Readonly<Record<string, string>> = {
  'dev.speaker.smart': 'speaker',
  'dev.camera.dome-indoor': 'camera',
  'dev.doorbell.video': 'doorbell',
  'dev.vacuum.robot-generic': 'vacuum',
};

const SPECS = DEFAULT_MEDIA_CLEANING_MODELS.map((spec) => [spec.id, spec] as const);

function darkens(channel: ModelSpecChannel, emitter: string, source: string): boolean {
  return (
    channel.target === emitter &&
    channel.property === 'emissive' &&
    channel.source === source &&
    channel.map.type === 'enum' &&
    channel.map.table['false'] === 0
  );
}

function emitters(spec: ModelSpec): readonly string[] {
  return (spec.anchors ?? []).filter((anchor) => anchor.kind === 'emitter').map((a) => a.id);
}

function partIds(spec: ModelSpec): ReadonlySet<string> {
  return new Set(spec.parts.map((entry) => entry.id));
}

describe('family default models: audio, cameras and cleaning', () => {
  it('covers exactly the planned default ids', () => {
    expect(DEFAULT_MEDIA_CLEANING_MODELS.map((spec) => spec.id).toSorted()).toStrictEqual(
      Object.keys(FAMILIES).toSorted(),
    );
  });

  it.each(SPECS)('%s passes every authoring check in its family', (id, spec) => {
    expect(checkAuthoring(spec).problems).toStrictEqual([]);
    expect(spec.family).toBe(FAMILIES[id]);
  });

  it.each(SPECS)('%s authors every state with valid signals and an offline state', (_id, spec) => {
    const states = spec.states ?? {};
    expect(Object.keys(states).length).toBeGreaterThanOrEqual(4);
    expect(states['offline']).toStrictEqual({ online: false });
    expect(states['fault']).toMatchObject({ fault: true });
  });

  it.each(SPECS)('%s frames its shots on real parts', (_id, spec) => {
    const ids = partIds(spec);
    expect((spec.shots ?? []).length).toBeGreaterThan(0);
    for (const shot of spec.shots ?? []) expect(ids.has(shot.focus)).toBe(true);
    for (const view of Object.values(spec.framing)) expect(ids.has(view.focus ?? '')).toBe(true);
  });

  it.each(SPECS)('%s drives only real parts and emitters', (_id, spec) => {
    const targets = new Set([...partIds(spec), ...emitters(spec)]);
    for (const channel of spec.channels ?? []) expect(targets.has(channel.target)).toBe(true);
  });

  it.each(SPECS)('%s turns its glows off when off or offline', (_id, spec) => {
    const channels = spec.channels ?? [];
    expect(emitters(spec).length).toBeGreaterThan(0);
    for (const emitter of emitters(spec)) {
      expect(channels.some((channel) => darkens(channel, emitter, 'power'))).toBe(true);
      expect(channels.some((channel) => darkens(channel, emitter, 'online'))).toBe(true);
    }
  });
});
