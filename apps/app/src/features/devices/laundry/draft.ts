import {
  laundryCommands,
  laundryStartPlan,
  laundryProgramByRaw,
  type JsonValue,
  type LaundryDraft,
  type LaundryProgram,
  type LaundryValues,
} from '@smarteverything/domain';
import type { Laundry } from './use-laundry';
import type { PlanStep } from './send-plan';
import { delayOf } from './finish';

export type OptionChanges = Omit<LaundryDraft, 'program' | 'delay'>;

export interface Reported {
  readonly temperature: number | null;
  readonly spin: number | null;
  readonly rinses: number | null;
  readonly soakMinutes: number | null;
  readonly washMinutes: number | null;
  readonly dryMode: string | null;
  readonly dryMinutes: number | null;
  readonly dryTarget: string | null;
  readonly steam: boolean;
  readonly extraWater: boolean;
  readonly quiet: boolean;
  readonly antiCreaseMinutes: number | null;
}

function numeric(value: JsonValue | undefined): number | null {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function text(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export function reportedOf(values: LaundryValues): Reported {
  return {
    temperature: numeric(values.wash_temperature),
    spin: numeric(values.spin_speed),
    rinses: numeric(values.rinse_count),
    soakMinutes: numeric(values.soak_minutes),
    washMinutes: numeric(values.wash_minutes),
    dryMode: text(values.dry_mode),
    dryMinutes: numeric(values.dry_minutes),
    dryTarget: text(values.dry_target),
    steam: values.steam_hygiene === true,
    extraWater: values.extra_water === true,
    quiet: values.quiet_mode === true,
    antiCreaseMinutes: numeric(values.anti_crease_minutes),
  };
}

export function programOf(values: LaundryValues): LaundryProgram | undefined {
  return typeof values.laundry_program === 'string'
    ? laundryProgramByRaw(values.laundry_program)
    : undefined;
}

export interface DraftInput {
  readonly program: LaundryProgram;
  readonly changes: OptionChanges;
  readonly finishAt: number | null;
  readonly nowMinute: number;
}

export function draftOf(input: DraftInput): LaundryDraft {
  const { program, changes, finishAt, nowMinute } = input;
  return {
    program: program.raw,
    ...changes,
    delay: finishAt === null ? null : delayOf(finishAt, nowMinute),
  };
}

export function stepsOf(laundry: Laundry, draft: LaundryDraft): readonly PlanStep[] {
  const commands = laundryCommands(laundryStartPlan(draft, laundry.snapshot.values), (role) =>
    laundry.keyOf(role),
  );
  return commands.map((command) => ({
    capability: command.capability,
    value: command.value,
    label:
      laundry.presentation.capabilities.find((presented) => presented.key === command.capability)
        ?.label ?? 'a setting',
  }));
}
