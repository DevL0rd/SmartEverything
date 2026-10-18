import { describe, expect, it } from 'vitest';
import type { MicrowaveFacts } from '../types';
import { clockText, effectOf, finishPlays, microwaveDisplay } from './microwave-display';

const READY: MicrowaveFacts = {
  phase: 'idle',
  finished: false,
  remaining: null,
  progress: null,
  mode: 'MicroWave',
  open: false,
  lamp: false,
  locked: false,
  power: null,
  finishedAt: null,
};

function shown(
  microwave: Partial<MicrowaveFacts>,
  online = true,
): ReturnType<typeof microwaveDisplay> {
  return microwaveDisplay({ online, microwave: { ...READY, ...microwave } });
}

describe('microwave display', () => {
  it('shows the mode glyph and no light while ready', () => {
    expect(shown({})).toEqual({
      phase: 'idle',
      lit: false,
      open: false,
      readout: null,
      glyph: 'wave',
      effect: null,
      progress: null,
      power: null,
      finishedAt: null,
      locked: false,
    });
  });

  it('picks the glyph that matches the cooking mode', () => {
    expect(shown({ mode: 'Grill' }).glyph).toBe('grill');
    expect(shown({ mode: 'MicroWaveGrill' }).glyph).toBe('grill');
    expect(shown({ mode: 'Convection' }).glyph).toBe('fan');
    expect(shown({ mode: 'AirFryer' }).glyph).toBe('fan');
    expect(shown({ mode: 'Deodorization' }).glyph).toBe('fresh');
    expect(shown({ mode: 'Autocook' }).glyph).toBe('wave');
    expect(shown({ mode: null }).glyph).toBe('wave');
  });

  it('lights the cavity and counts the time down while running', () => {
    expect(shown({ phase: 'running', remaining: 272, progress: 0.38 })).toEqual({
      phase: 'running',
      lit: true,
      open: false,
      readout: '4:32',
      glyph: null,
      effect: 'wave',
      progress: 0.38,
      power: null,
      finishedAt: null,
      locked: false,
    });
  });

  it('keeps the light, the time and the progress while paused', () => {
    expect(shown({ phase: 'paused', remaining: 65, progress: 0.5 })).toMatchObject({
      phase: 'paused',
      lit: true,
      readout: '1:05',
      progress: 0.5,
    });
  });

  it('starts the ring from empty when a run reports no progress yet', () => {
    expect(shown({ phase: 'running', remaining: 90 }).progress).toBe(0);
  });

  it('shows no time while a run has not reported its duration', () => {
    expect(shown({ phase: 'running' }).readout).toBeNull();
  });

  it('says Done once a finished program leaves the oven ready', () => {
    expect(shown({ finished: true })).toMatchObject({
      phase: 'finished',
      lit: false,
      readout: 'Done',
      glyph: null,
    });
  });

  it('shows the running time rather than Done when a new run follows a finished one', () => {
    expect(shown({ phase: 'running', finished: true, remaining: 30 })).toMatchObject({
      phase: 'running',
      readout: '0:30',
    });
  });

  it('lights the cavity for an open door or the lamp', () => {
    expect(shown({ open: true })).toMatchObject({ lit: true, open: true });
    expect(shown({ lamp: true })).toMatchObject({ lit: true, open: false });
  });

  it('flags the child lock only when it is on', () => {
    expect(shown({ locked: true }).locked).toBe(true);
    expect(shown({ locked: false }).locked).toBe(false);
  });

  it('leaves the display empty when the oven is offline', () => {
    expect(
      shown({ phase: 'running', remaining: 60, progress: 0.6, locked: true, open: true }, false),
    ).toEqual({
      phase: 'idle',
      lit: false,
      open: false,
      readout: null,
      glyph: null,
      effect: null,
      progress: null,
      power: null,
      finishedAt: null,
      locked: false,
    });
  });

  it('writes minutes and zero padded seconds', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(9)).toBe('0:09');
    expect(clockText(600)).toBe('10:00');
  });

  it('runs a mode effect only while cooking in that mode', () => {
    expect(shown({ phase: 'running', mode: 'Grill', remaining: 60 }).effect).toBe('grill');
    expect(shown({ phase: 'running', mode: 'AirFryer', remaining: 60 }).effect).toBe('fan');
    expect(shown({ phase: 'running', mode: 'MicroWave', remaining: 60 }).effect).toBe('wave');
    expect(shown({ phase: 'paused', mode: 'Grill', remaining: 60 }).effect).toBeNull();
    expect(shown({ mode: 'Grill' }).effect).toBeNull();
    expect(effectOf('Deodorization')).toBe('fresh');
  });

  it('carries the power step and the finish moment to the visual', () => {
    expect(shown({ phase: 'running', remaining: 60, power: 0.5 }).power).toBe(0.5);
    expect(shown({ finished: true, finishedAt: '2026-10-18T07:00:00Z' }).finishedAt).toBe(
      '2026-10-18T07:00:00Z',
    );
    expect(shown({ finishedAt: '2026-10-18T07:00:00Z' }).finishedAt).toBeNull();
  });

  it('plays the finish once per finish and never when it was not watched', () => {
    const finished = shown({ finished: true, finishedAt: 'a' });
    expect(finishPlays(null, finished, true)).toBe(true);
    expect(finishPlays('a', finished, true)).toBe(false);
    expect(finishPlays(null, finished, false)).toBe(false);
    expect(finishPlays(null, shown({}), true)).toBe(false);
  });
});
