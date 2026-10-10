import { z } from 'zod';

export const SIGHT_SOURCES = [
  'home_camera',
  'phone_camera',
  'phone_screen',
  'desktop_screen',
  'desktop_window',
] as const;

export const SIGHT_SOURCE = z.enum(SIGHT_SOURCES);

export type SightSource = z.infer<typeof SIGHT_SOURCE>;

export const APP_SIGHT_SOURCES = [
  'phone_camera',
  'phone_screen',
  'desktop_screen',
  'desktop_window',
] as const;

export const APP_SIGHT_SOURCE = z.enum(APP_SIGHT_SOURCES);

export type AppSightSource = z.infer<typeof APP_SIGHT_SOURCE>;

export const SIGHT_KINDS = ['camera', 'screen', 'window'] as const;

export type SightKind = (typeof SIGHT_KINDS)[number];

const KIND_OF: Readonly<Record<SightSource, SightKind>> = {
  home_camera: 'camera',
  phone_camera: 'camera',
  phone_screen: 'screen',
  desktop_screen: 'screen',
  desktop_window: 'window',
};

export function sightKindOf(source: SightSource): SightKind {
  return KIND_OF[source];
}

export function isCameraSight(source: SightSource): boolean {
  return KIND_OF[source] === 'camera';
}

export const SIGHT_MODES = ['live', 'on_demand'] as const;

export const SIGHT_MODE = z.enum(SIGHT_MODES);

export type SightMode = z.infer<typeof SIGHT_MODE>;

export const SIGHT_MEMORY_PRESETS_SECONDS = [5, 15, 30, 60] as const;

export const SIGHT_MEMORY_MIN_SECONDS = 5;

export const SIGHT_MEMORY_MAX_SECONDS = 300;

export const SIGHT_MEMORY_DEFAULT_SECONDS = 15;

export const SIGHT_MEMORY_SECONDS = z
  .int()
  .min(SIGHT_MEMORY_MIN_SECONDS)
  .max(SIGHT_MEMORY_MAX_SECONDS);

export const SIGHT_FACINGS = ['front', 'back', 'external'] as const;

export const SIGHT_FACING = z.enum(SIGHT_FACINGS);

export type SightFacing = z.infer<typeof SIGHT_FACING>;

export const DEFAULT_SIGHT_LOOK: readonly SightSource[] = [
  'phone_screen',
  'phone_camera',
  'desktop_screen',
  'desktop_window',
];

export const SIGHT_RESOLUTIONS = ['low', 'medium'] as const;

export type SightResolution = (typeof SIGHT_RESOLUTIONS)[number];

export interface SightSampling {
  readonly longEdge: number;
  readonly quality: number;
  readonly minIntervalMs: number;
  readonly resolution: SightResolution;
}

export const SIGHT_SAMPLING: Readonly<Record<SightSource, SightSampling>> = {
  home_camera: { longEdge: 640, quality: 0.75, minIntervalMs: 1000, resolution: 'low' },
  phone_camera: { longEdge: 768, quality: 0.6, minIntervalMs: 1000, resolution: 'low' },
  phone_screen: { longEdge: 1280, quality: 0.7, minIntervalMs: 1000, resolution: 'medium' },
  desktop_screen: { longEdge: 1280, quality: 0.7, minIntervalMs: 1000, resolution: 'medium' },
  desktop_window: { longEdge: 1280, quality: 0.7, minIntervalMs: 1000, resolution: 'medium' },
};

export const SIGHT_FRAME_LIMITS = {
  maxBytes: 400_000,
  minIntervalMs: 500,
  hardPerSecond: 2,
} as const;

export const SIGHT_LABEL_MAX = 120;

export const SIGHT_TARGET_MAX = 240;

export const SIGHT_REQUEST_TIMEOUT_MS = 30_000;

export const SIGHT_CAPTURE_TIMEOUT_MS = 12_000;

export const SIGHT_LOOKS_KEPT = 20;

export const SIGHT_TOKENS_PER_FRAME: Readonly<Record<SightResolution, number>> = {
  low: 66,
  medium: 258,
};

export const SIGHT_TOKENS_PER_STILL = 258;

export const SIGHT_REBILLS_PER_MINUTE = 4;

const SECONDS_PER_MINUTE = 60;

const CENTS_PER_DOLLAR = 100;

const TOKENS_PER_MTOK = 1_000_000;

export interface SightEstimateInput {
  readonly mode: SightMode;
  readonly memorySeconds: number;
  readonly resolution: SightResolution;
  readonly dollarsPerMtok: number;
}

export interface SightEstimate {
  readonly memoryTokens: number;
  readonly tokensPerMinute: number;
  readonly tokensPerStill: number;
  readonly centsPerMinute: number;
  readonly centsPerStill: number;
}

function centsOf(tokens: number, dollarsPerMtok: number): number {
  return (tokens / TOKENS_PER_MTOK) * dollarsPerMtok * CENTS_PER_DOLLAR;
}

export function sightEstimate(input: SightEstimateInput): SightEstimate {
  const perFrame = SIGHT_TOKENS_PER_FRAME[input.resolution];
  const memoryTokens = input.memorySeconds * perFrame;
  const streamed = SECONDS_PER_MINUTE * perFrame;
  const tokensPerMinute =
    input.mode === 'live' ? streamed + SIGHT_REBILLS_PER_MINUTE * memoryTokens : 0;
  const stillRebills = (SIGHT_REBILLS_PER_MINUTE * input.memorySeconds) / SECONDS_PER_MINUTE;
  const tokensPerStill = Math.round(SIGHT_TOKENS_PER_STILL * (1 + stillRebills));
  return {
    memoryTokens,
    tokensPerMinute,
    tokensPerStill,
    centsPerMinute: centsOf(tokensPerMinute, input.dollarsPerMtok),
    centsPerStill: centsOf(tokensPerStill, input.dollarsPerMtok),
  };
}

export const SIGHT_REFUSALS = ['denied', 'busy', 'failed', 'unsupported', 'declined'] as const;

export const SIGHT_REFUSAL = z.enum(SIGHT_REFUSALS);

export type SightRefusal = z.infer<typeof SIGHT_REFUSAL>;

export const SIGHT_STOP_REASONS = [
  'stopped',
  'budget',
  'error',
  'replaced',
  'ended',
  'requested',
] as const;

export const SIGHT_STOP_REASON = z.enum(SIGHT_STOP_REASONS);

export type SightStopReason = z.infer<typeof SIGHT_STOP_REASON>;

export const SIGHT_LOOK_TRIGGERS = ['ai', 'person', 'asked'] as const;

export const SIGHT_LOOK_TRIGGER = z.enum(SIGHT_LOOK_TRIGGERS);

export type SightLookTrigger = z.infer<typeof SIGHT_LOOK_TRIGGER>;

export const SIGHT_TARGET = z
  .string()
  .trim()
  .min(1)
  .max(SIGHT_TARGET_MAX)
  .describe(
    'Which one: a window by its application name or title, a screen by name or number, or a camera by its id',
  );

export const HUB_SIGHT_SOURCES = ['home_camera', 'desktop_screen', 'desktop_window'] as const;

const SEE_ASKED = z.strictObject({
  source: z.enum(HUB_SIGHT_SOURCES).describe('What to look at'),
  camera: SIGHT_TARGET.optional().describe('home_camera only: the camera, by name or id'),
  window: SIGHT_TARGET.optional().describe(
    'desktop_window only: the application window, by application name or title',
  ),
  computer: SIGHT_TARGET.optional().describe(
    'desktop_screen and desktop_window: which computer, by name or id; the only one when left out',
  ),
});

const SEE_VARIANTS = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('home_camera'), camera: SIGHT_TARGET }),
  z.strictObject({ source: z.literal('desktop_screen'), computer: SIGHT_TARGET.optional() }),
  z.strictObject({
    source: z.literal('desktop_window'),
    window: SIGHT_TARGET,
    computer: SIGHT_TARGET.optional(),
  }),
]);

export const SEE_REQUEST = SEE_ASKED.pipe(SEE_VARIANTS);

export type SeeRequest = z.output<typeof SEE_REQUEST>;
