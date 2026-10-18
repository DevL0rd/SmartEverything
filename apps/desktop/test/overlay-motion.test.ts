import { describe, expect, it } from 'vitest';
import {
  CALM_INTERVAL_MS,
  meterStep,
  Motion,
  motionPlan,
  orbAura,
  orbScale,
  ribbonPositions,
  RIBBON_NEIGHBOUR,
  RIBBON_OWN,
  RIBBON_WEIGHTS,
  shapedLevel,
  voicedAfter,
  VOICED_ENTER,
  VOICED_EXIT,
  type MotionPlan,
  type MotionPorts,
  type MotionSink,
} from '../src/overlay/overlay-motion.js';
import { call, host, input } from './support/overlay-views.js';

const FULL: MotionPlan = { source: 'input', calm: false, gain: 0.12, restMs: 8000 };
const CALM: MotionPlan = { source: 'input', calm: true, gain: 0, restMs: 8000 };

class Timer {
  live = true;

  constructor(
    readonly at: number,
    readonly run: () => void,
  ) {}

  cancel(): void {
    this.live = false;
  }

  fire(): void {
    this.live = false;
    this.run();
  }
}

class Clock implements MotionPorts {
  now = 0;
  readonly timers: Timer[] = [];

  after(ms: number, run: () => void): () => void {
    const timer = new Timer(this.now + ms, run);
    this.timers.push(timer);
    return () => {
      timer.cancel();
    };
  }

  advance(ms: number): void {
    this.now += ms;
    this.fire();
  }

  fire(): void {
    this.timers
      .filter((timer) => timer.live && timer.at <= this.now)
      .forEach((timer) => {
        timer.fire();
      });
  }
}

interface SinkLog {
  ribbon: number;
  meter: number[];
  orb: number;
  glow: number[];
  rest: boolean[];
  positions: (readonly number[])[];
  scales: number[];
}

function sink(): { log: SinkLog; value: MotionSink } {
  const meter: number[] = [];
  const rest: boolean[] = [];
  const log: SinkLog = { ribbon: 0, meter, orb: 0, glow: [], rest, positions: [], scales: [] };
  const value: MotionSink = {
    ribbon: (positions) => {
      log.ribbon += 1;
      log.positions.push(positions);
    },
    meter: (step) => {
      meter.push(step);
    },
    orb: (scale) => {
      log.orb += 1;
      log.scales.push(scale);
    },
    glow: (level) => {
      log.glow.push(level);
    },
    rest: (on) => {
      rest.push(on);
    },
  };
  return { log, value };
}

interface Rig {
  readonly clock: Clock;
  readonly log: SinkLog;
  readonly motion: Motion;
}

function setup(plan: MotionPlan): Rig {
  const clock = new Clock();
  const { log, value } = sink();
  const motion = new Motion(clock, value);
  motion.plan(plan);
  return { clock, log, motion };
}

describe('motion plan', () => {
  it('takes the level source and gain from the view and goes calm in bars and reduced motion', () => {
    expect(motionPlan(host(), 8000)).toEqual({
      source: 'input',
      calm: false,
      gain: 0.12,
      restMs: 8000,
    });
    const speaking = host(input({ call: call({ phase: 'speaking', said: 'Done' }) }));
    expect(motionPlan(speaking, 8000)).toMatchObject({ source: 'output', gain: 0.22 });
    const bar = host(input({ surface: { platform: 'desktop', main: 'other', inShare: false } }));
    expect(motionPlan(bar, 8000).calm).toBe(true);
    expect(motionPlan({ ...host(), reducedMotion: true }, 8000).calm).toBe(true);
    expect(motionPlan(host(input({ call: call({ muted: true }) })), 8000).source).toBeNull();
  });

  it('shapes a sample to the five-step meter with a silence floor', () => {
    expect(shapedLevel(0)).toBe(0);
    expect(shapedLevel(0.001)).toBe(0);
    expect(shapedLevel(1)).toBe(1);
    expect(meterStep(shapedLevel(0.5))).toBe(3);
  });
});

describe('motion in full mode', () => {
  it('paints nothing more while the level stays silent', () => {
    const { log, motion } = setup(FULL);
    const before = { ribbon: log.ribbon, orb: log.orb, glow: log.glow.length };
    motion.level({ in: 0, out: 0, at: 0 });
    motion.level({ in: 0.004, out: 0, at: 50 });
    expect(log.ribbon).toBe(before.ribbon);
    expect(log.orb).toBe(before.orb);
    expect(log.glow).toHaveLength(before.glow);
  });

  it('paints every part once per level event and starts no frame of its own', () => {
    const { log, motion } = setup(FULL);
    const base = { ribbon: log.ribbon, orb: log.orb, glow: log.glow.length };
    motion.level({ in: 0.8, out: 0, at: 0 });
    motion.level({ in: 0.8, out: 0, at: 50 });
    expect(log.ribbon - base.ribbon).toBe(2);
    expect(log.orb - base.orb).toBe(2);
    expect(log.glow.length - base.glow).toBe(2);
  });

  it('sends the shaped level to the glow and the orb gain to the orb', () => {
    const { log, motion } = setup(FULL);
    motion.level({ in: 0.5, out: 0, at: 0 });
    expect(log.glow.at(-1)).toBe(shapedLevel(0.5));
    expect(log.scales.at(-1)).toBe(orbScale(shapedLevel(0.5), 0.12));
  });

  it('brings every part back to rest with one paint when the voice stops', () => {
    const { log, motion } = setup(FULL);
    motion.level({ in: 0.9, out: 0, at: 0 });
    motion.level({ in: 0, out: 0, at: 50 });
    expect(log.glow.at(-1)).toBe(0);
    expect(log.scales.at(-1)).toBe(1);
    expect(log.positions.at(-1)?.every((position) => position === 0)).toBe(true);
    const painted = log.glow.length;
    motion.level({ in: 0, out: 0, at: 100 });
    expect(log.glow).toHaveLength(painted);
  });

  it('ignores the level of the source it does not follow', () => {
    const { log, motion } = setup({ ...FULL, source: 'output' });
    const painted = log.glow.length;
    motion.level({ in: 0.9, out: 0, at: 0 });
    expect(log.glow).toHaveLength(painted);
  });

  it('drops the old level when the plan changes', () => {
    const { log, motion } = setup(FULL);
    motion.level({ in: 0.9, out: 0, at: 0 });
    motion.plan({ ...FULL, source: 'output' });
    expect(log.glow.at(-1)).toBe(0);
    motion.plan({ ...FULL, source: null });
    motion.level({ in: 0.9, out: 0.9, at: 1 });
    expect(log.glow.at(-1)).toBe(0);
  });
});

describe('ribbon shape', () => {
  it('is flat for silence and follows the weights when loud', () => {
    expect(ribbonPositions(0, 1).every((position) => position === 0)).toBe(true);
    const loud = ribbonPositions(1, 0);
    expect(loud).toHaveLength(RIBBON_WEIGHTS.length);
    const middle = RIBBON_WEIGHTS.indexOf(1);
    expect(loud[middle]).toBeGreaterThan(loud[0] ?? 1);
    expect(loud.every((position) => position >= 0 && position <= 1)).toBe(true);
  });

  it('moves between instants so the bars stay alive while the level is steady', () => {
    expect(ribbonPositions(0.7, 0)).not.toEqual(ribbonPositions(0.7, 0.4));
  });

  it('couples every bar to its neighbours without changing the overall height', () => {
    expect(RIBBON_OWN + 2 * RIBBON_NEIGHBOUR).toBeCloseTo(1);
    expect(ribbonPositions(0.7, 0)[0]).toBeGreaterThan(0);
  });

  it('scales the orb with its gain and fades its aura with the level', () => {
    expect(orbScale(0, 0.22)).toBe(1);
    expect(orbScale(1, 0.22)).toBeCloseTo(1.22);
    expect(orbScale(3, 0.22)).toBeCloseTo(1.22);
    expect(orbAura(0)).toEqual({ opacity: 0.2, scale: 0.9 });
    expect(orbAura(1).opacity).toBeCloseTo(0.7);
  });
});

describe('motion rest', () => {
  it('pauses every loop after the rest time without sound and resumes on the next level', () => {
    const { clock, log, motion } = setup(FULL);
    clock.advance(7999);
    expect(log.rest).toEqual([]);
    clock.advance(1);
    expect(log.rest).toEqual([true]);
    motion.level({ in: 0.5, out: 0, at: 1 });
    expect(log.rest).toEqual([true, false]);
  });

  it('rests after the thinking time when no level source exists', () => {
    const { clock, log } = setup({ source: null, calm: false, gain: 0, restMs: 3000 });
    clock.advance(3000);
    expect(log.rest).toEqual([true]);
  });

  it('holds off while sound keeps arriving', () => {
    const { clock, log, motion } = setup(FULL);
    motion.level({ in: 0.5, out: 0, at: 0 });
    clock.advance(20_000);
    expect(log.rest).toEqual([]);
  });

  it('arms the rest timer once, however many silent events come', () => {
    const { clock, motion } = setup(FULL);
    motion.level({ in: 0, out: 0, at: 0 });
    motion.level({ in: 0, out: 0, at: 1 });
    expect(clock.timers.filter((timer) => timer.live)).toHaveLength(1);
  });

  it('cancels its timers on stop', () => {
    const { clock, log, motion } = setup(FULL);
    motion.level({ in: 0.9, out: 0, at: 0 });
    motion.stop();
    clock.advance(60_000);
    expect(log.rest).toEqual([]);
  });
});

describe('motion in calm mode', () => {
  it('sets the meter only when its step changes', () => {
    const { log, motion } = setup(CALM);
    log.meter.length = 0;
    motion.level({ in: 0.5, out: 0, at: 1000 });
    motion.level({ in: 0.52, out: 0, at: 1100 });
    expect(log.meter).toEqual([3]);
    motion.level({ in: 0, out: 0, at: 1200 });
    expect(log.meter).toEqual([3, 0]);
  });

  it('limits updates to ten per second and still applies the last value', () => {
    const { clock, log, motion } = setup(CALM);
    log.meter.length = 0;
    motion.level({ in: 0.5, out: 0, at: 1000 });
    motion.level({ in: 0, out: 0, at: 1000 + CALM_INTERVAL_MS / 2 });
    expect(log.meter).toEqual([3]);
    clock.advance(CALM_INTERVAL_MS);
    expect(log.meter).toEqual([3, 0]);
  });

  it('repaints the quantised ribbon with the same steps', () => {
    const { log, motion } = setup(CALM);
    log.ribbon = 0;
    motion.level({ in: 1, out: 0, at: 5000 });
    expect(log.ribbon).toBe(1);
  });
});

describe('motion on a live microphone that never reads exactly zero', () => {
  it('treats a steady noise floor as silence: nothing is painted and it rests after the rest time', () => {
    const { clock, log, motion } = setup(FULL);
    const painted = log.glow.length;
    for (let index = 0; index < 100; index++) {
      motion.level({ in: 0.004, out: 0, at: index * 80 });
      clock.advance(80);
    }
    expect(log.glow).toHaveLength(painted);
    expect(log.rest).toEqual([true]);
  });

  it('falls silent after speech ends even when the level settles on noise', () => {
    const { log, motion } = setup(FULL);
    motion.level({ in: 0.8, out: 0, at: 0 });
    expect(log.glow.at(-1)).toBeGreaterThan(0);
    motion.level({ in: 0.004, out: 0, at: 200 });
    expect(log.glow.at(-1)).toBe(0);
  });

  it('needs a clearly voiced level to start and only drops out below a lower one', () => {
    expect(shapedLevel(0.004)).toBeLessThan(VOICED_EXIT);
    expect(voicedAfter(false, 0.004)).toBe(false);
    expect(voicedAfter(false, 0.02)).toBe(false);
    expect(shapedLevel(0.03)).toBeGreaterThanOrEqual(VOICED_ENTER);
    expect(voicedAfter(false, 0.03)).toBe(true);
    expect(voicedAfter(true, 0.02)).toBe(true);
    expect(voicedAfter(true, 0.004)).toBe(false);
  });

  it('shows the meter as silent for noise in calm mode', () => {
    const { log, motion } = setup(CALM);
    log.meter.length = 0;
    motion.level({ in: 0.5, out: 0, at: 1000 });
    motion.level({ in: 0.004, out: 0, at: 1200 });
    expect(log.meter).toEqual([3, 0]);
  });
});

describe('motion rest and state changes', () => {
  it('wakes the paused loops when the plan changes and rests again afterwards', () => {
    const { clock, log, motion } = setup(FULL);
    clock.advance(8000);
    expect(log.rest).toEqual([true]);
    motion.plan({ ...FULL, source: 'output', gain: 0.22 });
    expect(log.rest).toEqual([true, false]);
    clock.advance(8000);
    expect(log.rest).toEqual([true, false, true]);
  });

  it('wakes the paused loops when it stops so a leaving page never stays paused', () => {
    const { clock, log, motion } = setup(FULL);
    clock.advance(8000);
    motion.stop();
    expect(log.rest).toEqual([true, false]);
  });
});
