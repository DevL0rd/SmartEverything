import { z } from 'zod';
import { CALL_STATES, type CallState } from './assistant-voice';
import { SIGHT_SOURCE } from './call-sight';

export const ORB_STATES = ['idle', 'listening', 'thinking', 'speaking'] as const;
export type OrbState = (typeof ORB_STATES)[number];

export type CallPhase = 'idle' | CallState | 'reconnecting' | 'ended';
export const CALL_PHASES = ['idle', ...CALL_STATES, 'reconnecting', 'ended'] as const;
export const CALL_PHASE = z.enum(CALL_PHASES);

export const OVERLAY_CAMERA_PHASES = ['off', 'starting', 'on', 'paused', 'denied', 'busy'] as const;
export const OVERLAY_CAMERA_PHASE = z.enum(OVERLAY_CAMERA_PHASES);
export type OverlayCameraPhase = z.infer<typeof OVERLAY_CAMERA_PHASE>;

export const OVERLAY_STATES = [
  'hidden',
  'wake',
  'listening',
  'thinking',
  'speaking',
  'reconnecting',
  'error',
  'superseded',
  'ended',
] as const;
export const OVERLAY_STATE = z.enum(OVERLAY_STATES);
export type OverlayState = z.infer<typeof OVERLAY_STATE>;

export const OVERLAY_MODES = ['full', 'share', 'compact'] as const;
export const OVERLAY_LEVEL_SOURCES = ['input', 'output'] as const;
export const OVERLAY_GLOWS = ['bloom', 'listening', 'speaking', 'shimmer', 'off'] as const;
export const OVERLAY_CONTROLS = [
  'mute',
  'speaker',
  'camera',
  'share',
  'more',
  'stop_share',
  'interrupt',
  'end',
  'retry',
  'fix',
  'close',
] as const;
export type OverlayControl = (typeof OVERLAY_CONTROLS)[number];

export const OVERLAY_TILES = [
  'camera',
  'pause_video',
  'show_this',
  'share_screen',
  'stop_share',
  'share_window',
  'home_camera',
  'interrupt',
  'speaker',
  'captions',
  'settings',
] as const;
export type OverlayTileId = (typeof OVERLAY_TILES)[number];

export const OVERLAY_SIMPLE_ACTIONS = [
  'mute',
  'speaker',
  'end',
  'retry',
  'fix',
  'close',
  'open',
  'camera',
  'pause_video',
  'show_this',
  'share_screen',
  'share_window',
  'stop_share',
  'home_camera',
  'interrupt',
  'captions',
  'settings',
  'accept_request',
  'decline_request',
] as const;
export const OVERLAY_ACTION = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.enum(OVERLAY_SIMPLE_ACTIONS) }),
  z.strictObject({ kind: z.literal('mic'), id: z.string().nullable() }),
  z.strictObject({ kind: z.literal('volume'), value: z.number().min(0).max(1) }),
]);
export type OverlayAction = z.infer<typeof OVERLAY_ACTION>;

export const OVERLAY_SUPERSEDED_MS = 1600;
export const OVERLAY_ENDED_MS = 1200;
export const OVERLAY_ERROR_MS = 8000;
export const OVERLAY_ERROR_RELEASE_MS = 3000;
export const OVERLAY_WAKE_LINK_MS = 15_000;

export const OVERLAY_COPY = {
  listening: 'Listening',
  muted: 'Muted',
  thinking: 'Thinking',
  speaking: 'Speaking',
  reconnecting: 'Reconnecting to your home',
  unreachable: "Can't reach your home",
  microphoneBlocked: 'Microphone is blocked',
  linkFailed: 'The call did not start. Try again.',
  ended: 'Call ended',
  wakeCaption: 'Say what you need',
  answeredBy: 'Answered by',
  sharingScreen: 'sharing your screen',
  sharingWindow: 'sharing',
  cameraOn: 'camera on',
  cameraPaused: 'camera paused',
  wantsToSee: 'wants to see',
} as const;

export const OVERLAY_LABELS: Readonly<Record<OverlayControl, string>> = {
  mute: 'Mute',
  speaker: 'Speaker',
  camera: 'Camera',
  share: 'Share screen',
  more: 'More call controls',
  stop_share: 'Stop sharing',
  interrupt: 'Stop the assistant talking',
  end: 'End call',
  retry: 'Retry',
  fix: 'Fix',
  close: 'Close',
};

export const OVERLAY_PROBLEM = z.strictObject({
  text: z.string(),
  at: z.number(),
  fix: z.literal('microphone').nullable(),
});

export const OVERLAY_SHARING = z.strictObject({
  kind: z.enum(['screen', 'window']),
  label: z.string().nullable(),
});
export type OverlaySharing = z.infer<typeof OVERLAY_SHARING>;

export const OVERLAY_REQUEST_INPUT = z.strictObject({
  what: SIGHT_SOURCE,
  why: z.string(),
  expiresAt: z.number().nullable(),
});

export const OVERLAY_CALL = z.strictObject({
  phase: CALL_PHASE,
  muted: z.boolean(),
  heard: z.string(),
  said: z.string(),
  tool: z.string().nullable(),
  problem: OVERLAY_PROBLEM.nullable(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  assistant: z.string(),
  chat: z.string().nullable(),
  camera: OVERLAY_CAMERA_PHASE,
  speaker: z.boolean().nullable(),
  sharing: OVERLAY_SHARING.nullable(),
  request: OVERLAY_REQUEST_INPUT.nullable(),
  reasons: z.strictObject({ camera: z.string().nullable(), share: z.string().nullable() }),
  hosted: z.exactOptional(z.boolean()),
});
export type OverlayCall = z.infer<typeof OVERLAY_CALL>;

export const OVERLAY_MAIN_WINDOWS = ['call', 'other', 'away'] as const;
export const OVERLAY_SURFACE = z.discriminatedUnion('platform', [
  z.strictObject({
    platform: z.literal('desktop'),
    main: z.enum(OVERLAY_MAIN_WINDOWS),
    inShare: z.boolean(),
  }),
  z.strictObject({ platform: z.literal('phone'), foreground: z.boolean() }),
]);
export type OverlaySurface = z.infer<typeof OVERLAY_SURFACE>;

export const OVERLAY_MIC = z.strictObject({ id: z.string(), label: z.string() });
export const OVERLAY_AUDIO = z.strictObject({
  mics: z.array(OVERLAY_MIC),
  micId: z.string().nullable(),
  volume: z.number().min(0).max(1),
});
export type OverlayAudio = z.infer<typeof OVERLAY_AUDIO>;

export const OVERLAY_POSITIONS = ['centre', 'left', 'right'] as const;
export const OVERLAY_DISPLAYS = ['active', 'primary', 'app'] as const;
export const OVERLAY_WHILE_SHARING = ['small', 'hide'] as const;
export const OVERLAY_PREFS = z.strictObject({
  enabled: z.boolean().default(true),
  position: z.enum(OVERLAY_POSITIONS).default('centre'),
  glow: z.boolean().default(true),
  captions: z.boolean().default(true),
  display: z.enum(OVERLAY_DISPLAYS).default('active'),
  whileSharing: z.enum(OVERLAY_WHILE_SHARING).default('small'),
});
export type OverlayPrefs = z.infer<typeof OVERLAY_PREFS>;
export const DEFAULT_OVERLAY_PREFS: OverlayPrefs = OVERLAY_PREFS.parse({});

export const OVERLAY_INPUT = z.strictObject({
  prefs: OVERLAY_PREFS,
  surface: OVERLAY_SURFACE,
  call: OVERLAY_CALL.nullable(),
  wake: z
    .strictObject({ at: z.number(), words: z.string().nullable(), muted: z.boolean() })
    .nullable(),
  superseded: z.strictObject({ by: z.string(), at: z.number() }).nullable(),
  audio: OVERLAY_AUDIO,
  hold: z.strictObject({ active: z.boolean(), endedAt: z.number().nullable() }),
  now: z.number(),
});
export type OverlayInput = z.infer<typeof OVERLAY_INPUT>;

export const OVERLAY_TILE = z.strictObject({
  id: z.enum(OVERLAY_TILES),
  label: z.string(),
  pressed: z.boolean().nullable(),
  disabled: z.string().nullable(),
  critical: z.boolean(),
});
export type OverlayTile = z.infer<typeof OVERLAY_TILE>;

export const OVERLAY_TRAY = z.strictObject({
  assistant: z.string(),
  chat: z.string().nullable(),
  elapsedFrom: z.number().nullable(),
  tiles: z.array(OVERLAY_TILE),
  mics: z.array(OVERLAY_MIC),
  micId: z.string().nullable(),
  volume: z.number().min(0).max(1),
});
export type OverlayTray = z.infer<typeof OVERLAY_TRAY>;

export const OVERLAY_REQUEST = z.strictObject({
  title: z.string(),
  why: z.string(),
  accept: z.string(),
  expiresAt: z.number().nullable(),
});
export type OverlayRequest = z.infer<typeof OVERLAY_REQUEST>;

export const OVERLAY_VIEW = z.strictObject({
  state: OVERLAY_STATE,
  mode: z.enum(OVERLAY_MODES),
  status: z.string(),
  detail: z.string().nullable(),
  caption: z.string().nullable(),
  orb: z.enum(ORB_STATES),
  level: z.enum(OVERLAY_LEVEL_SOURCES).nullable(),
  glow: z.enum(OVERLAY_GLOWS),
  controls: z.array(z.enum(OVERLAY_CONTROLS)),
  muted: z.boolean(),
  speaker: z.boolean().nullable(),
  camera: OVERLAY_CAMERA_PHASE,
  tray: OVERLAY_TRAY.nullable(),
  request: OVERLAY_REQUEST.nullable(),
  changesAt: z.number().nullable(),
});
export type OverlayView = z.infer<typeof OVERLAY_VIEW>;

export const OVERLAY_THEMES = ['light', 'dark'] as const;
export const OVERLAY_THEME = z.enum(OVERLAY_THEMES);
export type OverlayTheme = z.infer<typeof OVERLAY_THEME>;

export const OVERLAY_HOST_VIEW = OVERLAY_VIEW.extend({
  prefs: OVERLAY_PREFS,
  theme: OVERLAY_THEME,
  reducedMotion: z.boolean(),
});
export type OverlayHostView = z.infer<typeof OVERLAY_HOST_VIEW>;

export const OVERLAY_PHONE_PREFS = OVERLAY_PREFS.extend({ theme: OVERLAY_THEME });
export type OverlayPhonePrefs = z.infer<typeof OVERLAY_PHONE_PREFS>;

export const OVERLAY_LEVEL_SHAPE = 0.6;
export const OVERLAY_LEVEL_FLOOR = 0.03;
export const OVERLAY_LEVEL_REST = 0.01;
export const OVERLAY_LEVEL_ATTACK_MS = 40;
export const OVERLAY_LEVEL_RELEASE_MS = 180;

export function overlayLevel(previous: number, sample: number, dtMs: number): number {
  const from = clamp01(previous);
  if (!(dtMs > 0)) return from;
  const shaped = clamp01(sample) ** OVERLAY_LEVEL_SHAPE;
  const target = shaped < OVERLAY_LEVEL_FLOOR ? 0 : shaped;
  const tau = target > from ? OVERLAY_LEVEL_ATTACK_MS : OVERLAY_LEVEL_RELEASE_MS;
  const next = from + (target - from) * (1 - Math.exp(-dtMs / tau));
  return next < OVERLAY_LEVEL_REST && target === 0 ? 0 : next;
}

function clamp01(value: number): number {
  if (!(value > 0)) return 0;
  return value > 1 ? 1 : value;
}

export function overlayDuration(startedAt: number | null, endedAt: number | null): string | null {
  if (startedAt === null || endedAt === null || endedAt < startedAt) return null;
  const seconds = Math.floor((endedAt - startedAt) / 1000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}
