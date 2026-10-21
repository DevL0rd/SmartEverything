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
  DEFAULT_VOICE_DETECTION,
  ECHO_MODES,
  VOICE_DETECTIONS,
  type PauseChoiceMs,
} from './voice-activity';
import { REGION_PREF } from './region';
import {
  DEFAULT_NAVIGATION_LAYOUT,
  NAVIGATION_DEVICE_PREF,
  NAVIGATION_LAYOUT,
} from './navigation-layout';
import { CAMERA_NOTIFICATIONS_PREF, DEFAULT_CAMERA_NOTIFICATIONS } from './camera-notifications';
import { DEVICE_ALERTS_PREF } from './device-alerts';
import { SHARED_CLIPBOARD_PREF } from './shared-clipboard';
import { AUTOMATION_CLIENT_PREFS } from './automation-v3/prefs';
import {
  clientPref,
  noLegacy,
  type ClientPrefDefinition,
  type LayoutScope,
} from './client-pref-definition';
export type { ClientPrefRead, ClientPrefDefinition, LayoutScope } from './client-pref-definition';
export { LAYOUT_SCOPES } from './client-pref-definition';

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

export type CallAudio = CallAudioPref & { readonly pause_ms: PauseChoiceMs };

export function callAudioWith(pref: CallAudioPref, pauseMs: PauseChoiceMs): CallAudio {
  return { ...pref, pause_ms: pauseMs };
}

function legacyCallAudio(stored: unknown): CallAudioPref | null {
  const parsed = z
    .strictObject({
      version: z.literal(1),
      value: z.record(z.string(), z.unknown()),
    })
    .safeParse(stored);
  if (!parsed.success) {
    return null;
  }
  const kept = Object.entries(parsed.data.value).filter(([key]) => key !== 'pause_ms');
  const value = CALL_AUDIO_PREF.safeParse(Object.fromEntries(kept));
  return value.success ? value.data : null;
}

export const CAMERAS_PREF = z.strictObject({ muted: z.boolean() });

export type CamerasPref = z.infer<typeof CAMERAS_PREF>;

const LEGACY_CAMERAS_VALUE = z.strictObject({
  awayMode: z.enum(['direct', 'server']),
  muted: z.boolean(),
});

function legacyCameras(stored: unknown): CamerasPref | null {
  const parsed = z
    .strictObject({ version: z.union([z.literal(1), z.literal(2)]), value: LEGACY_CAMERAS_VALUE })
    .safeParse(stored);
  if (!parsed.success) {
    return null;
  }
  return { muted: parsed.data.version === 1 ? true : parsed.data.value.muted };
}

export const HEALTH_SYNC_INTERVALS = [0, 15, 30, 60] as const;

export const HEALTH_SYNC_PREF = z.strictObject({
  intervalMinutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]),
});

export type HealthSyncPref = z.infer<typeof HEALTH_SYNC_PREF>;

const AI_MODELS_PREF = z.strictObject({
  favourites: z.array(z.string().min(1)),
  recent: z.array(z.string().min(1)).default([]),
  image_favourites: z.array(z.string().min(1)).default([]),
});

const AI_SPEECH_PREF = z.strictObject({ showText: z.boolean() });

export type AiSpeechPref = z.infer<typeof AI_SPEECH_PREF>;

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
    version: 3,
    defaultValue: { muted: true },
    schema: CAMERAS_PREF,
    legacy: legacyCameras,
  }),
  call_audio: clientPref({
    storageKey: 'call-audio',
    scope: 'client',
    version: 2,
    defaultValue: {
      echo: 'normal',
      detection: DEFAULT_VOICE_DETECTION,
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
    legacy: legacyCallAudio,
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
    defaultValue: { favourites: [], recent: [], image_favourites: [] },
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
  device_alerts: clientPref({
    storageKey: 'device-alerts',
    scope: 'profile',
    version: 1,
    defaultValue: { muted: [] },
    schema: DEVICE_ALERTS_PREF,
    legacy: noLegacy,
  }),
  camera_notifications: clientPref({
    storageKey: 'camera-notifications',
    scope: 'profile',
    version: 1,
    defaultValue: DEFAULT_CAMERA_NOTIFICATIONS,
    schema: CAMERA_NOTIFICATIONS_PREF,
    legacy: noLegacy,
  }),
  shared_clipboard: clientPref({
    storageKey: 'shared-clipboard',
    scope: 'profile',
    version: 1,
    defaultValue: { enabled: true },
    schema: SHARED_CLIPBOARD_PREF,
    legacy: noLegacy,
  }),
  navigation: clientPref({
    storageKey: 'navigation',
    scope: 'profile',
    version: 1,
    defaultValue: DEFAULT_NAVIGATION_LAYOUT,
    schema: NAVIGATION_LAYOUT,
    legacy: noLegacy,
  }),
  navigation_device: clientPref({
    storageKey: 'navigation-device',
    scope: 'client',
    version: 1,
    defaultValue: { override: null },
    schema: NAVIGATION_DEVICE_PREF,
    legacy: noLegacy,
  }),
  ...AUTOMATION_CLIENT_PREFS,
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
  'device_alerts',
  'camera_notifications',
  'shared_clipboard',
  'navigation',
  'navigation_device',
  'automations_editor',
  'automations_palette',
  'automations_breakpoints',
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
