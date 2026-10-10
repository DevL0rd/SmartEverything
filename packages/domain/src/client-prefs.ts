import { z } from 'zod';
import { NUTRITION_PREF } from './foods';
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
  health_sync: clientPref({
    storageKey: 'health-sync',
    scope: 'client',
    version: 1,
    defaultValue: { intervalMinutes: 0 },
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
} as const;

export type ClientPrefKey = keyof typeof CLIENT_PREFS;

export type ClientPrefValue<K extends ClientPrefKey> =
  (typeof CLIENT_PREFS)[K] extends ClientPrefDefinition<infer T> ? T : never;

export const CLIENT_PREF_KEYS: readonly ClientPrefKey[] = [
  'appearance',
  'call_ring',
  'cameras',
  'health_sync',
  'nutrition',
  'ai_models',
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
