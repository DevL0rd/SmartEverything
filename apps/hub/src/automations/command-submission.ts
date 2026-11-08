import { ApiError, appendTo, type CommandRow } from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { CommandExecutor } from '../commands/executor';
import { COMMAND_WAIT_MS, commandBudgetMs } from '../commands/command-budgets';
import { submitAndWait } from '../extensions/mcp/command-waiter';
import type { Store } from '../store/store';
import { background } from '@smarteverything/logging';

interface Submission {
  readonly rows: readonly CommandRow[];
  readonly admitted: boolean;
  readonly together?: boolean;
  readonly batch?: boolean;
  readonly authorize: () => void;
}

function waitMsOf(store: Store, rows: readonly CommandRow[]): number {
  return Math.max(
    COMMAND_WAIT_MS,
    ...rows.map((row) =>
      commandBudgetMs({
        capability: row.capability,
        value: row.value,
        deviceKind:
          row.device_id === null ? null : (store.devices.find(row.device_id)?.kind ?? null),
      }),
    ),
  );
}

export function batchedGroups(
  executor: Pick<CommandExecutor, 'runsTogether'>,
  rows: readonly CommandRow[],
): readonly (readonly CommandRow[])[] {
  const groups = new Map<string | null, CommandRow[]>();
  for (const row of rows) appendTo(groups, row.device_id, row);
  return [...groups.values()].flatMap((group) =>
    group.length > 1 && executor.runsTogether(group) ? [group] : group.map((row) => [row]),
  );
}

function dispatch(
  executor: CommandExecutor,
  { rows, admitted, together = false, batch = false, authorize }: Submission,
): void {
  if (together) {
    background(executor.runTogether(rows, authorize), 'executor.run_failed');
    return;
  }
  const groups = batch ? batchedGroups(executor, rows) : rows.map((row) => [row]);
  for (const group of groups) {
    const [single] = group;
    if (group.length === 1 && single !== undefined)
      background(executor.run(single, admitted, authorize), 'executor.run_failed');
    else background(executor.runTogether(group, authorize), 'executor.run_failed');
  }
}

export async function finishAutomationCommands(
  store: Store,
  clock: Clock,
  executor: CommandExecutor,
  submission: Submission,
): Promise<void> {
  const { rows } = submission;
  const outcome = await submitAndWait({
    feed: store.feed,
    clock,
    waitMs: waitMsOf(store, rows),
    submit: (): Promise<readonly CommandRow[]> => {
      dispatch(executor, submission);
      return Promise.resolve(rows);
    },
    current: (id) => store.commands.byId(id),
  });
  if (!outcome.allFinished) {
    throw new ApiError(
      'upstream_failed',
      'The automation command result is still unknown. Check command history before trying again.',
    );
  }
  const failed = outcome.commands.find((command) => command.status !== 'succeeded');
  if (failed !== undefined) {
    throw new ApiError(
      'upstream_failed',
      failed.error ?? `The automation command ${failed.capability} ${failed.status}.`,
    );
  }
}
