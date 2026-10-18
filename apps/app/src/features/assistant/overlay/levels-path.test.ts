import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OVERLAY_PREFS,
  LIVE_MESSAGE,
  voiceLevelOf,
  type OverlayHostView,
} from '@smarteverything/domain';

vi.mock('expo-router', () => ({ usePathname: (): string => '' }));
vi.mock('../../../api/transport', () => ({ api: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const {
  hostedVoice,
  onHostedLevels,
  receiveVoiceActivity,
  receiveVoiceCalls,
  receiveVoiceLevels,
  setOwnComputer,
} = await import('./hosted-voice');
const { LevelPort } = await import('./level-port');
import type { LevelChannel } from './level-port';
const { OverlayDriver, overlayInputOf } = await import('./overlay-driver');
const { IDLE_CALL } = await import('../call/call-state');

const COMPUTER = 'fda22089-7faa-4b09-b39c-6281a9ebaeca';
const CALL = 'wake-call';

function wire(message: unknown): ReturnType<typeof LIVE_MESSAGE.parse> {
  return LIVE_MESSAGE.parse(JSON.parse(JSON.stringify(message)));
}

function deliver(message: unknown): void {
  const parsed = wire(message);
  if (parsed.type === 'voice_activity') {
    receiveVoiceActivity(parsed);
  } else if (parsed.type === 'voice_calls') {
    receiveVoiceCalls(parsed);
  } else if (parsed.type === 'voice_levels') {
    receiveVoiceLevels(parsed);
  }
}

function shownView(): OverlayHostView {
  const pushed: OverlayHostView[] = [];
  const driver = new OverlayDriver({
    now: (): number => 5100,
    after: (): (() => void) => () => undefined,
    push: (view): void => {
      pushed.push(view);
    },
  });
  driver.update({
    input: overlayInputOf({
      prefs: DEFAULT_OVERLAY_PREFS,
      surface: { platform: 'desktop', main: 'away', inShare: false },
      call: IDLE_CALL,
      assistant: 'Ada',
      chat: null,
      reasons: { camera: null, share: null },
      speaker: null,
      audio: { mics: [], micId: null, volume: 1 },
      extras: {
        dismissed: null,
        wake: null,
        superseded: null,
        hold: { active: false, endedAt: null },
      },
      hosted: hostedVoice.get(),
      problemAt: null,
      requestAt: null,
    }),
    theme: 'dark',
    reducedMotion: false,
  });
  const view = pushed.at(-1);
  if (view === undefined) {
    throw new Error('the hosted call produced no overlay view');
  }
  return view;
}

describe('the voice level path from the hub to the overlay pages', () => {
  it('carries the levels of a hub-hosted call from the wire notice to the overlay channel', () => {
    hostedVoice.set(null);
    setOwnComputer(COMPUTER);
    deliver({
      type: 'voice_activity',
      device: { kind: 'computer', id: COMPUTER },
      call_id: CALL,
      phase: 'listening',
      muted: false,
      superseded_by: null,
      at: 5000,
    });
    const view = shownView();
    expect(view.state).toBe('listening');
    expect(view.level).toBe('input');
    const posted: { in: number; out: number }[] = [];
    const port = new LevelPort({
      subscribe: onHostedLevels,
      open: (): LevelChannel => ({
        post: (message): void => {
          posted.push({ in: message.in, out: message.out });
        },
        close: (): void => undefined,
      }),
      now: (): number => 0,
      after: (): (() => void) => () => undefined,
    });
    port.follow(view, CALL);
    deliver({ type: 'voice_levels', call_id: CALL, in: 200, out: 0 });
    deliver({ type: 'voice_levels', call_id: CALL, in: 0, out: 120 });
    deliver({ type: 'voice_levels', call_id: 'another-call', in: 255, out: 255 });
    expect(posted).toEqual([
      { in: voiceLevelOf(200), out: 0 },
      { in: 0, out: voiceLevelOf(120) },
    ]);
    port.close();
  });

  it('reads the notice shapes the hub sends for the active calls', () => {
    const calls = wire({
      type: 'voice_calls',
      calls: [
        {
          type: 'voice_activity',
          device: { kind: 'computer', id: COMPUTER },
          call_id: CALL,
          phase: 'speaking',
          muted: true,
          superseded_by: null,
          at: 5000,
        },
      ],
    });
    expect(calls.type).toBe('voice_calls');
  });
});
