import { describe, expect, it } from 'vitest';
import {
  MODEL_SIGNAL_NAMES,
  MODEL_SIGNAL_SET,
  MODEL_SIGNALS,
  channelSignalProblems,
  conditionSignalProblems,
  isModelSignal,
  modelSignalSchema,
  specSignalProblems,
  stateSignalProblems,
} from '../../src/models/signals';
import type { ModelSpecChannel, ModelSpecCondition } from '../../src/models/spec';
import * as domain from '../../src';

const CHANNEL = {
  id: 'spin',
  target: 'blades',
  property: 'rotate',
  axis: 'z',
  source: 'speed',
  map: { type: 'speed', in: [0, 1], perSecond: [0, 3] },
  motion: { type: 'spin' },
  reduced: 'hold',
} as const satisfies ModelSpecChannel;

function channel(overrides: Partial<ModelSpecChannel>): ModelSpecChannel {
  return { ...CHANNEL, ...overrides };
}

function when(
  signal: string,
  op: 'eq' | 'gt',
  value: number | string | boolean,
): ModelSpecCondition {
  return { anyOf: [{ allOf: [{ signal, op, value }] }] };
}

describe('MODEL_SIGNALS', () => {
  it('declares a type for every signal of the plan, including camera, drum and vacuum signals', () => {
    for (const name of [
      'cameraPan',
      'cameraTilt',
      'drumSpeed',
      'phase',
      'power',
      'pressed',
      'lidarRaised',
      'lifted',
      'batteryLow',
      'cleanMode',
      'airQuality',
    ]) {
      expect(isModelSignal(name)).toBe(true);
    }
    expect(MODEL_SIGNAL_NAMES).toHaveLength(48);
    expect(new Set(MODEL_SIGNAL_NAMES).size).toBe(MODEL_SIGNAL_NAMES.length);
    expect(Object.keys(MODEL_SIGNALS).sort()).toEqual([...MODEL_SIGNAL_NAMES].sort());
    expect(isModelSignal('toString')).toBe(false);
  });

  it('knows the three vacuum clean modes', () => {
    expect(MODEL_SIGNAL_SET.safeParse({ cleanMode: 'sweep_mop', lifted: true }).success).toBe(true);
    expect(MODEL_SIGNAL_SET.safeParse({ cleanMode: 'vacuum' }).success).toBe(false);
  });

  it('accepts null only for the camera and drum signals that may be unreported', () => {
    for (const name of ['cameraPan', 'cameraTilt', 'drumSpeed'] as const) {
      expect(modelSignalSchema(name).safeParse(null).success).toBe(true);
      expect(modelSignalSchema(name).safeParse(-45).success).toBe(true);
    }
    expect(modelSignalSchema('speed').safeParse(null).success).toBe(false);
    expect(modelSignalSchema('target').safeParse(null).success).toBe(false);
  });

  it('validates values against the signal type', () => {
    expect(modelSignalSchema('speed').safeParse(1.2).success).toBe(false);
    expect(modelSignalSchema('speed').safeParse(0.4).success).toBe(true);
    expect(modelSignalSchema('power').safeParse('on').success).toBe(false);
    expect(modelSignalSchema('door').safeParse('ajar').success).toBe(false);
    expect(modelSignalSchema('door').safeParse('locked').success).toBe(true);
    expect(modelSignalSchema('phase').safeParse('washing').success).toBe(true);
    expect(modelSignalSchema('colour').safeParse('#ff8800').success).toBe(true);
    expect(modelSignalSchema('colour').safeParse('orange').success).toBe(false);
  });

  it('checks a whole signal set and ignores nothing invalid', () => {
    const ok = MODEL_SIGNAL_SET.safeParse({ power: true, speed: 0.5, drumSpeed: null });
    expect(ok.success).toBe(true);
    const bad = MODEL_SIGNAL_SET.safeParse({ power: 1, speed: 0.5 });
    expect(bad.success).toBe(false);
    expect(MODEL_SIGNAL_SET.safeParse({ wattage: 3 }).success).toBe(false);
  });
});

describe('channel maps against the signal type', () => {
  it('accepts a speed map on a unit signal and sources from a plugin capability', () => {
    expect(channelSignalProblems(CHANNEL)).toEqual([]);
    expect(channelSignalProblems(channel({ source: { capability: 'wash.cycle' } }))).toEqual([]);
  });

  it('rejects an unknown signal name', () => {
    expect(channelSignalProblems(channel({ source: 'rpm' }))[0]?.message).toContain('unknown');
  });

  it('rejects number maps on boolean and enum signals and ranges outside 0 to 1', () => {
    expect(channelSignalProblems(channel({ source: 'power' }))).toHaveLength(1);
    expect(channelSignalProblems(channel({ source: 'phase' }))).toHaveLength(1);
    expect(
      channelSignalProblems(channel({ map: { type: 'speed', in: [0, 100], perSecond: [0, 3] } })),
    ).toHaveLength(1);
    expect(channelSignalProblems(channel({ source: 'drumSpeed', map: CHANNEL.map }))).toEqual([]);
  });

  it('checks enum tables against boolean and closed enum signals', () => {
    const table = (source: string, keys: string[]): unknown[] =>
      channelSignalProblems(
        channel({
          source,
          map: { type: 'enum', table: Object.fromEntries(keys.map((key) => [key, 1])) },
        }),
      );
    expect(table('power', ['true', 'false'])).toEqual([]);
    expect(table('power', ['on'])).toHaveLength(1);
    expect(table('door', ['open', 'closed'])).toEqual([]);
    expect(table('door', ['ajar'])).toHaveLength(1);
    expect(table('phase', ['washing', 'spin'])).toEqual([]);
    expect(table('speed', ['a'])).toHaveLength(1);
  });

  it('checks colour maps against colour and temperature signals', () => {
    const colour = (source: string, from: 'signal' | 'temperature'): unknown[] =>
      channelSignalProblems(channel({ source, map: { type: 'colour', from } }));
    expect(colour('colour', 'signal')).toEqual([]);
    expect(colour('colourTemperature', 'temperature')).toEqual([]);
    expect(colour('colourTemperature', 'signal')).toHaveLength(1);
    expect(colour('colour', 'temperature')).toHaveLength(1);
  });
});

describe('shot conditions and states against the signal type', () => {
  it('accepts matching conditions and rejects wrong operators, values and names', () => {
    expect(conditionSignalProblems(when('speed', 'gt', 0))).toEqual([]);
    expect(conditionSignalProblems(when('phase', 'eq', 'washing'))).toEqual([]);
    expect(conditionSignalProblems(when('power', 'gt', 0))).toHaveLength(1);
    expect(conditionSignalProblems(when('door', 'eq', 'ajar'))).toHaveLength(1);
    expect(conditionSignalProblems(when('nonsense', 'eq', true))).toHaveLength(1);
    expect(conditionSignalProblems(when('speed', 'eq', 4))).toHaveLength(1);
  });

  it('checks sample states and collects problems with paths for a whole spec', () => {
    expect(stateSignalProblems({ power: true, speed: 0.5, custom: 'x' })).toEqual([]);
    expect(stateSignalProblems({ speed: 3 })).toHaveLength(1);
    const problems = specSignalProblems({
      channels: [CHANNEL, channel({ source: 'power' })],
      shots: [{ when: when('power', 'gt', 1) }],
      states: { on: { speed: 2 } },
    });
    expect(problems.map((p) => p.path.join('.'))).toEqual([
      'channels.1.map',
      'shots.0.when.anyOf.0.allOf.0.op',
      'states.on.speed',
    ]);
  });
});

describe('domain export', () => {
  it('exposes the signals from the package index', () => {
    expect(domain.MODEL_SIGNALS).toBe(MODEL_SIGNALS);
    expect(domain.specSignalProblems).toBe(specSignalProblems);
  });
});
