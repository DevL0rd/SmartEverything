import { z } from 'zod';

export const DISPLAY_REVERT_SECONDS = 15;

export const DISPLAY_ROTATIONS = [0, 90, 180, 270] as const;

export const DISPLAY_VRR_POLICIES = ['never', 'always', 'automatic'] as const;

export const NIGHT_LIGHT_MODES = ['off', 'on', 'scheduled'] as const;

export const DISPLAY_SIDES = ['left', 'right', 'above', 'below'] as const;

const MOMENT = z.iso.datetime({ offset: true });

export const DISPLAY_MODE = z.strictObject({
  width: z.int().positive(),
  height: z.int().positive(),
  refreshHz: z.number().positive(),
  preferred: z.boolean(),
});

export type DisplayMode = z.infer<typeof DISPLAY_MODE>;

export const DISPLAY_OUTPUT = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  builtIn: z.boolean(),
  enabled: z.boolean(),
  primary: z.boolean(),
  mode: DISPLAY_MODE.nullable(),
  modes: z.array(DISPLAY_MODE),
  scalePercent: z.number().positive(),
  rotation: z.union(DISPLAY_ROTATIONS.map((degrees) => z.literal(degrees))),
  x: z.int(),
  y: z.int(),
  brightness: z.number().min(0).max(100).nullable(),
  hdr: z.strictObject({ supported: z.boolean(), enabled: z.boolean() }),
  vrr: z.enum(DISPLAY_VRR_POLICIES).nullable(),
  mirrorOf: z.string().min(1).nullable(),
});

export type DisplayOutput = z.infer<typeof DISPLAY_OUTPUT>;

export const NIGHT_LIGHT = z.strictObject({
  supported: z.boolean(),
  mode: z.enum(NIGHT_LIGHT_MODES),
  active: z.boolean(),
  temperatureKelvin: z.int().positive().nullable(),
});

export type NightLight = z.infer<typeof NIGHT_LIGHT>;

export const PENDING_REVERT = z.strictObject({
  token: z.string().min(1),
  startedAt: MOMENT,
  revertsAt: MOMENT,
  summary: z.string().min(1),
});

export type PendingRevert = z.infer<typeof PENDING_REVERT>;

export const DISPLAY_STATE = z.strictObject({
  outputs: z.array(DISPLAY_OUTPUT),
  nightLight: NIGHT_LIGHT,
  pendingRevert: PENDING_REVERT.nullable(),
});

export type DisplayState = z.infer<typeof DISPLAY_STATE>;

const OUTPUT = z.string().trim().min(1).describe('A display id from get_computer, or its name');

export const DISPLAY_MODE_CHANGE = z.strictObject({
  action: z.literal('mode'),
  output: OUTPUT,
  width: z.int().positive(),
  height: z.int().positive(),
  refreshHz: z.number().positive().optional(),
});

export const DISPLAY_SCALE_CHANGE = z.strictObject({
  action: z.literal('scale'),
  output: OUTPUT,
  percent: z.number().min(50).max(400),
});

export const DISPLAY_POSITION_CHANGE = z.strictObject({
  action: z.literal('position'),
  output: OUTPUT,
  relativeTo: OUTPUT,
  side: z.enum(DISPLAY_SIDES),
});

export const DISPLAY_BRIGHTNESS_CHANGE = z.strictObject({
  action: z.literal('brightness'),
  level: z.number().min(0).max(100),
  output: OUTPUT.optional(),
});

export const DISPLAY_NIGHT_LIGHT_CHANGE = z.strictObject({
  action: z.literal('night_light'),
  mode: z.enum(NIGHT_LIGHT_MODES),
  temperatureKelvin: z.int().min(1000).max(6500).optional(),
});

export const DISPLAY_CHANGE = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('enable'), output: OUTPUT }),
  z.strictObject({ action: z.literal('disable'), output: OUTPUT }),
  DISPLAY_MODE_CHANGE,
  DISPLAY_SCALE_CHANGE,
  z.strictObject({
    action: z.literal('rotation'),
    output: OUTPUT,
    degrees: z.union(DISPLAY_ROTATIONS.map((degrees) => z.literal(degrees))),
  }),
  z.strictObject({ action: z.literal('primary'), output: OUTPUT }),
  DISPLAY_POSITION_CHANGE,
  z.strictObject({ action: z.literal('mirror'), output: OUTPUT, of: OUTPUT.nullable() }),
  DISPLAY_BRIGHTNESS_CHANGE,
  z.strictObject({ action: z.literal('hdr'), output: OUTPUT, enabled: z.boolean() }),
  z.strictObject({
    action: z.literal('vrr'),
    output: OUTPUT,
    policy: z.enum(DISPLAY_VRR_POLICIES),
  }),
  DISPLAY_NIGHT_LIGHT_CHANGE,
  z.strictObject({ action: z.literal('identify') }),
]);

export type DisplayChange = z.infer<typeof DISPLAY_CHANGE>;

export type DisplayChangeInput = z.input<typeof DISPLAY_CHANGE>;

export const REVERTING_DISPLAY_ACTIONS: ReadonlySet<DisplayChange['action']> = new Set([
  'enable',
  'disable',
  'mode',
  'scale',
  'rotation',
  'primary',
  'position',
  'mirror',
]);

export function displayChangeNeedsRevert(change: DisplayChange): boolean {
  return REVERTING_DISPLAY_ACTIONS.has(change.action);
}

export const DISPLAY_DECISION = z.strictObject({
  keep: z.boolean(),
  token: z.string().min(1).optional(),
});

export type DisplayDecision = z.infer<typeof DISPLAY_DECISION>;

export const DISPLAY_TOOL_ACTIONS = [
  'enable',
  'disable',
  'mode',
  'scale',
  'rotation',
  'primary',
  'position',
  'mirror',
  'brightness',
  'hdr',
  'vrr',
  'night_light',
  'keep',
  'revert',
] as const;
