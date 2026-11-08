import { HUB_COMMAND, type JsonValue } from '@smarteverything/domain';
import { WAKE_DEADLINE_MS } from './television-wake';

export const COMMAND_WAIT_MS = 20_000;

export const STALE_FRAME_MS = 1_500;

const SECOND_MS = 1_000;
const CLIP_FINISH_MS = 15_000;
const IR_LEARN_MS = 45_000;
const WAKE_SWITCH_ON_MS = 5_000;

export interface BudgetedCommand {
  readonly capability: string;
  readonly value: JsonValue;
  readonly deviceKind: string | null;
}

interface CommandBudget {
  readonly applies: (command: BudgetedCommand) => boolean;
  readonly budgetMs: (command: BudgetedCommand) => number;
}

function clipMs(command: BudgetedCommand): number {
  const parsed = HUB_COMMAND.parse({ capability: command.capability, value: command.value });
  if (parsed.capability !== 'hub:record_clip') return COMMAND_WAIT_MS;
  return parsed.value.seconds * SECOND_MS + CLIP_FINISH_MS;
}

const COMMAND_BUDGETS: readonly CommandBudget[] = [
  { applies: (command) => command.capability === 'hub:record_clip', budgetMs: clipMs },
  { applies: (command) => command.capability === 'ir_learn', budgetMs: () => IR_LEARN_MS },
  {
    applies: (command) =>
      command.deviceKind === 'television' &&
      command.capability === 'power' &&
      command.value === true,
    budgetMs: () => WAKE_DEADLINE_MS + WAKE_SWITCH_ON_MS,
  },
];

export function commandBudgetMs(command: BudgetedCommand): number {
  const budget = COMMAND_BUDGETS.find((entry) => entry.applies(command));
  return budget === undefined
    ? COMMAND_WAIT_MS
    : Math.max(COMMAND_WAIT_MS, budget.budgetMs(command));
}
