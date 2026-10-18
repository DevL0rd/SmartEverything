import {
  HEALTH_SOURCE_ROW,
  type HealthRecordType,
  type HealthSourceRow,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_SOURCE = storedRow(HEALTH_SOURCE_ROW, { json: ['granted_types'] });

const COLUMNS = 'client_id, name, granted_types, last_sync_at, last_error, created_at';

export class HealthSourcesRepository {
  constructor(private readonly context: StoreContext) {}

  list(): HealthSourceRow[] {
    return this.context.sql.all(
      STORED_SOURCE,
      `select ${COLUMNS} from health_sources order by created_at desc, rowid desc`,
    );
  }

  find(clientId: string): HealthSourceRow | undefined {
    return this.context.sql.get(
      STORED_SOURCE,
      `select ${COLUMNS} from health_sources where client_id = $clientId`,
      { clientId },
    );
  }

  byClient(clientId: string): HealthSourceRow {
    return found(this.find(clientId), 'health source', clientId);
  }

  register(clientId: string, name: string): HealthSourceRow {
    return this.context.write(() => {
      const before = this.find(clientId);
      this.context.sql.run(
        'add the health source',
        `insert into health_sources (client_id, name, created_at) values ($clientId, $name, $now)
         on conflict (client_id) do update set name = excluded.name`,
        { clientId, name, now: this.context.now() },
      );
      const row = this.byClient(clientId);
      this.context.changed(
        'health_sources',
        before === undefined ? 'INSERT' : 'UPDATE',
        row,
        before ?? null,
      );
      return row;
    });
  }

  remove(clientId: string): void {
    this.context.write(() => {
      const before = this.byClient(clientId);
      this.context.sql.run(
        'remove the health source',
        'delete from health_sources where client_id = $clientId',
        { clientId },
      );
      this.context.changed('health_sources', 'DELETE', null, before);
    });
  }

  synced(clientId: string, grantedTypes: readonly HealthRecordType[]): HealthSourceRow {
    return this.change(clientId, {
      last_sync_at: this.context.now(),
      granted_types: jsonText(grantedTypes),
      last_error: null,
    });
  }

  failed(clientId: string, problem: string): HealthSourceRow {
    return this.change(clientId, { last_error: problem });
  }

  private change(
    clientId: string,
    values: Readonly<Record<string, SQLInputValue>>,
  ): HealthSourceRow {
    return this.context.write(() => {
      const before = this.byClient(clientId);
      const set = assignments(values);
      this.context.sql.run(
        'change the health source',
        `update health_sources set ${set.text} where client_id = $clientId`,
        { ...set.parameters, clientId },
      );
      const after = this.byClient(clientId);
      this.context.changed('health_sources', 'UPDATE', after, before);
      return after;
    });
  }
}
