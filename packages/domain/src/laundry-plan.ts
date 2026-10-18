import { z } from 'zod';
import type { CapabilityKey } from './capabilities';
import { formatLaundryMinutes } from './laundry';
import { laundryProgramByRaw, laundryProgramOptions, type LaundryOption } from './laundry-programs';
import type { LaundryRole, LaundryValues } from './laundry-roles';
import type { JsonValue } from './values';

const MAX_DELAY_MINUTES = 2880;
const MINUTES_PER_DAY = 1440;

export const LAUNDRY_DELAY_MODES = ['Start Wash', 'Finish Wash'] as const;

const LAUNDRY_DELAY = z.strictObject({
  mode: z.enum(LAUNDRY_DELAY_MODES),
  minutes: z.number().int().min(1).max(MAX_DELAY_MINUTES),
});

const TEMPERATURES = [0, 20, 30, 40, 60, 90];
const SPINS = [0, 400, 600, 800, 1000, 1200, 1400] as const;
const SOAKS = [0, 10, 20, 30] as const;
const MAX_WASH_MINUTES = 120;
const MAX_DRY_MINUTES = 180;

const oneOf = (allowed: readonly number[]): z.ZodType<number> =>
  z.number().refine((value) => allowed.includes(value), {
    message: `expected one of ${allowed.join(', ')}`,
  });

const KNOWN_PROGRAM = z.string().transform((raw, context) => {
  const found = laundryProgramByRaw(raw);
  if (found === undefined) {
    context.addIssue({ code: 'custom', message: 'unknown washer program' });
    return z.NEVER;
  }
  return found;
});

export const LAUNDRY_DRAFT = z.strictObject({
  program: z.string().refine((raw) => KNOWN_PROGRAM.safeParse(raw).success, {
    message: 'unknown washer program',
  }),
  temperature: oneOf(TEMPERATURES).optional(),
  spin: oneOf(SPINS).optional(),
  rinses: z.number().int().min(0).max(5).optional(),
  soakMinutes: oneOf(SOAKS).optional(),
  washMinutes: z.number().int().min(0).max(MAX_WASH_MINUTES).optional(),
  dryMode: z.enum(['None', 'Smart', 'Timed']).optional(),
  dryMinutes: z.number().int().min(0).max(MAX_DRY_MINUTES).optional(),
  dryTarget: z.enum(['Ironing', 'Wear Immediately', 'Store', 'Close']).optional(),
  steam: z.boolean().optional(),
  extraWater: z.boolean().optional(),
  quiet: z.boolean().optional(),
  antiCreaseMinutes: z.number().int().min(0).max(MINUTES_PER_DAY).optional(),
  delay: LAUNDRY_DELAY.nullable().optional(),
});

export type LaundryDraft = z.infer<typeof LAUNDRY_DRAFT>;

export type LaundryDelay = z.infer<typeof LAUNDRY_DELAY>;

export interface LaundryStep {
  readonly role: LaundryRole | 'power';
  readonly value: JsonValue;
}

export interface LaundryCommand {
  readonly capability: CapabilityKey;
  readonly value: JsonValue;
}

export class LaundryRoleMissingError extends Error {
  override readonly name = 'LaundryRoleMissingError';

  constructor(readonly role: string) {
    super(`The washer has no capability for ${role}.`);
  }
}

interface OptionStep {
  readonly option: LaundryOption;
  readonly role: LaundryRole;
  readonly value: JsonValue | undefined;
}

function optionSteps(draft: LaundryDraft, current: LaundryValues): readonly OptionStep[] {
  const dryMode = draft.dryMode ?? current.dry_mode;
  const text = (value: number | undefined): string | undefined =>
    value === undefined ? undefined : String(value);
  return [
    { option: 'temperature', role: 'wash_temperature', value: text(draft.temperature) },
    { option: 'spin', role: 'spin_speed', value: text(draft.spin) },
    { option: 'rinses', role: 'rinse_count', value: draft.rinses },
    { option: 'soak', role: 'soak_minutes', value: draft.soakMinutes },
    { option: 'washMinutes', role: 'wash_minutes', value: draft.washMinutes },
    { option: 'dryMode', role: 'dry_mode', value: draft.dryMode },
    {
      option: 'dryMinutes',
      role: 'dry_minutes',
      value: dryMode === 'Timed' ? draft.dryMinutes : undefined,
    },
    {
      option: 'dryTarget',
      role: 'dry_target',
      value: dryMode === 'Smart' ? draft.dryTarget : undefined,
    },
    { option: 'steam', role: 'steam_hygiene', value: draft.steam },
    { option: 'extraWater', role: 'extra_water', value: draft.extraWater },
    { option: 'quiet', role: 'quiet_mode', value: draft.quiet },
    { option: 'antiCrease', role: 'anti_crease_minutes', value: draft.antiCreaseMinutes },
  ];
}

function changed(
  current: LaundryValues,
  role: LaundryRole,
  value: JsonValue | undefined,
): value is JsonValue {
  return value !== undefined && current[role] !== value;
}

function delaySteps(draft: LaundryDraft, current: LaundryValues): readonly LaundryStep[] {
  const delay = draft.delay;
  if (delay === undefined) {
    return [];
  }
  if (delay === null) {
    return current.delay_mode === 'None' || current.delay_mode === undefined
      ? []
      : [{ role: 'delay_mode', value: 'None' }];
  }
  const pairs: readonly (readonly [LaundryRole, JsonValue])[] = [
    ['delay_mode', delay.mode],
    ['delay_minutes', delay.minutes],
  ];
  return pairs
    .filter(([role, value]) => changed(current, role, value))
    .map(([role, value]) => ({ role, value }));
}

export function laundryStartPlan(
  draft: LaundryDraft,
  current: LaundryValues,
): readonly LaundryStep[] {
  const checked = LAUNDRY_DRAFT.parse(draft);
  const allowed = new Set(laundryProgramOptions(KNOWN_PROGRAM.parse(checked.program)));
  const steps: LaundryStep[] = [];
  if (current.power === false) {
    steps.push({ role: 'power', value: true });
  }
  const programChanges = changed(current, 'laundry_program', checked.program);
  if (programChanges) {
    steps.push({ role: 'laundry_program', value: checked.program });
  }
  for (const step of optionSteps(checked, current)) {
    const fresh =
      step.value !== undefined && (programChanges || changed(current, step.role, step.value));
    if (allowed.has(step.option) && fresh) {
      steps.push({ role: step.role, value: step.value });
    }
  }
  steps.push(...delaySteps(checked, current), { role: 'cycle_start', value: null });
  return steps;
}

export function laundryCommands(
  steps: readonly LaundryStep[],
  keyOf: (role: LaundryRole | 'power') => CapabilityKey | undefined,
): readonly LaundryCommand[] {
  return steps.map((step) => {
    const capability = keyOf(step.role);
    if (capability === undefined) {
      throw new LaundryRoleMissingError(step.role);
    }
    return { capability, value: step.value };
  });
}

export function minutesUntil(nowMinuteOfDay: number, targetMinuteOfDay: number): number {
  const gap = (targetMinuteOfDay - nowMinuteOfDay + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return gap === 0 ? MINUTES_PER_DAY : gap;
}

export function laundryDelayError(
  delay: LaundryDelay,
  programMinutes: number | null,
): string | null {
  if (delay.mode === 'Finish Wash' && programMinutes !== null && delay.minutes < programMinutes) {
    return `Too soon: this program takes ${formatLaundryMinutes(programMinutes)}.`;
  }
  return null;
}
