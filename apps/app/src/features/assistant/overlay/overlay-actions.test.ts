import { describe, expect, it, vi } from 'vitest';
import { OVERLAY_SIMPLE_ACTIONS, type OverlayAction } from '@smarteverything/domain';
import type { CallView } from '../call/call-state';

vi.mock('expo-router', () => ({ router: { navigate: vi.fn() } }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const { runOverlayAction } = await import('./overlay-actions');
const { IDLE_CALL } = await import('../call/call-state');

type Ports = Parameters<typeof runOverlayAction>[1];

function ports(change: Partial<CallView> = {}): { readonly set: Ports; readonly calls: string[] } {
  const calls: string[] = [];
  const note =
    (name: string) =>
    (...args: readonly unknown[]): void => {
      calls.push([name, ...args.map(String)].join(':'));
    };
  const call = { ...IDLE_CALL, phase: 'listening' as const, ...change };
  const set: Ports = {
    call: () => call,
    mute: note('mute'),
    end: note('end'),
    restart: note('restart'),
    fixMicrophone: note('fix'),
    dismiss: note('dismiss'),
    openRoom: note('room'),
    startCamera: note('camera_on'),
    stopCamera: note('camera_off'),
    pauseVideo: note('pause'),
    shareScreen: note('share'),
    stopSharing: note('stop_share'),
    interrupt: note('interrupt'),
    speaker: note('speaker'),
    captions: note('captions'),
    microphone: note('mic'),
    volume: note('volume'),
    answer: note('answer'),
  };
  return { set, calls };
}

function run(action: OverlayAction, change: Partial<CallView> = {}): readonly string[] {
  const { set, calls } = ports(change);
  runOverlayAction(action, set);
  return calls;
}

describe('overlay actions', () => {
  it('toggles mute from the current call', () => {
    expect(run({ kind: 'mute' })).toEqual(['mute:true']);
    expect(run({ kind: 'mute' }, { muted: true })).toEqual(['mute:false']);
  });

  it('ends the call, stops the assistant and toggles the speaker and captions', () => {
    expect(run({ kind: 'end' })).toEqual(['end']);
    expect(run({ kind: 'interrupt' })).toEqual(['interrupt']);
    expect(run({ kind: 'speaker' })).toEqual(['speaker']);
    expect(run({ kind: 'captions' })).toEqual(['captions']);
  });

  it('turns the camera on when off and off when on or paused', () => {
    const video = (camera: 'off' | 'on' | 'paused'): Partial<CallView> => ({
      video: { ...IDLE_CALL.video, camera },
    });
    expect(run({ kind: 'camera' }, video('off'))).toEqual(['camera_on']);
    expect(run({ kind: 'camera' }, video('on'))).toEqual(['camera_off']);
    expect(run({ kind: 'camera' }, video('paused'))).toEqual(['camera_off']);
  });

  it('pauses and resumes the video', () => {
    const video = (camera: 'on' | 'paused'): Partial<CallView> => ({
      video: { ...IDLE_CALL.video, camera },
    });
    expect(run({ kind: 'pause_video' }, video('on'))).toEqual(['pause:true']);
    expect(run({ kind: 'pause_video' }, video('paused'))).toEqual(['pause:false']);
  });

  it('shares the screen live or as one still, and stops sharing', () => {
    expect(run({ kind: 'share_screen' })).toEqual(['share:false']);
    expect(run({ kind: 'show_this' })).toEqual(['share:true']);
    expect(run({ kind: 'stop_share' })).toEqual(['stop_share']);
  });

  it('hands the pickers and call settings to the call room', () => {
    expect(run({ kind: 'share_window' })).toEqual(['room:share']);
    expect(run({ kind: 'home_camera' })).toEqual(['room:home']);
    expect(run({ kind: 'settings' })).toEqual(['room:settings']);
    expect(run({ kind: 'open' })).toEqual(['room:null']);
  });

  it('retries after clearing the notice, fixes the microphone and closes', () => {
    expect(run({ kind: 'retry' })).toEqual(['dismiss', 'restart']);
    expect(run({ kind: 'fix' })).toEqual(['fix']);
    expect(run({ kind: 'close' })).toEqual(['dismiss']);
  });

  it('answers the request either way', () => {
    expect(run({ kind: 'accept_request' })).toEqual(['answer:true']);
    expect(run({ kind: 'decline_request' })).toEqual(['answer:false']);
  });

  it('passes the microphone id, automatic as null, and the volume value', () => {
    expect(run({ kind: 'mic', id: 'usb-1' })).toEqual(['mic:usb-1']);
    expect(run({ kind: 'mic', id: null })).toEqual(['mic:null']);
    expect(run({ kind: 'volume', value: 0.4 })).toEqual(['volume:0.4']);
  });

  it('handles every plain action kind the contract defines', () => {
    for (const kind of OVERLAY_SIMPLE_ACTIONS) {
      expect(run({ kind }), kind).not.toEqual([]);
    }
  });
});
