import { ApiError, type CommandRow } from '@smarteverything/domain';
import type { Clock } from '../clock';
import type { CommandExecutor } from '../commands/executor';
import { COMMAND_WAIT_MS, submitAndWait } from '../extensions/mcp/command-waiter';
import type { Store } from '../store/store';

export function submitAutomationCommands(
  executor: CommandExecutor,
  rows: readonly CommandRow[],
  admitted = false,
  authorize?: () => void,
): void {
  for (const row of rows) {
    void executor.run(row, admitted, authorize);
  }
}

export async function finishAutomationCommands(
  store: Store,
  clock: Clock,
  executor: CommandExecutor,
  submission:
    | readonly CommandRow[]
    | {
        readonly rows: readonly CommandRow[];
        readonly admitted: boolean;
        readonly authorize?: () => void;
      },
): Promise<void> {
  const { rows, admitted, authorize } =
    'rows' in submission ? submission : { rows: submission, admitted: false, authorize: undefined };
  const outcome = await submitAndWait({
    feed: store.feed,
    clock,
    waitMs: COMMAND_WAIT_MS,
    submit: (): Promise<readonly CommandRow[]> => {
      submitAutomationCommands(executor, rows, admitted, authorize);
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
