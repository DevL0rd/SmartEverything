import { HarnessEffectsRepository } from './harness-effects';
import { currentExecutionAuthority } from '../../assistant/turn-authority';
import {
  COMMAND_ROW,
  type CommandRow,
  type CommandSource,
  type CommandStatus,
  type JsonValue,
} from '@smarteverything/domain';
import type { CommandOutcome } from '../../database/port';
import { storedRow } from '../codec';
import { found, moment, type StoreContext } from '../context';
import { inList, jsonText } from '../sql';

const STORED_COMMAND = storedRow(COMMAND_ROW, { json: ['value', 'result'] });

const STORED_ID = storedRow(COMMAND_ROW.pick({ id: true }), {});

const COLUMNS =
  'id, device_id, capability, value, status, source, result, error, requested_by, created_at, started_at, finished_at, expires_at';

const COMMAND_LIFETIME_MS = 2 * 60_000;

export interface NewCommand {
  readonly deviceId: string | null;
  readonly capability: string;
  readonly value: JsonValue;
  readonly source: CommandSource;
  readonly requestedBy: string | null;
  readonly effectPolicy?: 'keep' | 'cancel' | undefined;
}

function outcomeColumns(outcome: CommandOutcome): { result: string; error: string | null } {
  switch (outcome.status) {
    case 'succeeded':
      return { result: jsonText(outcome.result), error: null };
    case 'failed':
      return { result: 'null', error: outcome.error };
    case 'expired':
      return { result: 'null', error: null };
  }
}

export class CommandsRepository {
  constructor(private readonly context: StoreContext) {}

  recent(limit: number): CommandRow[] {
    return this.context.sql.all(
      STORED_COMMAND,
      `select ${COLUMNS} from commands order by created_at desc, rowid desc limit $limit`,
      { limit },
    );
  }

  ofDevice(
    deviceId: string,
    window: {
      readonly from?: string | undefined;
      readonly to?: string | undefined;
      readonly capabilities?: readonly string[] | undefined;
      readonly limit?: number | undefined;
    },
  ): CommandRow[] {
    const named = inList('capability', 'capabilities', window.capabilities ?? []);
    return this.context.sql.all(
      STORED_COMMAND,
      `select ${COLUMNS} from commands
       where device_id = $deviceId and ($from is null or created_at >= $from)
         and ($to is null or created_at < $to)
         and ($filtered = 0 or ${named.text})
       order by created_at desc, rowid desc limit $limit`,
      {
        ...named.parameters,
        deviceId,
        from: window.from === undefined ? null : moment(window.from),
        to: window.to === undefined ? null : moment(window.to),
        filtered: window.capabilities === undefined ? 0 : 1,
        limit: window.limit ?? -1,
      },
    );
  }

  open(): CommandRow[] {
    return this.context.sql.all(
      STORED_COMMAND,
      `select ${COLUMNS} from commands where status in ('pending', 'running') order by created_at, rowid`,
    );
  }

  byId(id: string): CommandRow {
    return found(
      this.context.sql.get(STORED_COMMAND, `select ${COLUMNS} from commands where id = $id`, {
        id,
      }),
      'command',
      id,
    );
  }

  insert(commands: readonly NewCommand[]): CommandRow[] {
    return this.context.write(() => commands.map((command) => this.insertOne(command)));
  }

  claim(id: string, from: CommandStatus): boolean {
    return this.context.write(() => {
      const before = this.byId(id);
      const changed = this.context.sql.run(
        'claim the command',
        "update commands set status = 'running', started_at = $now where id = $id and status = $from",
        { id, from, now: this.context.now() },
      );
      if (changed === 1) {
        this.context.changed('commands', 'UPDATE', this.byId(id), before);
      }
      return changed === 1;
    });
  }

  finish(id: string, outcome: CommandOutcome): CommandRow {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'finish the command',
        `update commands set status = $status, result = $result, error = $error, finished_at = $now
         where id = $id`,
        { id, status: outcome.status, ...outcomeColumns(outcome), now: this.context.now() },
      );
      const after = this.byId(id);
      this.context.changed('commands', 'UPDATE', after, before);
      return after;
    });
  }

  private insertOne(command: NewCommand): CommandRow {
    if (command.deviceId !== null) {
      found(
        this.context.sql.get(STORED_ID, 'select id from devices where id = $id', {
          id: command.deviceId,
        }),
        'device',
        command.deviceId,
      );
    }
    const id = this.context.newId();
    const now = this.context.now();
    this.context.sql.run(
      'add the command',
      `insert into commands (id, device_id, capability, value, source, requested_by, created_at, expires_at, effect_policy)
       values ($id, $deviceId, $capability, $value, $source, $requestedBy, $now, $expiresAt, $effectPolicy)`,
      {
        id,
        deviceId: command.deviceId,
        capability: command.capability,
        value: jsonText(command.value),
        source: command.source,
        requestedBy: command.requestedBy,
        effectPolicy: command.effectPolicy ?? 'keep',
        now,
        expiresAt: new Date(Date.parse(now) + COMMAND_LIFETIME_MS).toISOString(),
      },
    );
    new HarnessEffectsRepository(this.context).keep('command', id, currentExecutionAuthority());
    const row = this.byId(id);
    this.context.changed('commands', 'INSERT', row, null);
    return row;
  }
}
