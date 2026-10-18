import {
  DEFAULT_OVERLAY_PREFS,
  overlayLevel,
  overlayView,
  type OverlayCall,
  type OverlayInput,
  type OverlayView,
} from '../../src';

export const NOW = 100_000;

export function call(patch: Partial<OverlayCall> = {}): OverlayCall {
  return {
    phase: 'listening',
    muted: false,
    heard: '',
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
    audio: {
      mics: [
        { id: 'yeti', label: 'Blue Yeti (USB)' },
        { id: 'array', label: 'Laptop microphone array' },
      ],
      micId: null,
      volume: 0.8,
    },
    hold: { active: false, endedAt: null },
    now: NOW,
    ...patch,
  };
}

export const PHONE: OverlayInput['surface'] = { platform: 'phone', foreground: false };

const LEVEL_STEPS = [
  { sample: 0, dtMs: 16 },
  { sample: 0.5, dtMs: 16 },
  { sample: 1, dtMs: 16 },
  { sample: 1, dtMs: 40 },
  { sample: 0.00001, dtMs: 180 },
  { sample: 0, dtMs: 16 },
  { sample: 0.25, dtMs: 33 },
  { sample: 2, dtMs: 16 },
  { sample: -1, dtMs: 16 },
  { sample: 0.3, dtMs: 0 },
] as const;

export function levelVectors(): { sample: number; dtMs: number; previous: number; next: number }[] {
  let previous = 0;
  return LEVEL_STEPS.map((step) => {
    const next = overlayLevel(previous, step.sample, step.dtMs);
    const row = { sample: step.sample, dtMs: step.dtMs, previous, next };
    previous = next;
    return row;
  });
}

function problem(text: string, at: number): OverlayCall['problem'] {
  return { text, at, fix: null };
}

const NAMED: readonly (readonly [string, OverlayInput])[] = [
  ['wake', input({ call: null, wake: { at: NOW, words: null, muted: false } })],
  ['wake-words-muted', input({ call: null, wake: { at: NOW, words: 'hey home', muted: true } })],
  [
    'wake-link-failed',
    input({ call: null, wake: { at: NOW - 15_000, words: null, muted: false } }),
  ],
  ['listening', input({ call: call({ heard: 'turn off the lights' }) })],
  ['muted', input({ call: call({ muted: true }) })],
  ['thinking-tool', input({ call: call({ phase: 'thinking', tool: 'Checking the kitchen' }) })],
  ['speaking', input({ call: call({ phase: 'speaking', said: 'Done' }) })],
  ['reconnecting', input({ call: call({ phase: 'reconnecting' }) })],
  ['error', input({ call: call({ problem: problem('no route', NOW - 1000) }) })],
  ['error-expired', input({ call: call({ problem: problem('no route', NOW - 8000) }) })],
  ['superseded', input({ superseded: { by: 'Living room camera', at: NOW - 100 } })],
  ['ended', input({ call: call({ phase: 'ended', endedAt: NOW - 100 }) })],
  ['ended-expired', input({ call: call({ phase: 'ended', endedAt: NOW - 1200 }) })],
  ['call-page-focused', input({ surface: { platform: 'desktop', main: 'call', inShare: false } })],
  [
    'other-page-compact',
    input({ surface: { platform: 'desktop', main: 'other', inShare: false } }),
  ],
  ['share-window', input({ call: call({ sharing: { kind: 'window', label: 'Firefox' } }) })],
  ['phone-speaking', input({ surface: PHONE, call: call({ phase: 'speaking', said: 'Done' }) })],
  ['phone-foreground', input({ surface: { platform: 'phone', foreground: true } })],
  [
    'phone-camera-paused-reconnecting',
    input({
      surface: PHONE,
      call: call({ phase: 'reconnecting', camera: 'paused', speaker: false }),
    }),
  ],
  [
    'phone-sharing-speaker',
    input({
      surface: PHONE,
      call: call({ speaker: true, sharing: { kind: 'screen', label: null } }),
    }),
  ],
];

export function viewVectors(): { name: string; input: OverlayInput; view: OverlayView }[] {
  return NAMED.map(([name, value]) => ({ name, input: value, view: overlayView(value) }));
}
