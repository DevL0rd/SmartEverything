import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  DEFAULT_OVERLAY_PREFS,
  OVERLAY_ACTION,
  OVERLAY_CALL,
  OVERLAY_HOST_VIEW,
  OVERLAY_INPUT,
  OVERLAY_PHONE_PREFS,
  OVERLAY_PREFS,
  OVERLAY_VIEW,
  overlayDuration,
  overlayLevel,
  overlayView,
  type CallPhase,
  type OverlayCall,
} from '../src';
import { NOW, call, input, levelVectors, viewVectors } from './support/voice-overlay-fixtures';

const PHASES: readonly CallPhase[] = [
  'idle',
  'connecting',
  'listening',
  'thinking',
  'speaking',
  'reconnecting',
  'ended',
];

const VECTORS = z.strictObject({
  description: z.string(),
  levels: z.array(
    z.strictObject({
      sample: z.number(),
      dtMs: z.number(),
      previous: z.number(),
      next: z.number(),
    }),
  ),
  views: z.array(z.strictObject({ name: z.string(), input: OVERLAY_INPUT, view: OVERLAY_VIEW })),
});

const vectors = VECTORS.parse(
  JSON.parse(readFileSync(new URL('fixtures/voice-overlay-vectors.json', import.meta.url), 'utf8')),
);

function problem(
  text: string,
  at: number,
  fix: 'microphone' | null = null,
): OverlayCall['problem'] {
  return { text, at, fix };
}

describe('overlayView states', () => {
  it('shows the wake state before any call exists and re-evaluates at the link timeout', () => {
    const view = overlayView(input({ call: null, wake: { at: NOW, words: null, muted: false } }));
    expect(view).toMatchObject({
      state: 'wake',
      status: 'Listening',
      caption: 'Say what you need',
      orb: 'listening',
      glow: 'bloom',
      level: 'input',
      controls: ['mute', 'end'],
      changesAt: NOW + 15_000,
    });
  });

  it('shows the heard words and honours mute while waking', () => {
    const view = overlayView(
      input({ call: null, wake: { at: NOW, words: ' hey  home ', muted: true } }),
    );
    expect(view).toMatchObject({ status: 'Muted', caption: 'hey home', level: null, muted: true });
  });

  it('turns a wake that never linked into an error that hides 8 s later', () => {
    const at = NOW - 15_000;
    const view = overlayView(input({ call: null, wake: { at, words: null, muted: false } }));
    expect(view).toMatchObject({
      state: 'error',
      status: "Can't reach your home",
      caption: 'The call did not start. Try again.',
      controls: ['retry', 'close'],
      changesAt: at + 15_000 + 8000,
    });
    const gone = input({ call: null, wake: { at: NOW - 23_000, words: null, muted: false } });
    expect(overlayView(gone).state).toBe('hidden');
  });

  it('shows the wake state while the call is idle and is hidden with nothing', () => {
    const wake = { at: NOW, words: null, muted: false };
    expect(overlayView(input({ call: call({ phase: 'idle' }), wake })).state).toBe('wake');
    expect(overlayView(input({ call: null })).state).toBe('hidden');
  });

  it('listens during connecting and listening with the whole heard text', () => {
    const heard = `${'word '.repeat(80)}  turn off\nthe lights `;
    for (const phase of ['connecting', 'listening'] as const) {
      const view = overlayView(input({ call: call({ phase, heard }) }));
      expect(view).toMatchObject({
        state: 'listening',
        status: 'Listening',
        orb: 'listening',
        level: 'input',
        glow: 'listening',
        muted: false,
      });
      expect(view.caption?.endsWith('word turn off the lights')).toBe(true);
      expect(view.caption?.startsWith('word word')).toBe(true);
    }
  });

  it('shows Muted with no level when muted', () => {
    const view = overlayView(input({ call: call({ muted: true }) }));
    expect(view).toMatchObject({ status: 'Muted', level: null, muted: true });
  });

  it('thinks with the latest tool line, else the last heard text', () => {
    const tool = overlayView(
      input({ call: call({ phase: 'thinking', tool: 'Checking lights', heard: 'hi' }) }),
    );
    expect(tool).toMatchObject({ state: 'thinking', caption: 'Checking lights', glow: 'shimmer' });
    const heard = overlayView(input({ call: call({ phase: 'thinking', heard: 'hi there' }) }));
    expect(heard.caption).toBe('hi there');
  });

  it('speaks with the said text and keeps the output level when muted', () => {
    const view = overlayView(
      input({ call: call({ phase: 'speaking', said: 'Done.', muted: true }) }),
    );
    expect(view).toMatchObject({
      state: 'speaking',
      caption: 'Done.',
      level: 'output',
      muted: true,
    });
  });

  it('reconnects with More and End only', () => {
    expect(overlayView(input({ call: call({ phase: 'reconnecting' }) }))).toMatchObject({
      state: 'reconnecting',
      status: 'Reconnecting to your home',
      caption: null,
      orb: 'idle',
      level: null,
      glow: 'off',
      controls: ['more', 'end'],
    });
  });

  it('errors with Retry and Close and a stable hide time', () => {
    const at = NOW - 500;
    const first = overlayView(input({ call: call({ problem: problem('No route', at) }) }));
    const later = overlayView(
      input({ call: call({ problem: problem('No route', at) }), now: NOW + 3000 }),
    );
    expect(first).toMatchObject({
      state: 'error',
      status: "Can't reach your home",
      caption: 'No route',
      controls: ['retry', 'close'],
      changesAt: at + 8000,
    });
    expect(later).toEqual(first);
  });

  it('errors with Fix for a blocked microphone', () => {
    const view = overlayView(
      input({ call: call({ problem: problem('denied', NOW, 'microphone') }) }),
    );
    expect(view).toMatchObject({ status: 'Microphone is blocked', controls: ['fix', 'close'] });
  });

  it('leaves the error state at exactly 8 s', () => {
    expect(overlayView(input({ call: call({ problem: problem('x', NOW - 7999) }) })).state).toBe(
      'error',
    );
    expect(overlayView(input({ call: call({ problem: problem('x', NOW - 8000) }) })).state).toBe(
      'hidden',
    );
  });

  it('keeps the error while held and 3 s after the hold ends', () => {
    const old = call({ problem: problem('x', NOW - 20_000) });
    const held = overlayView(input({ call: old, hold: { active: true, endedAt: null } }));
    expect(held).toMatchObject({ state: 'error', changesAt: null });
    const released = overlayView(
      input({ call: old, hold: { active: false, endedAt: NOW - 1000 } }),
    );
    expect(released).toMatchObject({ state: 'error', changesAt: NOW + 2000 });
  });

  it('rejects a problem without its time', () => {
    expect(OVERLAY_CALL.safeParse({ ...call(), problem: { text: 'x', fix: null } }).success).toBe(
      false,
    );
  });

  it('shows who answered for 1.6 s, also over a speaking call', () => {
    const at = NOW - 100;
    const view = overlayView(input({ superseded: { by: 'Living room camera', at } }));
    expect(view).toMatchObject({
      state: 'superseded',
      status: 'Answered by Living room camera',
      controls: [],
      changesAt: at + 1600,
    });
    const speaking = input({ call: call({ phase: 'speaking' }), superseded: { by: 'K', at: NOW } });
    expect(overlayView(speaking).state).toBe('superseded');
    expect(overlayView(input({ call: null, superseded: { by: 'x', at: NOW - 1600 } })).state).toBe(
      'hidden',
    );
  });

  it('shows Call ended with the duration for 1.2 s and never falls back to wake', () => {
    const endedAt = NOW - 100;
    const view = overlayView(
      input({ call: call({ phase: 'ended', startedAt: endedAt - 134_000, endedAt }) }),
    );
    expect(view).toMatchObject({
      state: 'ended',
      status: 'Call ended',
      caption: '2:14',
      changesAt: endedAt + 1200,
    });
    const expired = input({
      call: call({ phase: 'ended', endedAt: NOW - 5000 }),
      wake: { at: NOW - 9000, words: null, muted: false },
    });
    expect(overlayView(expired).state).toBe('hidden');
  });

  it('prefers the error over the ended state', () => {
    const view = overlayView(
      input({ call: call({ phase: 'ended', endedAt: NOW, problem: problem('x', NOW) }) }),
    );
    expect(view.state).toBe('error');
  });

  it('drops captions but keeps the status when captions are off', () => {
    const prefs = { ...DEFAULT_OVERLAY_PREFS, captions: false };
    const cases = [
      input({ prefs, call: null, wake: { at: NOW, words: 'secret', muted: false } }),
      input({ prefs, call: call({ heard: 'secret' }) }),
      input({ prefs, call: call({ phase: 'thinking', tool: 'secret' }) }),
      input({ prefs, call: call({ phase: 'speaking', said: 'secret' }) }),
    ];
    for (const value of cases) {
      const view = overlayView(value);
      expect(view.caption).toBeNull();
      expect(view.status).not.toBe('');
    }
  });

  it('never throws and always returns a valid view', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PHASES),
        fc.boolean(),
        fc.constantFrom('call', 'other', 'away'),
        fc.option(fc.integer({ min: 0, max: 200_000 }), { nil: null }),
        (phase, muted, main, endedAt) => {
          const surface = { platform: 'desktop' as const, main, inShare: false };
          const view = overlayView(input({ surface, call: call({ phase, muted, endedAt }) }));
          expect(OVERLAY_VIEW.parse(view)).toEqual(view);
        },
      ),
    );
  });
});

describe('overlayDuration', () => {
  it('formats minutes and seconds', () => {
    expect(overlayDuration(0, 134_000)).toBe('2:14');
    expect(overlayDuration(0, 5000)).toBe('0:05');
    expect(overlayDuration(null, 5)).toBeNull();
    expect(overlayDuration(10, 5)).toBeNull();
  });
});

describe('overlayLevel', () => {
  it('attacks faster than it releases', () => {
    const up = overlayLevel(0, 1, 40);
    const down = 1 - overlayLevel(1, 0.0001, 40);
    expect(up).toBeCloseTo(1 - Math.exp(-1), 6);
    expect(down).toBeLessThan(up);
  });

  it('shapes the sample with a 0.6 exponent', () => {
    expect(overlayLevel(0, 0.25, 100_000)).toBeCloseTo(0.25 ** 0.6, 6);
  });

  it('treats a shaped sample under the floor as silence and rests at zero', () => {
    expect(overlayLevel(0, 0.00001, 1000)).toBe(0);
    let value = 1;
    for (let index = 0; index < 100; index += 1) value = overlayLevel(value, 0, 16);
    expect(value).toBe(0);
  });

  it('keeps the previous value for a non-positive step and stays within 0..1', () => {
    expect(overlayLevel(0.4, 1, 0)).toBe(0.4);
    expect(overlayLevel(0.4, 1, -5)).toBe(0.4);
    fc.assert(
      fc.property(
        fc.double({ min: -2, max: 3, noNaN: true }),
        fc.double({ min: -2, max: 3, noNaN: true }),
        fc.integer({ min: 1, max: 1000 }),
        (previous, sample, dtMs) => {
          const next = overlayLevel(previous, sample, dtMs);
          expect(next).toBeGreaterThanOrEqual(0);
          expect(next).toBeLessThanOrEqual(1);
        },
      ),
    );
  });
});

describe('committed vectors', () => {
  it('match the level implementation', () => {
    expect(vectors.levels).toEqual(levelVectors());
  });

  it('match the view implementation and round trip through the schemas', () => {
    expect(vectors.views).toEqual(JSON.parse(JSON.stringify(viewVectors())));
    for (const row of vectors.views) expect(overlayView(row.input)).toEqual(row.view);
  });
});

describe('schemas', () => {
  it('defaults the prefs and rejects unknown values', () => {
    expect(OVERLAY_PREFS.parse({})).toEqual({
      enabled: true,
      position: 'centre',
      glow: true,
      captions: true,
      display: 'active',
      whileSharing: 'small',
    });
    expect(OVERLAY_PREFS.safeParse({ position: 'top' }).success).toBe(false);
    expect(OVERLAY_PREFS.safeParse({ whileSharing: 'blur' }).success).toBe(false);
    expect(OVERLAY_PREFS.safeParse({ extra: 1 }).success).toBe(false);
  });

  it('parses phone prefs and host views', () => {
    expect(OVERLAY_PHONE_PREFS.parse({ theme: 'dark' }).theme).toBe('dark');
    expect(OVERLAY_PHONE_PREFS.safeParse({}).success).toBe(false);
    const host = {
      ...overlayView(input()),
      prefs: DEFAULT_OVERLAY_PREFS,
      theme: 'light',
      reducedMotion: true,
    };
    expect(OVERLAY_HOST_VIEW.parse(JSON.parse(JSON.stringify(host)))).toEqual(host);
    expect(OVERLAY_HOST_VIEW.safeParse({ ...host, theme: 'sepia' }).success).toBe(false);
  });

  it('carries values on the microphone and volume actions', () => {
    expect(OVERLAY_ACTION.parse({ kind: 'open' })).toEqual({ kind: 'open' });
    expect(OVERLAY_ACTION.parse({ kind: 'mic', id: 'yeti' })).toEqual({ kind: 'mic', id: 'yeti' });
    expect(OVERLAY_ACTION.parse({ kind: 'mic', id: null }).kind).toBe('mic');
    expect(OVERLAY_ACTION.parse({ kind: 'volume', value: 0.4 })).toEqual({
      kind: 'volume',
      value: 0.4,
    });
    expect(OVERLAY_ACTION.safeParse({ kind: 'volume', value: 2 }).success).toBe(false);
    expect(OVERLAY_ACTION.safeParse({ kind: 'mic' }).success).toBe(false);
    expect(OVERLAY_ACTION.safeParse({ kind: 'press' }).success).toBe(false);
    expect(OVERLAY_ACTION.safeParse('mute').success).toBe(false);
  });
});
