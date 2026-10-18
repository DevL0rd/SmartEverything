import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OVERLAY_PREFS,
  OVERLAY_ENDED_MS,
  overlayView,
  type OverlayHostView,
  type OverlayInput,
} from '@smarteverything/domain';

vi.mock('expo-router', () => ({ usePathname: (): string => '' }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const { FirstSeen, OverlayDriver, dismissKeyOf, overlayCallOf, overlayInputOf, wakeKeyOf } =
  await import('./overlay-driver');
import type { DriverInput, OverlayDriver as Driver, OverlaySources } from './overlay-driver';
const { IDLE_CALL } = await import('../call/call-state');

const AUDIO = { mics: [], micId: null, volume: 1 };
const EXTRAS = {
  wake: null,
  superseded: null,
  hold: { active: false, endedAt: null },
  dismissed: null,
};
const AWAY = { platform: 'desktop', main: 'away', inShare: false } as const;

function sources(change: Partial<OverlaySources> = {}): OverlaySources {
  return {
    prefs: DEFAULT_OVERLAY_PREFS,
    surface: AWAY,
    call: { ...IDLE_CALL, phase: 'listening' as const, startedAt: 1000 },
    assistant: 'Ada',
    chat: 'Lights',
    reasons: { camera: null, share: null },
    speaker: null,
    audio: AUDIO,
    extras: EXTRAS,
    hosted: null,
    problemAt: null,
    requestAt: null,
    ...change,
  };
}

interface Harness {
  readonly driver: Driver;
  readonly pushed: OverlayHostView[];
  readonly timers: { at: number; run: () => void }[];
  readonly advance: (ms: number) => void;
}

function harness(start = 10_000): Harness {
  let now = start;
  const pushed: OverlayHostView[] = [];
  const timers: { at: number; run: () => void }[] = [];
  const driver = new OverlayDriver({
    now: (): number => now,
    after: (ms, run): (() => void) => {
      const timer = { at: now + ms, run };
      timers.push(timer);
      return (): void => {
        timers.splice(timers.indexOf(timer), 1);
      };
    },
    push: (view): void => {
      pushed.push(view);
    },
  });
  return {
    driver,
    pushed,
    timers,
    advance: (ms): void => {
      now += ms;
      for (const timer of timers.filter((each) => each.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    },
  };
}

function driven(input: Omit<OverlayInput, 'now'>): DriverInput {
  return { input, theme: 'dark', reducedMotion: false };
}

describe('the overlay driver', () => {
  it('pushes nothing while the view stays hidden', () => {
    const { driver, pushed } = harness();
    const hidden = overlayInputOf(sources({ surface: { ...AWAY, main: 'call' } }));
    driver.update(driven(hidden));
    driver.update(driven({ ...hidden, prefs: { ...DEFAULT_OVERLAY_PREFS, glow: false } }));
    expect(pushed).toEqual([]);
  });

  it('pushes each real change once and never an unchanged view', () => {
    const { driver, pushed } = harness();
    const listening = overlayInputOf(sources());
    driver.update(driven(listening));
    driver.update(driven(listening));
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ state: 'listening', theme: 'dark', reducedMotion: false });
    const speaking = overlayInputOf(
      sources({ call: { ...IDLE_CALL, phase: 'speaking', said: 'Hello there', startedAt: 1000 } }),
    );
    driver.update(driven(speaking));
    expect(pushed).toHaveLength(2);
    expect(pushed[1]).toMatchObject({ state: 'speaking', caption: 'Hello there', level: 'output' });
  });

  it('hides the overlay when the main window returns to the call page', () => {
    const { driver, pushed } = harness();
    driver.update(driven(overlayInputOf(sources())));
    driver.update(driven(overlayInputOf(sources({ surface: { ...AWAY, main: 'call' } }))));
    expect(pushed.map((view) => view.state)).toEqual(['listening', 'hidden']);
  });

  it('re-evaluates once at changesAt and hides the ended call then', () => {
    const { driver, pushed, timers, advance } = harness(5000);
    const ended = sources({
      call: { ...IDLE_CALL, phase: 'ended', startedAt: 1000, endedAt: 5000 },
    });
    driver.update(driven(overlayInputOf(ended)));
    expect(pushed.at(-1)).toMatchObject({ state: 'ended', caption: '0:04' });
    expect(timers).toHaveLength(1);
    advance(OVERLAY_ENDED_MS + 1);
    expect(pushed.at(-1)?.state).toBe('hidden');
    expect(timers).toHaveLength(0);
  });

  it('keeps one timer and drops it when the driver stops', () => {
    const { driver, timers } = harness(5000);
    const ended = sources({
      call: { ...IDLE_CALL, phase: 'ended', startedAt: 1000, endedAt: 5000 },
    });
    driver.update(driven(overlayInputOf(ended)));
    driver.update(driven(overlayInputOf(ended)));
    expect(timers).toHaveLength(1);
    driver.stop();
    expect(timers).toHaveLength(0);
  });
});

describe('the call as the contract sees it', () => {
  it('is null when idle or dismissed', () => {
    expect(overlayCallOf(sources({ call: IDLE_CALL }))).toBeNull();
    const ended = { ...IDLE_CALL, phase: 'ended' as const, callId: 'c', endedAt: 5 };
    const key = dismissKeyOf(ended);
    expect(overlayCallOf(sources({ call: ended }))).not.toBeNull();
    expect(
      overlayCallOf(sources({ call: ended, extras: { ...EXTRAS, dismissed: key } })),
    ).toBeNull();
  });

  it('never treats nothing dismissed as dismissed', () => {
    const live = { ...IDLE_CALL, phase: 'listening' as const };
    expect(dismissKeyOf(live)).toBeNull();
    expect(overlayCallOf(sources({ call: live }))).not.toBeNull();
  });

  it('shows the latest tool line, the chat and the assistant name', () => {
    const call = overlayCallOf(
      sources({ call: { ...IDLE_CALL, phase: 'thinking', tools: ['a', 'Turning on lights'] } }),
    );
    expect(call).toMatchObject({ tool: 'Turning on lights', chat: 'Lights', assistant: 'Ada' });
  });

  it('describes sharing as a screen or a named window, and camera as its phase', () => {
    const screen = { ...IDLE_CALL, phase: 'listening' as const };
    const window = overlayCallOf(
      sources({ call: { ...screen, sight: { source: 'desktop_window', label: 'Terminal' } } }),
    );
    expect(window?.sharing).toEqual({ kind: 'window', label: 'Terminal' });
    const whole = overlayCallOf(
      sources({ call: { ...screen, sight: { source: 'desktop_screen', label: null } } }),
    );
    expect(whole?.sharing).toEqual({ kind: 'screen', label: null });
    const home = overlayCallOf(
      sources({ call: { ...screen, sight: { source: 'home_camera', label: 'Porch' } } }),
    );
    expect(home?.sharing).toBeNull();
    const camera = overlayCallOf(
      sources({ call: { ...screen, video: { ...screen.video, camera: 'on' } } }),
    );
    expect(camera?.camera).toBe('on');
  });

  it('anchors a problem at the end of the call, else at when it was first seen', () => {
    const base = {
      ...IDLE_CALL,
      phase: 'ended' as const,
      problem: 'No mic',
      fix: 'microphone' as const,
    };
    expect(
      overlayCallOf(sources({ call: { ...base, endedAt: 7 }, problemAt: 3 }))?.problem,
    ).toEqual({
      text: 'No mic',
      at: 7,
      fix: 'microphone',
    });
    expect(overlayCallOf(sources({ call: base, problemAt: 3 }))?.problem?.at).toBe(3);
  });

  it('expires a request thirty seconds after it first arrived', () => {
    const call = {
      ...IDLE_CALL,
      phase: 'listening' as const,
      request: { requestId: 'r', what: 'desktop_screen' as const, why: 'To help', target: null },
    };
    expect(overlayCallOf(sources({ call, requestAt: 1000 }))?.request).toEqual({
      what: 'desktop_screen',
      why: 'To help',
      expiresAt: 31_000,
    });
  });
});

describe('the wake input', () => {
  it('shows a wake until it is dismissed', () => {
    const wake = { at: 4000, words: null, muted: false };
    const input = overlayInputOf(sources({ call: IDLE_CALL, extras: { ...EXTRAS, wake } }));
    expect(input.wake).toEqual(wake);
    const dismissed = { ...EXTRAS, wake, dismissed: wakeKeyOf(wake) };
    expect(overlayInputOf(sources({ call: IDLE_CALL, extras: dismissed })).wake).toBeNull();
  });
});

describe('remembering when something first appeared', () => {
  it('keeps the first time for the same key and starts over for a new one', () => {
    const seen = new FirstSeen();
    expect(seen.at('a', 10)).toBe(10);
    expect(seen.at('a', 20)).toBe(10);
    expect(seen.at(null, 30)).toBeNull();
    expect(seen.at('a', 40)).toBe(40);
    expect(seen.at('b', 50)).toBe(50);
  });
});

describe('hosted computer calls', () => {
  const HOSTED = {
    callId: 'call-9',
    phase: 'speaking' as const,
    muted: false,
    heard: 'Dim the lamp',
    said: 'Done',
    tool: null,
    startedAt: 500,
    endedAt: null,
  };

  it('shows the call the hub hosts when no call runs in the app', () => {
    const call = overlayCallOf(sources({ call: IDLE_CALL, hosted: HOSTED }));
    expect(call).toMatchObject({
      phase: 'speaking',
      hosted: true,
      startedAt: 500,
      endedAt: null,
      assistant: 'Ada',
      muted: false,
      heard: 'Dim the lamp',
      said: 'Done',
      request: null,
    });
  });

  it('shows nothing without a hosted call and prefers the call in the app', () => {
    expect(overlayCallOf(sources({ call: IDLE_CALL }))).toBeNull();
    const local = overlayCallOf(sources({ hosted: HOSTED }));
    expect(local?.hosted).toBeUndefined();
    expect(local?.phase).toBe('listening');
  });

  it('carries the end time so the bar says the call ended', () => {
    const ended = { ...HOSTED, phase: 'ended' as const, endedAt: 9000 };
    expect(overlayCallOf(sources({ call: IDLE_CALL, hosted: ended }))).toMatchObject({
      phase: 'ended',
      endedAt: 9000,
    });
  });

  it('turns into a bar with the mute and end controls and the words said', () => {
    const input = overlayInputOf(sources({ call: IDLE_CALL, hosted: HOSTED }));
    const view = overlayView({ ...input, now: 10_000 });
    expect(view).toMatchObject({
      state: 'speaking',
      controls: ['mute', 'end'],
      caption: 'Done',
      tray: null,
    });
  });
});
