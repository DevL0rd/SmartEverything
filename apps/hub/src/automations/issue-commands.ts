import { CAPABILITY_KEY, type CommandRow, type JsonValue } from '@smarteverything/domain';
import type { Clock } from '../clock';
import { type CommandExecutor } from '../commands/executor';
import type { CommandInsert, HubDatabase } from '../database/port';
import { finishAutomationCommands } from './command-submission';
import { admitRun, type RunHooks } from './run-context';
import type { Store } from '../store/store';
import { failureLine } from '@smarteverything/logging';

interface IssuedCommand {
  readonly deviceId: string;
  readonly capability: string;
  readonly value: JsonValue;
}

interface CommandIssuerOptions {
  readonly store: Store;
  readonly database: Pick<HubDatabase, 'insertCommands' | 'finishCommand'>;
  readonly executor: CommandExecutor;
  readonly clock: Clock;
}

export class CommandIssuer {
  constructor(private readonly options: CommandIssuerOptions) {}

  async issue(
    commands: readonly IssuedCommand[],
    source: CommandInsert['source'],
    hooks: Pick<RunHooks, 'runId' | 'signal' | 'commands'>,
    admitted = false,
  ): Promise<readonly CommandRow[]> {
    const { store, database, executor, clock } = this.options;
    admitRun(hooks);
    const rows = await database.insertCommands(
      commands.map((command) => ({
        deviceId: command.deviceId,
        capability: CAPABILITY_KEY.parse(command.capability),
        value: command.value,
        source,
      })),
      (inserted) => {
        hooks.commands(inserted);
      },
    );
    try {
      admitRun(hooks);
    } catch (cause) {
      await Promise.all(
        rows.map((row) =>
          database.finishCommand(row.id, { status: 'failed', error: failureLine(cause) }),
        ),
      );
      throw cause;
    }
    await finishAutomationCommands(store, clock, executor, {
      rows,
      admitted,
      authorize: () => {
        admitRun(hooks);
      },
    });
    return rows;
  }
}
