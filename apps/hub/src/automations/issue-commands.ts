import {
  CAPABILITY_KEY,
  type ActionMode,
  type CommandRow,
  type JsonValue,
} from '@smarteverything/domain';
import type { Clock } from '../clock';
import { type CommandExecutor } from '../commands/executor';
import type { CommandInsert, HubDatabase } from '../database/port';
import { batchedGroups, finishAutomationCommands } from './command-submission';
import {
  commandMetadata,
  metadataOf,
  stampOf,
  type CommandStamp,
} from './effects/command-metadata';
import type { EffectRun } from './effects/effect-run';
import { admitRun } from './effects/run-abort';
import { awaitConfirmations } from './effects/command-confirm';
import { admitMembers, type Member } from './effects/device-set';
import type { Store } from '../store/store';
import { failureLine } from '@smarteverything/logging';

interface IssuedCommand {
  readonly deviceId: string | null;
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
  readonly together?: boolean;
  readonly batch?: boolean;
  readonly at?: CommandStamp;
}

function batchedLanes(executor: CommandExecutor, rows: readonly CommandRow[]): readonly Member[] {
  return batchedGroups(executor, rows)
    .filter((group) => group.length > 1)
    .flat()
    .flatMap((row) =>
      row.device_id === null ? [] : [{ deviceId: row.device_id, capability: row.capability }],
    )
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export class CommandIssuer {
  constructor(private readonly options: CommandIssuerOptions) {}

  async issue(
    commands: readonly IssuedCommand[],
    source: CommandInsert['source'],
    run: EffectRun,
    { admitted = false, together = false, batch = false, at = stampOf(null) }: IssueOptions = {},
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
    const finish = (held: boolean): Promise<void> =>
      finishAutomationCommands(store, clock, executor, {
        rows,
        admitted: held,
        together,
        batch,
        authorize: () => {
          admitRun(run);
        },
      });
    const lanes = batch && !admitted ? batchedLanes(executor, rows) : [];
    if (lanes.length === 0) await finish(admitted);
    else await admitMembers(executor, lanes, run, () => finish(true));
    return rows;
  }

  async confirm(rows: readonly CommandRow[], mode: ActionMode, run: EffectRun): Promise<void> {
    if (mode !== 'wait_for_result' || rows.length === 0) return;
    const { store, clock } = this.options;
    await awaitConfirmations({
      store,
      clock,
      rows: rows.map((row) => store.commands.byId(row.id)),
      sentAt: Math.min(...rows.map((row) => Date.parse(row.created_at))),
      run,
    });
  }
}
