import {
  DEFAULT_OVERLAY_PREFS,
  overlayView,
  type OverlayCall,
  type OverlayHostView,
  type OverlayInput,
} from '@smarteverything/domain';

export const NOW = 100_000;

export function call(patch: Partial<OverlayCall> = {}): OverlayCall {
  return {
    phase: 'listening',
    muted: false,
    heard: 'turn off the kitchen lights',
    said: '',
    tool: null,
    problem: null,
    startedAt: NOW - 134_000,
    endedAt: null,
    assistant: 'Gemini',
    chat: 'Kitchen and evening routine',
    camera: 'off',
    speaker: null,
    sharing: null,
    request: null,
    reasons: { camera: null, share: null },
    ...patch,
  };
}

export function input(patch: Partial<OverlayInput> = {}): OverlayInput {
  return {
    prefs: DEFAULT_OVERLAY_PREFS,
    surface: { platform: 'desktop', main: 'away', inShare: false },
    call: call(),
    wake: null,
    superseded: null,
    audio: { mics: [{ id: 'yeti', label: 'Blue Yeti (USB)' }], micId: null, volume: 0.8 },
    hold: { active: false, endedAt: null },
    now: NOW,
    ...patch,
  };
}

export function host(
  value: OverlayInput = input(),
  theme: 'dark' | 'light' = 'dark',
): OverlayHostView {
  return { ...overlayView(value), prefs: value.prefs, theme, reducedMotion: false };
}

export const HIDDEN = host(
  input({ surface: { platform: 'desktop', main: 'call', inShare: false } }),
);
