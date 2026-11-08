import {
  MODEL_SPEC,
  type ModelSpec,
  type ModelSpecChannel,
  type ModelSpecCondition,
  shownParts,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';
import {
  HOME_BASIC_MODELS,
  ROLLER_BLIND_MODEL,
  WALL_ROCKER_MODEL,
} from '../../../src/devices/home-basics';

type State = Readonly<Record<string, string | number | boolean>>;

const CASES = HOME_BASIC_MODELS.map((spec) => [spec.id, spec] as const);

const DEFAULTS: readonly (readonly [string, string])[] = [
  ['dev.light.bulb-a60', 'light'],
  ['dev.switch.wall-rocker', 'switch'],
  ['dev.button.remote-4key', 'button'],
  ['dev.cover.roller-blind', 'cover'],
];

function holds(condition: ModelSpecCondition, state: State): boolean {
  return condition.anyOf.some((branch) =>
    branch.allOf.every((leaf) => {
      const value = typeof leaf.signal === 'string' ? state[leaf.signal] : undefined;
      if (value === undefined) return false;
      switch (leaf.op) {
        case 'eq':
          return value === leaf.value;
        case 'ne':
          return value !== leaf.value;
        case 'gt':
          return value > leaf.value;
        case 'gte':
          return value >= leaf.value;
        case 'lt':
          return value < leaf.value;
        case 'lte':
          return value <= leaf.value;
      }
    }),
  );
}

function darkens(channel: ModelSpecChannel, target: string, source: string): boolean {
  return (
    channel.target === target &&
    channel.property === 'emissive' &&
    channel.source === source &&
    channel.map.type === 'enum' &&
    channel.map.table['false'] === 0
  );
}

function glowing(spec: ModelSpec): readonly string[] {
  const emitters = (spec.anchors ?? []).filter((anchor) => anchor.kind === 'emitter');
  const lit = (spec.channels ?? []).filter((channel) => channel.property === 'emissive');
  return [...new Set([...emitters.map((anchor) => anchor.id), ...lit.map((c) => c.target)])];
}

describe('home basics family defaults', () => {
  it('builds each family default with its plan id and family', () => {
    expect(HOME_BASIC_MODELS.map((spec) => [spec.id, spec.family])).toStrictEqual(DEFAULTS);
  });

  it.each(CASES)('%s parses strictly, passes authoring and registers once', (_id, spec) => {
    expect(MODEL_SPEC.safeParse(spec).error?.issues ?? []).toStrictEqual([]);
    expect(checkAuthoring(spec).problems).toStrictEqual([]);
    expect(MODEL_REGISTRY.filter((entry) => entry.id === spec.id)).toHaveLength(1);
    expect(spec.states?.['offline']).toStrictEqual({ online: false });
  });

  it.each(CASES)('%s darkens every glow while offline', (_id, spec) => {
    const channels = spec.channels ?? [];
    for (const target of glowing(spec)) {
      expect(channels.some((channel) => darkens(channel, target, 'online'))).toBe(true);
    }
  });

  it.each(CASES)('%s darkens every glow while switched off', (_id, spec) => {
    const channels = spec.channels ?? [];
    const powered = Object.values(spec.states ?? {}).some((state) => 'power' in state);
    for (const target of powered ? glowing(spec) : []) {
      expect(channels.some((channel) => darkens(channel, target, 'power'))).toBe(true);
    }
  });

  it.each(CASES)('%s shows each shot in a named state and stays still otherwise', (_id, spec) => {
    const states = Object.values(spec.states ?? {});
    for (const shot of spec.shots ?? []) {
      expect(states.some((state) => holds(shot.when, state))).toBe(true);
      expect(holds(shot.when, { online: false })).toBe(false);
    }
  });

  it.each([1, 2, 3])('shows exactly %i rockers for that many gangs', (gangs) => {
    const rockers = shownParts(WALL_ROCKER_MODEL, 2, { gangs }).filter((part) =>
      /^rocker\d\d$/.test(part.id),
    );
    expect(rockers).toHaveLength(gangs);
  });

  it('rolls the blind fabric up as the cover opens', () => {
    const roll = ROLLER_BLIND_MODEL.channels?.find((channel) => channel.id === 'rollDrop');
    expect(roll?.map).toMatchObject({ type: 'linear', in: [0, 1] });
    expect(ROLLER_BLIND_MODEL.size?.width?.param).toBe('width');
  });
});
