import { CAPABILITY_KEY, type CommandRow, type JsonValue } from '@smarteverything/domain';
import type { Clock } from '../clock';
import { type CommandExecutor } from '../commands/executor';
import type { CommandInsert, HubDatabase } from '../database/port';
import { finishAutomationCommands } from './command-submission';
import {
  commandMetadata,
  metadataOf,
  stampOf,
  type CommandStamp,
} from './effects/command-metadata';
import type { EffectRun } from './effects/effect-run';
import { admitRun } from './effects/run-abort';
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

interface IssueOptions {
  readonly admitted?: boolean;
  readonly at?: CommandStamp;
}

export class CommandIssuer {
  constructor(private readonly options: CommandIssuerOptions) {}

  async issue(
    commands: readonly IssuedCommand[],
    source: CommandInsert['source'],
    run: EffectRun,
    { admitted = false, at = stampOf(null) }: IssueOptions = {},
  ): Promise<readonly CommandRow[]> {
    const { store, database, executor, clock } = this.options;
    admitRun(run);
    const metadata = metadataOf(run, at);
    const rows = await database.insertCommands(
      commands.map((command) => ({
        deviceId: command.deviceId,
        capability: CAPABILITY_KEY.parse(command.capability),
        value: command.value,
        source,
      })),
      (inserted) => {
        run.commands(inserted);
        commandMetadata(store).stamp(inserted, metadata, clock.now().getTime());
      },
    );
    try {
      admitRun(run);
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
        admitRun(run);
      },
    });
    return rows;
  }
}
