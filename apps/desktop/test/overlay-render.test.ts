import { describe, expect, it } from 'vitest';
import type { OverlayVoice } from '@smarteverything/domain';
import {
  barModeOf,
  type ControlModel,
  cardModel,
  glowModel,
  pillModel,
  restMs,
  textOf,
  trayModel,
} from '../src/overlay/overlay-render.js';
import { call, host, input, NOW } from './support/overlay-views.js';

const SHARING = { kind: 'screen', label: null } as const;
const OTHER_PAGE = { platform: 'desktop', main: 'other', inShare: false } as const;

function ids(view = host()): string[] {
  return pillModel(view, false).controls.map((control) => control.id);
}

describe('pill model controls', () => {
  it('shows mute, camera, share, more and end in the full pill', () => {
    expect(ids()).toEqual(['mute', 'camera', 'share', 'more', 'end']);
  });

  it('drops the camera and share buttons in the compact bar and keeps more and end', () => {
    expect(ids(host(input({ surface: OTHER_PAGE })))).toEqual(['mute', 'more', 'end']);
  });

  it('puts a Stop sharing chip in the share bar', () => {
    const share = pillModel(host(input({ call: call({ sharing: SHARING }) })), false);
    expect(share.controls.map((control) => [control.id, control.look])).toEqual([
      ['mute', 'icon'],
      ['stop_share', 'chip'],
      ['more', 'icon'],
      ['end', 'icon'],
    ]);
  });

  it('keeps constant accessible names and moves the change to the tooltip', () => {
    const live = pillModel(host(), false).controls.find((control) => control.id === 'mute');
    const muted = pillModel(host(input({ call: call({ muted: true }) })), false).controls.find(
      (control) => control.id === 'mute',
    );
    expect(live).toMatchObject({ label: 'Mute', tip: 'Mute', pressed: false, icon: 'mic' });
    expect(muted).toMatchObject({ label: 'Mute', tip: 'Unmute', pressed: true, icon: 'micOff' });
  });

  it('marks the camera pressed with a live dot only while it is on', () => {
    const on = pillModel(host(input({ call: call({ camera: 'on' }) })), false).controls[1];
    const paused = pillModel(host(input({ call: call({ camera: 'paused' }) })), false).controls[1];
    expect(on).toMatchObject({ pressed: true, dot: true, tip: 'Turn camera off' });
    expect(paused).toMatchObject({ pressed: true, dot: false });
    expect(pillModel(host(), false).controls[1]).toMatchObject({
      pressed: false,
      tip: 'Turn camera on',
    });
  });

  it('flips the more chevron with the tray and with the compact side', () => {
    const more = (view: ReturnType<typeof host>, open: boolean): ControlModel | undefined =>
      pillModel(view, open).controls.find((control) => control.id === 'more');
    expect(more(host(), false)).toMatchObject({ icon: 'more', expanded: false });
    expect(more(host(), true)).toMatchObject({ icon: 'less', expanded: true });
    const compact = host(input({ surface: OTHER_PAGE }));
    expect(more(compact, false)?.icon).toBe('less');
    expect(more(compact, true)?.icon).toBe('more');
  });

  it('names the retry, fix and close controls on an error', () => {
    const error = host(
      input({ call: call({ problem: { text: 'no route', at: NOW - 100, fix: null } }) }),
    );
    expect(pillModel(error, false).controls.map((control) => [control.id, control.look])).toEqual([
      ['retry', 'text'],
      ['close', 'icon'],
    ]);
    const microphone = host(
      input({ call: call({ problem: { text: 'blocked', at: NOW - 100, fix: 'microphone' } }) }),
    );
    expect(ids(microphone)).toEqual(['fix', 'close']);
  });
});

describe('pill model orb and meters', () => {
  it('turns the orb into the stop button while the assistant speaks', () => {
    const speaking = host(input({ call: call({ phase: 'speaking', said: 'Done' }) }));
    expect(pillModel(speaking, false)).toMatchObject({
      stopOrb: true,
      meterStop: false,
      meter: 'ribbon',
    });
    expect(pillModel(host(), false).stopOrb).toBe(false);
  });

  it('turns the meter into the stop button in the calm bars', () => {
    const speaking = host(
      input({ call: call({ phase: 'speaking', said: 'Done', sharing: SHARING }) }),
    );
    expect(pillModel(speaking, false)).toMatchObject({
      stopOrb: false,
      meterStop: true,
      meter: 'mini',
    });
  });

  it('uses the ribbon in the full pill and the five-bar meter in the bars', () => {
    expect(pillModel(host(), false).meter).toBe('ribbon');
    expect(pillModel(host(input({ surface: OTHER_PAGE })), false).meter).toBe('mini');
    const reconnecting = host(input({ call: call({ phase: 'reconnecting' }) }));
    expect(pillModel(reconnecting, false).meter).toBeNull();
  });

  it('dims the orb while reconnecting and on an error', () => {
    expect(pillModel(host(input({ call: call({ phase: 'reconnecting' }) })), false).dim).toBe(true);
    expect(pillModel(host(), false).dim).toBe(false);
  });
});

describe('text model', () => {
  it('shows the caption in the full pill and only the status in a bar', () => {
    expect(textOf(host()).caption).toBe('turn off the kitchen lights');
    const bar = textOf(host(input({ surface: OTHER_PAGE })));
    expect(bar.caption).toBeNull();
    expect(bar.single).toBe(true);
    expect(barModeOf(host(input({ surface: OTHER_PAGE })))).toBe(true);
  });

  it('keeps one key while only the caption changes so the text does not cross-fade', () => {
    const first = textOf(host());
    const later = textOf(
      host(input({ call: call({ heard: 'turn off the kitchen lights and lock' }) })),
    );
    expect(later.key).toBe(first.key);
    expect(
      textOf(host(input({ call: call({ phase: 'thinking', tool: 'Checking' }) }))).key,
    ).not.toBe(first.key);
  });

  it('carries the camera detail and flags errors', () => {
    expect(textOf(host(input({ call: call({ camera: 'on' }) }))).detail).toBe('camera on');
    const error = host(
      input({ call: call({ problem: { text: 'no route', at: NOW - 100, fix: null } }) }),
    );
    expect(textOf(error)).toMatchObject({
      error: true,
      status: "Can't reach your home",
      caption: 'no route',
    });
  });
});

describe('tray and request card models', () => {
  it('lists every tile with constant labels, reasons as tooltips and a critical stop', () => {
    const view = host(input({ call: call({ sharing: SHARING }) }));
    const tray = trayModel(view, NOW);
    expect(tray?.tiles.map((tile) => tile.id)).toEqual([
      'camera',
      'pause_video',
      'show_this',
      'stop_share',
      'share_window',
      'home_camera',
      'interrupt',
      'captions',
      'settings',
    ]);
    expect(tray?.tiles.find((tile) => tile.id === 'stop_share')?.critical).toBe(true);
    const pause = tray?.tiles.find((tile) => tile.id === 'pause_video');
    expect(pause).toMatchObject({ disabled: true, tip: 'Turn the camera on first' });
  });

  it('shows the camera tile as off until the camera runs', () => {
    expect(trayModel(host(), NOW)?.tiles[0]).toMatchObject({ icon: 'camOff', pressed: false });
    expect(trayModel(host(input({ call: call({ camera: 'on' }) })), NOW)?.tiles[0]).toMatchObject({
      icon: 'cam',
      pressed: true,
    });
  });

  it('puts Automatic first in the microphone list and shows the volume as a percent', () => {
    const tray = trayModel(host(), NOW);
    expect(tray?.mics).toEqual([
      { id: '', label: 'Automatic' },
      { id: 'yeti', label: 'Blue Yeti (USB)' },
    ]);
    expect(tray?.micId).toBe('');
    expect(tray?.volume).toBe(80);
  });

  it('writes the chat and the elapsed time under the assistant name', () => {
    expect(trayModel(host(), NOW)?.subtitle).toBe('Kitchen and evening routine · 2:14');
  });

  it('has no tray or card for a view without them', () => {
    const ended = host(input({ call: call({ phase: 'ended', endedAt: NOW - 100 }) }));
    expect(trayModel(ended, NOW)).toBeNull();
    expect(cardModel(host())).toBeNull();
  });

  it('builds the request card from the contract', () => {
    const view = host(
      input({
        call: call({
          request: { what: 'desktop_window', why: 'To check the error', expiresAt: null },
        }),
      }),
    );
    expect(cardModel(view)).toMatchObject({
      title: 'Gemini wants to see a window',
      why: 'To check the error',
      accept: 'Share a window',
      decline: 'Not now',
    });
  });
});

describe('glow model', () => {
  it('maps the contract glow to the page glow and plays the bloom once from the wake', () => {
    expect(glowModel(host(), true)).toMatchObject({
      mode: 'listening',
      bloom: false,
      visible: true,
      still: false,
    });
    const wake = host(input({ call: null, wake: { at: NOW, words: null, muted: false } }));
    expect(glowModel(wake, true)).toMatchObject({ mode: 'listening', bloom: true });
    const thinking = host(input({ call: call({ phase: 'thinking' }) }));
    expect(glowModel(thinking, true).mode).toBe('thinking');
  });

  it('turns the glow still without gpu compositing or with reduced motion', () => {
    expect(glowModel(host(), false).still).toBe(true);
    expect(glowModel({ ...host(), reducedMotion: true }, true).still).toBe(true);
  });

  it('draws no glow in the calm bars or when the glow is off', () => {
    expect(glowModel(host(input({ surface: OTHER_PAGE })), true).visible).toBe(false);
    expect(glowModel(host(input({ prefs: { ...input().prefs, glow: false } })), true).visible).toBe(
      false,
    );
  });
});

describe('rest timing', () => {
  it('rests after 8 s of silence and 3 s into thinking', () => {
    expect(restMs('listening')).toBe(8000);
    expect(restMs('thinking')).toBe(3000);
  });
});

describe('thinking on the overlay', () => {
  const voice = (thinking_level: 'off' | 'high'): OverlayVoice => ({
    thinking_level,
    saving: false,
    failed: false,
    changedInCall: false,
  });

  it('shows the chip only on the calm bars, with the slashed brain for off', () => {
    expect(pillModel(host(), false).chip).toBeNull();
    const compact = host(input({ surface: OTHER_PAGE }));
    expect(pillModel(compact, false).chip).toMatchObject({
      icon: 'brainOff',
      label: 'Thinking off',
      warm: false,
    });
    const high = host(input({ surface: OTHER_PAGE, voice: voice('high') }));
    expect(pillModel(high, false).chip).toMatchObject({ icon: 'brain', label: 'Thinking: High' });
  });

  it('carries the picker state in the tray and loads without a value', () => {
    expect(trayModel(host(input({ voice: voice('high') })), NOW)?.setup).toMatchObject({
      level: 'high',
      state: 'ready',
    });
    expect(trayModel(host(input({ voice: null })), NOW)?.setup).toMatchObject({
      level: null,
      state: 'loading',
    });
  });
});
