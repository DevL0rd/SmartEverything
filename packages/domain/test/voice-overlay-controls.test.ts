import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERLAY_PREFS,
  OVERLAY_LABELS,
  overlayView,
  type OverlayCall,
  type OverlayInput,
} from '../src';
import { NOW, PHONE, call, input } from './support/voice-overlay-fixtures';

const desktop = (main: 'call' | 'other' | 'away', inShare = false): OverlayInput['surface'] => ({
  platform: 'desktop',
  main,
  inShare,
});

describe('visibility', () => {
  it('hides only while the call page is focused on desktop', () => {
    expect(overlayView(input({ surface: desktop('call') })).state).toBe('hidden');
    expect(overlayView(input({ surface: desktop('away') }))).toMatchObject({
      state: 'listening',
      mode: 'full',
    });
    expect(overlayView(input({ surface: desktop('other') }))).toMatchObject({
      state: 'listening',
      mode: 'compact',
      glow: 'off',
      controls: ['mute', 'more', 'end'],
    });
  });

  it('hides transient states on the call page too and shows them compact on other pages', () => {
    const ended = call({ phase: 'ended', endedAt: NOW });
    expect(overlayView(input({ surface: desktop('call'), call: ended })).state).toBe('hidden');
    expect(overlayView(input({ surface: desktop('other'), call: ended })).mode).toBe('compact');
  });

  it('is off when the overlay setting is off', () => {
    expect(overlayView(input({ prefs: { ...DEFAULT_OVERLAY_PREFS, enabled: false } })).state).toBe(
      'hidden',
    );
  });

  it('shows on the phone whenever the user is not on the call page, compact inside the app', () => {
    const onCall = { platform: 'phone' as const, main: 'call' as const };
    const inApp = { platform: 'phone' as const, main: 'other' as const };
    const wake = { at: NOW, words: null, muted: false };
    expect(overlayView(input({ surface: PHONE })).mode).toBe('full');
    expect(overlayView(input({ surface: inApp }))).toMatchObject({
      state: 'listening',
      mode: 'compact',
      glow: 'off',
    });
    expect(overlayView(input({ surface: onCall })).state).toBe('hidden');
    expect(overlayView(input({ surface: PHONE, call: null, wake })).state).toBe('wake');
    expect(overlayView(input({ surface: inApp, call: null, wake })).mode).toBe('compact');
    expect(overlayView(input({ surface: onCall, call: null, wake })).state).toBe('hidden');
  });

  it('hides a shared whole screen only when the setting says so and the bar would be seen', () => {
    const sharing = call({ sharing: { kind: 'screen', label: null } });
    const hide = { ...DEFAULT_OVERLAY_PREFS, whileSharing: 'hide' as const };
    expect(
      overlayView(input({ prefs: hide, call: sharing, surface: desktop('away', true) })).state,
    ).toBe('hidden');
    expect(
      overlayView(input({ prefs: hide, call: sharing, surface: desktop('away', false) })).state,
    ).toBe('listening');
    expect(overlayView(input({ call: sharing, surface: desktop('away', true) })).mode).toBe(
      'share',
    );
    const window = call({ sharing: { kind: 'window', label: 'Files' } });
    expect(
      overlayView(input({ prefs: hide, call: window, surface: desktop('away', true) })).state,
    ).toBe('listening');
  });
});

describe('controls', () => {
  it('gives the desktop full row and makes the orb a stop button while speaking', () => {
    expect(overlayView(input()).controls).toEqual(['mute', 'camera', 'share', 'more', 'end']);
    expect(overlayView(input({ call: call({ phase: 'speaking' }) })).controls).toEqual([
      'mute',
      'interrupt',
      'camera',
      'share',
      'more',
      'end',
    ]);
  });

  it('gives the phone Mute, More and End, plus stop talking while speaking', () => {
    const speaker = call({ speaker: false });
    expect(overlayView(input({ surface: PHONE, call: speaker })).controls).toEqual([
      'mute',
      'more',
      'end',
    ]);
    const speaking = overlayView(input({ surface: PHONE, call: call({ phase: 'speaking' }) }));
    expect(speaking.controls).toEqual(['mute', 'interrupt', 'more', 'end']);
    const reconnecting = call({ phase: 'reconnecting', speaker: true });
    expect(overlayView(input({ surface: PHONE, call: reconnecting })).controls).toEqual(['end']);
  });

  it('keeps stop sharing on the phone bar and the glow out of a share', () => {
    const camera = overlayView(input({ surface: PHONE, call: call({ camera: 'on' }) }));
    expect(camera.controls).toEqual(['mute', 'more', 'end']);
    expect(camera.glow).toBe('listening');
    const sharing = call({ camera: 'on', sharing: { kind: 'screen', label: null } });
    const shared = overlayView(input({ surface: PHONE, call: sharing }));
    expect(shared).toMatchObject({ mode: 'full', glow: 'off', detail: 'sharing your screen' });
    expect(shared.controls).toEqual(['mute', 'stop_share', 'more', 'end']);
  });

  it('gives the phone a tray of its own tiles with the speaker only when it can be chosen', () => {
    const tiles = (value: OverlayCall): (string | undefined)[] | undefined =>
      overlayView(input({ surface: PHONE, call: value })).tray?.tiles.map((tile) => tile.id);
    expect(tiles(call({ speaker: true }))).toEqual([
      'camera',
      'pause_video',
      'share_screen',
      'home_camera',
      'speaker',
      'interrupt',
      'captions',
      'settings',
    ]);
    expect(tiles(call())).not.toContain('speaker');
    const sharing = call({ sharing: { kind: 'screen', label: null } });
    expect(tiles(sharing)).toContain('stop_share');
    expect(tiles(sharing)).not.toContain('share_screen');
    const pressed = overlayView(input({ surface: PHONE, call: call({ speaker: true }) }));
    expect(pressed.tray?.tiles.find((tile) => tile.id === 'speaker')).toMatchObject({
      label: 'Speaker',
      pressed: true,
      disabled: null,
    });
  });

  it('uses constant accessible names for toggles and End call', () => {
    expect(OVERLAY_LABELS.mute).toBe('Mute');
    expect(OVERLAY_LABELS.speaker).toBe('Speaker');
    expect(OVERLAY_LABELS.camera).toBe('Camera');
    expect(OVERLAY_LABELS.end).toBe('End call');
  });
});

describe('share mode', () => {
  it('enters for a screen or window and leaves when sharing stops', () => {
    const screen = overlayView(input({ call: call({ sharing: { kind: 'screen', label: null } }) }));
    expect(screen).toMatchObject({
      mode: 'share',
      glow: 'off',
      detail: 'sharing your screen',
      controls: ['mute', 'stop_share', 'more', 'end'],
    });
    const window = overlayView(
      input({
        call: call({ phase: 'speaking', sharing: { kind: 'window', label: 'Firefox: Kitchen' } }),
      }),
    );
    expect(window).toMatchObject({ mode: 'share', detail: 'sharing Firefox: Kitchen' });
    expect(window.controls).toEqual(['mute', 'interrupt', 'stop_share', 'more', 'end']);
    expect(overlayView(input()).mode).toBe('full');
  });

  it('keeps Stop sharing while reconnecting', () => {
    const view = overlayView(
      input({ call: call({ phase: 'reconnecting', sharing: { kind: 'screen', label: null } }) }),
    );
    expect(view.controls).toEqual(['stop_share', 'more', 'end']);
  });

  it('says when the camera is on', () => {
    expect(overlayView(input({ call: call({ camera: 'on' }) })).detail).toBe('camera on');
    expect(overlayView(input({ call: call({ camera: 'paused' }) })).detail).toBe('camera paused');
    expect(overlayView(input()).detail).toBeNull();
  });
});

describe('tray', () => {
  it('carries the head, microphones, volume and tiles', () => {
    const tray = overlayView(input({ call: call({ camera: 'on' }) })).tray;
    expect(tray).toMatchObject({
      assistant: 'Gemini',
      chat: 'Kitchen and evening routine',
      elapsedFrom: NOW - 134_000,
      micId: null,
      volume: 0.8,
    });
    expect(tray?.mics.map((mic) => mic.id)).toEqual(['yeti', 'array']);
    expect(tray?.tiles.map((tile) => tile.id)).toEqual([
      'camera',
      'pause_video',
      'show_this',
      'share_screen',
      'share_window',
      'home_camera',
      'interrupt',
      'captions',
      'settings',
    ]);
    expect(tray?.tiles.find((tile) => tile.id === 'camera')).toMatchObject({
      label: 'Camera',
      pressed: true,
    });
    expect(tray?.tiles.find((tile) => tile.id === 'captions')?.pressed).toBe(true);
  });

  it('disables tiles with the call reasons', () => {
    const reasons = { camera: 'Reconnecting…', share: 'Reconnecting…' };
    const tiles =
      overlayView(input({ call: call({ phase: 'reconnecting', reasons }) })).tray?.tiles ?? [];
    const disabled = Object.fromEntries(tiles.map((tile) => [tile.id, tile.disabled]));
    expect(disabled).toMatchObject({
      camera: 'Reconnecting…',
      pause_video: 'Reconnecting…',
      show_this: 'Reconnecting…',
      share_screen: 'Reconnecting…',
      interrupt: 'Only while the assistant is talking',
      captions: null,
      settings: null,
    });
  });

  it('offers pause only with the camera on, stop talking only while speaking', () => {
    const off = overlayView(input()).tray?.tiles ?? [];
    expect(off.find((tile) => tile.id === 'pause_video')?.disabled).toBe(
      'Turn the camera on first',
    );
    const speaking = overlayView(input({ call: call({ phase: 'speaking' }) })).tray?.tiles ?? [];
    expect(speaking.find((tile) => tile.id === 'interrupt')?.disabled).toBeNull();
  });

  it('swaps the share tile for a critical Stop sharing while sharing', () => {
    const tiles =
      overlayView(input({ call: call({ sharing: { kind: 'screen', label: null } }) })).tray
        ?.tiles ?? [];
    expect(tiles.find((tile) => tile.id === 'stop_share')).toMatchObject({
      critical: true,
      disabled: null,
    });
    expect(tiles.find((tile) => tile.id === 'share_window')?.label).toBe('Share another');
    expect(tiles.some((tile) => tile.id === 'share_screen')).toBe(false);
  });
});

describe('request card', () => {
  it('names the assistant and what it wants to see', () => {
    const request = {
      what: 'desktop_screen' as const,
      why: 'To check the error',
      expiresAt: NOW + 30_000,
    };
    expect(overlayView(input({ call: call({ request }) })).request).toEqual({
      title: 'Gemini wants to see your screen',
      why: 'To check the error',
      accept: 'Share screen',
      expiresAt: NOW + 30_000,
    });
    expect(overlayView(input({ surface: PHONE, call: call({ request }) })).request?.accept).toBe(
      'Share screen',
    );
    expect(overlayView(input()).request).toBeNull();
  });
});

describe('hosted calls', () => {
  const hosted = (patch: Parameters<typeof call>[0] = {}): ReturnType<typeof call> =>
    call({ hosted: true, ...patch });

  it('offers Mute and End, with no tray, on a call the home runs through this computer', () => {
    const view = overlayView(input({ call: hosted() }));
    expect(view).toMatchObject({
      state: 'listening',
      controls: ['mute', 'end'],
      tray: null,
      request: null,
    });
  });

  it('keeps the stop button off while the assistant speaks because the hub cannot cut in', () => {
    const view = overlayView(input({ call: hosted({ phase: 'speaking', said: 'Done' }) }));
    expect(view.controls).toEqual(['mute', 'end']);
    expect(view.level).toBe('output');
  });

  it('ignores a request on a hosted call and keeps its tray away on the phone', () => {
    const request = { what: 'desktop_screen' as const, why: 'To check', expiresAt: null };
    expect(overlayView(input({ call: hosted({ request }) })).request).toBeNull();
    const phone = overlayView(input({ surface: PHONE, call: hosted() }));
    expect(phone.controls).toEqual(['mute', 'end']);
    expect(phone.tray).toBeNull();
  });

  it('shows only End while the line is reconnecting', () => {
    expect(overlayView(input({ call: hosted({ phase: 'reconnecting' }) })).controls).toEqual([
      'end',
    ]);
  });

  it('shows a muted hosted call as muted with the heard words', () => {
    const view = overlayView(input({ call: hosted({ muted: true, heard: 'Turn it off' }) }));
    expect(view).toMatchObject({ muted: true, level: null });
  });

  it('still ends like any call', () => {
    const ended = hosted({ phase: 'ended', endedAt: NOW });
    expect(overlayView(input({ call: ended })).state).toBe('ended');
  });
});
