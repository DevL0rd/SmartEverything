import { z } from 'zod';
import {
  DEFAULT_SIGHT_LOOK,
  SIGHT_MEMORY_DEFAULT_SECONDS,
  SIGHT_MEMORY_SECONDS,
  SIGHT_MODE,
  SIGHT_SOURCE,
} from './call-sight';
import { NUTRITION_PREF } from './foods';
import {
  DEFAULT_PAUSE_MS,
  DEFAULT_VOICE_DETECTION,
  ECHO_MODES,
  PAUSE_CHOICES_MS,
  VOICE_DETECTIONS,
} from './voice-activity';
import { REGION_PREF } from './region';
import { JSON_VALUE, type JsonValue } from './values';

export const THEMES = ['system', 'light', 'dark'] as const;
export const ACCENTS = ['amber', 'aqua', 'rose', 'violet', 'lime', 'ice'] as const;
export const AMBIENT_BACKGROUNDS = ['ambient', 'off'] as const;
export const SURFACE_STYLES = ['solid', 'translucent'] as const;
export const CORNER_STYLES = ['sharp', 'soft', 'round'] as const;
export const DENSITY_STYLES = ['comfortable', 'compact'] as const;
export const MOTION_STYLES = ['system', 'full', 'reduced'] as const;

export const APPEARANCE_PREF = z.strictObject({
  theme: z.enum(THEMES),
  accent: z.enum(ACCENTS),
  background: z.enum(AMBIENT_BACKGROUNDS),
  surface: z.enum(SURFACE_STYLES),
  corners: z.enum(CORNER_STYLES),
  density: z.enum(DENSITY_STYLES),
  motion: z.enum(MOTION_STYLES),
});

export type AppearancePref = z.infer<typeof APPEARANCE_PREF>;

export const APPEARANCE_PREF_CHOICES: {
  readonly [K in keyof AppearancePref]: readonly AppearancePref[K][];
} = {
  theme: THEMES,
  accent: ACCENTS,
  background: AMBIENT_BACKGROUNDS,
  surface: SURFACE_STYLES,
  corners: CORNER_STYLES,
  density: DENSITY_STYLES,
  motion: MOTION_STYLES,
};

const LEGACY_APPEARANCE = z.object({
  accent: z.enum(ACCENTS),
  background: z.enum(['aurora', 'drift', 'still', 'off']),
  surface: z.enum(['glass', 'solid', 'outline']),
  corners: z.enum(CORNER_STYLES),
  density: z.enum(['compact', 'cozy']),
  motion: z.enum(['full', 'reduced']),
});

function legacyAppearance(stored: unknown): AppearancePref | null {
  const parsed = LEGACY_APPEARANCE.safeParse(stored);
  if (!parsed.success) {
    return null;
  }
  const old = parsed.data;
  return {
    theme: 'system',
    accent: old.accent,
    background: old.background === 'off' ? 'off' : 'ambient',
    surface: old.surface === 'glass' ? 'translucent' : 'solid',
    corners: old.corners,
    density: old.density === 'cozy' ? 'comfortable' : 'compact',
    motion: old.motion,
  };
}

export const CALL_RING_PREF = z.strictObject({
  sound: z.boolean(),
  mutedUntil: z.iso.datetime({ offset: true }).nullable(),
});

export type CallRingPref = z.infer<typeof CALL_RING_PREF>;

function legacyCallRing(stored: unknown): CallRingPref | null {
  const parsed = z.object({ muted: z.boolean() }).safeParse(stored);
  return parsed.success ? { sound: !parsed.data.muted, mutedUntil: null } : null;
}

export const ECHO_TEST_OUTCOMES = ['none', 'some', 'strong', 'failed'] as const;

export type EchoTestOutcome = (typeof ECHO_TEST_OUTCOMES)[number];

export const CALL_FACINGS = ['front', 'back'] as const;

const PAUSE_MS = z.union([
  z.literal(PAUSE_CHOICES_MS[0]),
  z.literal(PAUSE_CHOICES_MS[1]),
  z.literal(PAUSE_CHOICES_MS[2]),
  z.literal(PAUSE_CHOICES_MS[3]),
  z.literal(PAUSE_CHOICES_MS[4]),
]);

export const CALL_AUDIO_PREF = z.strictObject({
  echo: z
    .enum(ECHO_MODES)
    .describe(
      'headphones: no echo handling, interrupt any time. normal: cancels echo, speak up to interrupt. strong: loud speakers or echoey rooms, interrupting needs a louder voice. no_interrupt: the assistant finishes before it listens',
    ),
  detection: z
    .enum(VOICE_DETECTIONS)
    .describe(
      'Voice detection: less ignores quiet voices and background talk, standard suits most rooms, more picks up quiet or distant speech',
    ),
  pause_ms: PAUSE_MS.describe(
    'How long to wait after the person stops talking before the assistant answers, in milliseconds: 200, 320, 640, 1000 or 2500',
  ),
  noise_suppression: z.boolean().describe('Remove steady noise such as fans'),
  auto_gain: z.boolean().describe('Even out the person’s volume (automatic gain control)'),
  input: z
    .string()
    .min(1)
    .max(200)
    .describe('Microphone: auto, or a device id the app lists in the call settings'),
  output: z
    .string()
    .min(1)
    .max(200)
    .describe(
      'Speaker: speaker, earpiece, auto, or a device id the app lists in the call settings',
    ),
  volume: z.number().min(0).max(1).describe('The assistant’s volume in a call, 0 to 1'),
  video_mode: SIGHT_MODE.describe(
    'live: pictures stream while a source is on. on_demand: one still when the assistant needs to see or the person taps Show this',
  ),
  memory_seconds: SIGHT_MEMORY_SECONDS.describe(
    'How many seconds of video the assistant keeps in memory; older pictures are dropped. 5, 15, 30, 60 or any value from 5 to 300',
  ),
  look: z
    .array(SIGHT_SOURCE)
    .max(SIGHT_SOURCE.options.length)
    .describe(
      'What the assistant may look at on its own initiative: home_camera, phone_camera, phone_screen, desktop_screen, desktop_window. When the person asks about something, looking is always allowed',
    ),
  facing: z.enum(CALL_FACINGS).describe('Which phone camera a call starts with'),
  last_echo_test: z
    .strictObject({
      outcome: z.enum(ECHO_TEST_OUTCOMES),
      at: z.iso.datetime({ offset: true }),
    })
    .nullable()
    .describe('The last echo test on this device'),
});

export type CallAudioPref = z.infer<typeof CALL_AUDIO_PREF>;

export const CAMERA_AWAY_MODES = ['direct', 'server'] as const;

export const CAMERAS_PREF = z.strictObject({
  awayMode: z.enum(CAMERA_AWAY_MODES),
  muted: z.boolean(),
});

export type CamerasPref = z.infer<typeof CAMERAS_PREF>;

function legacyCameras(stored: unknown): CamerasPref | null {
  const parsed = z.strictObject({ version: z.literal(1), value: CAMERAS_PREF }).safeParse(stored);
  return parsed.success ? { awayMode: parsed.data.value.awayMode, muted: true } : null;
}

export const HEALTH_SYNC_INTERVALS = [0, 15, 30, 60] as const;

export const HEALTH_SYNC_PREF = z.strictObject({
  intervalMinutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]),
});

export type HealthSyncPref = z.infer<typeof HEALTH_SYNC_PREF>;

export const AI_MODELS_PREF = z.strictObject({
  favourites: z.array(z.string().min(1).max(200)).max(100),
});

export type AiModelsPref = z.infer<typeof AI_MODELS_PREF>;

export const AI_SPEECH_PREF = z.strictObject({ showText: z.boolean() });

export type AiSpeechPref = z.infer<typeof AI_SPEECH_PREF>;

export type ClientPrefRead<T> =
  | { readonly status: 'absent'; readonly value: T }
  | { readonly status: 'stored'; readonly value: T; readonly migrated: boolean }
  | { readonly status: 'invalid'; readonly reason: string };

export const LAYOUT_SCOPES = ['profile', 'client'] as const;

export type LayoutScope = (typeof LAYOUT_SCOPES)[number];

export interface ClientPrefDefinition<T> {
  readonly storageKey: string;
  readonly scope: LayoutScope;
  readonly version: number;
  readonly defaultValue: T;
  readonly schema: z.ZodType<T>;
  readonly decode: (stored: unknown) => ClientPrefRead<T>;
  readonly encode: (value: T) => Readonly<Record<string, JsonValue>>;
}

interface ClientPrefSpec<T> {
  readonly storageKey: string;
  readonly scope: LayoutScope;
  readonly version: number;
  readonly defaultValue: NoInfer<T>;
  readonly schema: z.ZodType<T>;
  readonly legacy: (stored: unknown) => NoInfer<T> | null;
}

const STORED_OBJECT = z.record(z.string(), JSON_VALUE);

function decoderOf<T>(spec: ClientPrefSpec<T>): (stored: unknown) => ClientPrefRead<T> {
  const envelope = z.strictObject({ version: z.literal(spec.version), value: spec.schema });
  return (stored) => {
    if (stored === null || stored === undefined) {
      return { status: 'absent', value: spec.defaultValue };
    }
    const current = envelope.safeParse(stored);
    if (current.success) {
      return { status: 'stored', value: current.data.value, migrated: false };
    }
    const legacy = spec.legacy(stored);
    if (legacy !== null) {
      return { status: 'stored', value: legacy, migrated: true };
    }
    return {
      status: 'invalid',
      reason: `The saved ${spec.storageKey} preference is not version ${String(spec.version)}: ${current.error.message}`,
    };
  };
}

function clientPref<T>(spec: ClientPrefSpec<T>): ClientPrefDefinition<T> {
  return {
    storageKey: spec.storageKey,
    scope: spec.scope,
    version: spec.version,
    defaultValue: spec.defaultValue,
    schema: spec.schema,
    decode: decoderOf(spec),
    encode: (value) =>
      STORED_OBJECT.parse({
        version: spec.version,
        value: JSON_VALUE.parse(spec.schema.parse(value)),
      }),
  };
}

function noLegacy(): null {
  return null;
}

export const CLIENT_PREFS = {
  appearance: clientPref({
    storageKey: 'appearance',
    scope: 'profile',
    version: 2,
    defaultValue: {
      theme: 'system',
      accent: 'amber',
      background: 'ambient',
      surface: 'solid',
      corners: 'soft',
      density: 'comfortable',
      motion: 'system',
    },
    schema: APPEARANCE_PREF,
    legacy: legacyAppearance,
  }),
  call_ring: clientPref({
    storageKey: 'call-ring',
    scope: 'profile',
    version: 2,
    defaultValue: { sound: true, mutedUntil: null },
    schema: CALL_RING_PREF,
    legacy: legacyCallRing,
  }),
  cameras: clientPref({
    storageKey: 'camera-prefs',
    scope: 'client',
    version: 2,
    defaultValue: { awayMode: 'direct', muted: true },
    schema: CAMERAS_PREF,
    legacy: legacyCameras,
  }),
  call_audio: clientPref({
    storageKey: 'call-audio',
    scope: 'client',
    version: 1,
    defaultValue: {
      echo: 'normal',
      detection: DEFAULT_VOICE_DETECTION,
      pause_ms: DEFAULT_PAUSE_MS,
      noise_suppression: true,
      auto_gain: true,
      input: 'auto',
      output: 'speaker',
      volume: 1,
      video_mode: 'live',
      memory_seconds: SIGHT_MEMORY_DEFAULT_SECONDS,
      look: [...DEFAULT_SIGHT_LOOK],
      facing: 'back',
      last_echo_test: null,
    },
    schema: CALL_AUDIO_PREF,
    legacy: noLegacy,
  }),
  health_sync: clientPref({
    storageKey: 'health-sync',
    scope: 'client',
    version: 1,
    defaultValue: { intervalMinutes: 60 },
    schema: HEALTH_SYNC_PREF,
    legacy: noLegacy,
  }),
  nutrition: clientPref({
    storageKey: 'nutrition',
    scope: 'profile',
    version: 1,
    defaultValue: {
      energyKcal: null,
      proteinG: null,
      carbohydrateG: null,
      fatG: null,
      glassMl: 250,
    },
    schema: NUTRITION_PREF,
    legacy: noLegacy,
  }),
  ai_models: clientPref({
    storageKey: 'ai-models',
    scope: 'profile',
    version: 1,
    defaultValue: { favourites: [] },
    schema: AI_MODELS_PREF,
    legacy: noLegacy,
  }),
  ai_speech: clientPref({
    storageKey: 'ai-speech',
    scope: 'profile',
    version: 1,
    defaultValue: { showText: false },
    schema: AI_SPEECH_PREF,
    legacy: noLegacy,
  }),
  region: clientPref({
    storageKey: 'region',
    scope: 'profile',
    version: 1,
    defaultValue: { region: 'auto' },
    schema: REGION_PREF,
    legacy: noLegacy,
  }),
} as const;

export type ClientPrefKey = keyof typeof CLIENT_PREFS;

export type ClientPrefValue<K extends ClientPrefKey> =
  (typeof CLIENT_PREFS)[K] extends ClientPrefDefinition<infer T> ? T : never;

export const CLIENT_PREF_KEYS: readonly ClientPrefKey[] = [
  'appearance',
  'call_ring',
  'call_audio',
  'cameras',
  'health_sync',
  'nutrition',
  'ai_models',
  'ai_speech',
  'region',
];

export const RESERVED_LAYOUT_KEYS: ReadonlySet<string> = new Set(
  CLIENT_PREF_KEYS.map((key) => CLIENT_PREFS[key].storageKey),
);

const CLIENT_SCOPED_PAGES: ReadonlySet<string> = new Set(
  CLIENT_PREF_KEYS.filter((key) => CLIENT_PREFS[key].scope === 'client').map(
    (key) => CLIENT_PREFS[key].storageKey,
  ),
);

export function layoutScopeOf(page: string): LayoutScope {
  return CLIENT_SCOPED_PAGES.has(page) ? 'client' : 'profile';
}
