import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OVERLAY_PREFS,
  type DesktopComputerIdentity,
  type OverlayHostView,
  type VoiceActivityNotice,
} from '@smarteverything/domain';

vi.mock('expo-router', () => ({ usePathname: (): string => '' }));
vi.mock('../../../api/transport', () => ({ api: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const { desktopTarget } = await import('../data/desktop-harness');
const { hostedVoice, ownComputerOf, receiveVoiceActivity, receiveVoiceCaption, setOwnComputer } =
  await import('./hosted-voice');
const { OverlayDriver, overlayInputOf } = await import('./overlay-driver');
const { IDLE_CALL } = await import('../call/call-state');

const NODE_DEVICE = 'fda22089-7faa-4b09-b39c-6281a9ebaeca';
const MACHINE = '484e39c215d14bd68cd5f8679d8febbb';
const HUB_MACHINE_IDENTITY: DesktopComputerIdentity = { device_id: null, machine_id: MACHINE };
const CATALOGUE: Parameters<typeof desktopTarget>[1] = {
  hosts: [
    { target: { kind: 'server' } },
    { target: { kind: 'device', device_id: NODE_DEVICE }, machine_id: MACHINE },
  ],
};

const WAKE_CALL: VoiceActivityNotice = {
  type: 'voice_activity',
  device: { kind: 'computer', id: NODE_DEVICE },
  call_id: 'wake-call',
  phase: 'listening',
  muted: false,
  superseded_by: null,
  at: 5000,
};

function pushedFor(): OverlayHostView[] {
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
        wake: null,
        superseded: null,
        hold: { active: false, endedAt: null },
        dismissed: null,
      },
      hosted: hostedVoice.get(),
      problemAt: null,
      voice: null,
      requestAt: null,
    }),
    theme: 'dark',
    reducedMotion: false,
  });
  return pushed;
}

describe('overlay for a call the hub starts after a wake word', () => {
  it('shows when this window belongs to a hub machine whose computer runs as a companion node', () => {
    hostedVoice.set(null);
    const target = desktopTarget(HUB_MACHINE_IDENTITY, CATALOGUE);
    setOwnComputer(ownComputerOf(target));
    receiveVoiceActivity(WAKE_CALL);
    const pushed = pushedFor();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]?.state).not.toBe('hidden');
  });

  it('stays hidden while this window does not know its computer', () => {
    hostedVoice.set(null);
    setOwnComputer(ownComputerOf(null));
    receiveVoiceActivity(WAKE_CALL);
    expect(pushedFor()).toHaveLength(0);
  });

  it('shows the phase, the words of both sides, mute and the end exactly as a local call would', () => {
    hostedVoice.set(null);
    setOwnComputer(NODE_DEVICE);
    receiveVoiceActivity(WAKE_CALL);
    receiveVoiceCaption({
      type: 'voice_caption',
      call_id: 'wake-call',
      who: 'person',
      text: 'Dim the lamp',
    });
    const listening = pushedFor().at(-1);
    expect(listening).toMatchObject({
      state: 'listening',
      caption: 'Dim the lamp',
      level: 'input',
    });
    receiveVoiceActivity({ ...WAKE_CALL, phase: 'thinking', at: 5200 });
    receiveVoiceCaption({
      type: 'voice_caption',
      call_id: 'wake-call',
      who: 'tool',
      text: 'Dimming the lamp',
    });
    expect(pushedFor().at(-1)).toMatchObject({ state: 'thinking', caption: 'Dimming the lamp' });
    receiveVoiceActivity({ ...WAKE_CALL, phase: 'speaking', at: 5300 });
    receiveVoiceCaption({
      type: 'voice_caption',
      call_id: 'wake-call',
      who: 'assistant',
      text: 'Done',
    });
    expect(pushedFor().at(-1)).toMatchObject({
      state: 'speaking',
      caption: 'Done',
      level: 'output',
      controls: ['mute', 'end'],
    });
    receiveVoiceActivity({ ...WAKE_CALL, phase: 'listening', muted: true, at: 5400 });
    expect(pushedFor().at(-1)).toMatchObject({ state: 'listening', muted: true, level: null });
    receiveVoiceActivity({ ...WAKE_CALL, phase: 'ended', at: 5500 });
    expect(pushedFor().at(-1)).toMatchObject({ state: 'ended' });
  });
});
