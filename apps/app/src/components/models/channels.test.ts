import {
  MODEL_SPEC_CHANNEL,
  MODEL_SPEC_SHOT,
  type ModelSpecChannel,
  type ModelSpecShot,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  activeShot,
  conditionHolds,
  evaluateChannel,
  evaluateChannels,
  isMoving,
  kelvinToHex,
  reducedChannelFrames,
  sampleOutput,
} from './channels';

function channel(overrides: Record<string, unknown>): ModelSpecChannel {
  return MODEL_SPEC_CHANNEL.parse({
    id: 'c1',
    target: 'blades',
    property: 'rotate',
    axis: 'z',
    source: 'speed',
    map: { type: 'speed', in: [0, 1], perSecond: [0, 3] },
    motion: { type: 'spin' },
    reduced: 'hold',
    ...overrides,
  });
}

function shot(overrides: Record<string, unknown>): ModelSpecShot {
  return MODEL_SPEC_SHOT.parse({
    id: 'spinning',
    when: { anyOf: [{ allOf: [{ signal: 'power', op: 'eq', value: true }] }] },
    focus: 'blades',
    zoom: 2,
    yaw: 10,
    pitch: 5,
    easeMs: 400,
    loopS: 2,
    symmetry: 72,
    stillAt: 0.1,
    ...overrides,
  });
}

function channelBytes(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

describe('maps', () => {
  it('maps a speed signal to revolutions per second and clamps outside the range', () => {
    const fan = channel({ map: { type: 'speed', in: [0, 1], perSecond: [0.5, 3] } });
    expect(evaluateChannel(fan, { speed: 0 })).toEqual({ kind: 'spin', perSecond: 0.5 });
    expect(evaluateChannel(fan, { speed: 0.5 })).toEqual({ kind: 'spin', perSecond: 1.75 });
    expect(evaluateChannel(fan, { speed: 3 })).toEqual({ kind: 'spin', perSecond: 3 });
    expect(evaluateChannel(fan, { speed: -1 })).toEqual({ kind: 'spin', perSecond: 0.5 });
  });

  it('extrapolates a linear map unless it clamps', () => {
    const open = channel({
      source: 'level',
      property: 'opacity',
      map: { type: 'linear', in: [0, 1], out: [0, 10] },
      motion: { type: 'pose' },
    });
    const clamped = channel({
      source: 'level',
      property: 'opacity',
      map: { type: 'linear', in: [0, 1], out: [0, 10], clamp: true },
      motion: { type: 'pose' },
    });
    expect(evaluateChannel(open, { level: 2 })).toEqual({ kind: 'value', value: 20, easeMs: 0 });
    expect(evaluateChannel(clamped, { level: 2 })).toEqual({
      kind: 'value',
      value: 10,
      easeMs: 0,
    });
  });

  it('looks up enum tables for strings and booleans and skips unmapped values', () => {
    const lid = channel({
      source: 'door',
      property: 'pose',
      map: { type: 'enum', table: { open: 'raised', closed: 'down' } },
      motion: { type: 'pose', easeMs: 250 },
    });
    expect(evaluateChannel(lid, { door: 'open' })).toEqual({
      kind: 'value',
      value: 'raised',
      easeMs: 250,
    });
    expect(evaluateChannel(lid, { door: 'locked' })).toBeNull();
    const glow = channel({
      source: 'power',
      property: 'emissive',
      map: { type: 'enum', table: { true: 1, false: 0 } },
      motion: { type: 'pose' },
    });
    expect(evaluateChannel(glow, { power: false })).toEqual({
      kind: 'value',
      value: 0,
      easeMs: 0,
    });
  });

  it('tints from a colour signal and from a colour temperature', () => {
    const signal = channel({
      source: 'colour',
      property: 'colour',
      map: { type: 'colour', from: 'signal' },
      motion: { type: 'pose' },
    });
    const temperature = channel({
      source: 'colourTemperature',
      property: 'colour',
      map: { type: 'colour', from: 'temperature', kelvin: [2000, 6500] },
      motion: { type: 'pose' },
    });
    expect(evaluateChannel(signal, { colour: '#ff8800' })).toEqual({
      kind: 'value',
      value: '#ff8800',
      easeMs: 0,
    });
    const warm = evaluateChannel(temperature, { colourTemperature: 2700 });
    const cool = evaluateChannel(temperature, { colourTemperature: 9000 });
    expect(cool).toEqual({ kind: 'value', value: kelvinToHex(6500), easeMs: 0 });
    expect(warm).toEqual({ kind: 'value', value: kelvinToHex(2700), easeMs: 0 });
    const [warmRed, , warmBlue] = channelBytes(kelvinToHex(2700));
    expect(warmRed).toBe(255);
    expect(warmBlue).toBeLessThan(0x80);
    expect(channelBytes(kelvinToHex(6500))[2]).toBeGreaterThan(0xf0);
  });

  it('reads a plugin capability source and stays inactive without a value', () => {
    const own = channel({
      source: { capability: 'rpm' },
      map: { type: 'speed', in: [0, 10], perSecond: [0, 5] },
    });
    expect(evaluateChannel(own, {}, { rpm: 10 })).toEqual({ kind: 'spin', perSecond: 5 });
    expect(evaluateChannel(own, { rpm: 10 })).toBeNull();
    expect(evaluateChannel(channel({}), {})).toBeNull();
    expect(evaluateChannel(channel({}), { speed: null })).toBeNull();
  });
});

describe('motions', () => {
  it('turns on oscillation and stepping only while the mapped value is active', () => {
    const swing = channel({
      source: 'oscillating',
      property: 'rotate',
      axis: 'y',
      map: { type: 'enum', table: { true: 1, false: 0 } },
      motion: { type: 'oscillate', limits: [-45, 45], speed: 30 },
    });
    expect(evaluateChannel(swing, { oscillating: true })).toEqual({
      kind: 'oscillate',
      limits: [-45, 45],
      speed: 30,
    });
    expect(evaluateChannel(swing, { oscillating: false })).toBeNull();
    const drum = channel({
      source: 'phase',
      property: 'pose',
      map: { type: 'enum', table: { washing: 'a', idle: '' } },
      motion: { type: 'step', keyframes: ['a', 'b', 'c'], intervalMs: 100 },
    });
    expect(evaluateChannel(drum, { phase: 'washing' })).toMatchObject({ kind: 'step' });
    expect(evaluateChannel(drum, { phase: 'idle' })).toBeNull();
  });

  it('keeps the base value of a pulse and rejects non numeric speeds', () => {
    const beat = channel({
      source: 'brightness',
      property: 'emissive',
      map: { type: 'linear', in: [0, 1], out: [0, 2] },
      motion: { type: 'pulse', periodS: 2, amplitude: 0.5 },
    });
    expect(evaluateChannel(beat, { brightness: 0.5 })).toEqual({
      kind: 'pulse',
      base: 1,
      periodS: 2,
      amplitude: 0.5,
    });
    const text = channel({
      source: 'door',
      map: { type: 'enum', table: { open: 'fast' } },
    });
    expect(evaluateChannel(text, { door: 'open' })).toBeNull();
  });

  it('evaluates only the channels that have an output', () => {
    const frames = evaluateChannels([channel({ id: 'a' }), channel({ id: 'b', source: 'level' })], {
      speed: 0.5,
    });
    expect(frames.map((frame) => frame.channelId)).toEqual(['a']);
    expect(frames[0]).toMatchObject({ target: 'blades', property: 'rotate', axis: 'z' });
  });
});

describe('sampling', () => {
  it('samples rotation in degrees and other spins in units', () => {
    expect(sampleOutput('rotate', { kind: 'spin', perSecond: 0.5 }, 1)).toBe(180);
    expect(sampleOutput('uvScroll', { kind: 'spin', perSecond: 0.5 }, 2)).toBe(1);
  });

  it('samples a pulse as a sine around the base value', () => {
    const pulse = { kind: 'pulse', base: 1, periodS: 4, amplitude: 0.5 } as const;
    expect(sampleOutput('emissive', pulse, 0)).toBe(1);
    expect(sampleOutput('emissive', pulse, 1)).toBeCloseTo(1.5);
    expect(sampleOutput('emissive', pulse, 3)).toBeCloseTo(0.5);
  });

  it('sweeps an oscillation between its limits as a triangle wave', () => {
    const sweep = { kind: 'oscillate', limits: [-45, 45], speed: 45 } as const;
    expect(sampleOutput('rotate', sweep, 0)).toBe(-45);
    expect(sampleOutput('rotate', sweep, 1)).toBe(0);
    expect(sampleOutput('rotate', sweep, 2)).toBe(45);
    expect(sampleOutput('rotate', sweep, 3)).toBe(0);
    expect(sampleOutput('rotate', sweep, 4)).toBe(-45);
  });

  it('cycles step keyframes by interval', () => {
    const steps = { kind: 'step', keyframes: ['a', 'b', 'c'], intervalMs: 100 } as const;
    expect([0, 0.1, 0.25, 0.3, 0.45].map((t) => sampleOutput('pose', steps, t))).toEqual([
      'a',
      'b',
      'c',
      'a',
      'b',
    ]);
  });

  it('tells moving outputs from held ones', () => {
    expect(isMoving({ kind: 'value', value: 1, easeMs: 0 })).toBe(false);
    expect(isMoving({ kind: 'spin', perSecond: 0 })).toBe(false);
    expect(isMoving({ kind: 'spin', perSecond: 1 })).toBe(true);
    expect(isMoving({ kind: 'pulse', base: 0, periodS: 1, amplitude: 0 })).toBe(false);
    expect(isMoving({ kind: 'oscillate', limits: [0, 0], speed: 1 })).toBe(false);
    expect(isMoving({ kind: 'step', keyframes: [1], intervalMs: 10 })).toBe(false);
    expect(isMoving({ kind: 'step', keyframes: [1, 2], intervalMs: 10 })).toBe(true);
  });
});

describe('shots', () => {
  const washing = shot({
    id: 'washing',
    when: {
      anyOf: [
        {
          allOf: [
            { signal: 'phase', op: 'eq', value: 'washing' },
            { signal: 'progress', op: 'gt', value: 0 },
          ],
        },
        { allOf: [{ signal: 'fault', op: 'ne', value: false }] },
      ],
    },
  });

  it('holds only when every leaf of one group holds', () => {
    expect(conditionHolds(washing.when, { phase: 'washing', progress: 0.2 })).toBe(true);
    expect(conditionHolds(washing.when, { phase: 'washing', progress: 0 })).toBe(false);
    expect(conditionHolds(washing.when, { phase: 'idle', fault: true })).toBe(true);
    expect(conditionHolds(washing.when, { phase: 'washing' })).toBe(false);
    expect(conditionHolds(washing.when, { phase: 'washing', progress: null })).toBe(false);
  });

  it('refuses ordered comparisons on text', () => {
    const text = shot({
      when: { anyOf: [{ allOf: [{ signal: 'phase', op: 'gt', value: 1 }] }] },
    });
    expect(conditionHolds(text.when, { phase: 'washing' })).toBe(false);
  });

  it('picks the first matching shot in declared order', () => {
    const idle = shot({
      id: 'idle',
      when: { anyOf: [{ allOf: [{ signal: 'power', op: 'eq', value: false }] }] },
    });
    expect(activeShot([washing, idle], { power: false })?.id).toBe('idle');
    expect(activeShot([washing, idle], { phase: 'washing', progress: 1, power: false })?.id).toBe(
      'washing',
    );
    expect(activeShot([washing], { power: true })).toBeUndefined();
    expect(activeShot(undefined, {})).toBeUndefined();
  });
});

describe('reduced motion', () => {
  const blades = channel({ id: 'blades', map: { type: 'speed', in: [0, 1], perSecond: [0, 2] } });
  const pose = channel({
    id: 'lid',
    source: 'door',
    property: 'pose',
    map: { type: 'enum', table: { open: 'raised' } },
    motion: { type: 'pose', easeMs: 300 },
  });
  const blur = channel({
    id: 'blur',
    target: 'blur',
    property: 'visible',
    map: { type: 'enum', table: { true: true } },
    source: 'power',
    motion: { type: 'pose' },
    reduced: 'hide',
  });
  const spinning = shot({ stillAt: 0.25, loopS: 1, symmetry: 90 });

  it('holds the pose and samples loops at the active shot stillAt', () => {
    const frames = reducedChannelFrames(
      { channels: [blades, pose, blur], shots: [spinning] },
      { power: true, speed: 0.5, door: 'open' },
    );
    expect(frames).toEqual([
      {
        channelId: 'blades',
        target: 'blades',
        property: 'rotate',
        axis: 'z',
        hidden: false,
        value: 90,
      },
      {
        channelId: 'lid',
        target: 'blades',
        property: 'pose',
        axis: 'z',
        hidden: false,
        value: 'raised',
      },
      {
        channelId: 'blur',
        target: 'blur',
        property: 'visible',
        axis: 'z',
        hidden: true,
        value: undefined,
      },
    ]);
  });

  it('samples loops at time zero when no shot is active and skips inactive channels', () => {
    const frames = reducedChannelFrames(
      { channels: [blades, pose], shots: [spinning] },
      { power: false, speed: 1 },
    );
    expect(frames).toEqual([
      {
        channelId: 'blades',
        target: 'blades',
        property: 'rotate',
        axis: 'z',
        hidden: false,
        value: 0,
      },
    ]);
    expect(reducedChannelFrames({}, {})).toEqual([]);
  });
});
