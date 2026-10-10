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

const COLUMNS =
  'id, client_id, name, granted_types, last_sync_at, last_error, created_at, revoked_at';

export class HealthSourcesRepository {
  constructor(private readonly context: StoreContext) {}

  list(): HealthSourceRow[] {
    return this.context.sql.all(
      STORED_SOURCE,
      `select ${COLUMNS} from health_sources order by created_at desc, rowid desc`,
    );
  }

  byId(id: string): HealthSourceRow {
    return found(
      this.context.sql.get(STORED_SOURCE, `select ${COLUMNS} from health_sources where id = $id`, {
        id,
      }),
      'health source',
      id,
    );
  }

  activeByTokenHash(tokenHash: string): HealthSourceRow | undefined {
    return this.context.sql.get(
      STORED_SOURCE,
      `select ${COLUMNS} from health_sources where token_hash = $tokenHash and revoked_at is null`,
      { tokenHash },
    );
  }

  create(name: string, clientId: string, tokenHash: string): HealthSourceRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the health source',
        `insert into health_sources (id, client_id, name, token_hash, created_at)
         values ($id, $clientId, $name, $tokenHash, $now)`,
        { id, clientId, name, tokenHash, now: this.context.now() },
      );
      const row = this.byId(id);
      this.context.changed('health_sources', 'INSERT', row, null);
      return row;
    });
  }

  revoke(id: string): HealthSourceRow {
    return this.change(id, { revoked_at: this.context.now() });
  }

  synced(id: string, grantedTypes: readonly HealthRecordType[]): HealthSourceRow {
    return this.change(id, {
      last_sync_at: this.context.now(),
      granted_types: jsonText(grantedTypes),
      last_error: null,
    });
  }

  failed(id: string, problem: string): HealthSourceRow {
    return this.change(id, { last_error: problem });
  }

  private change(id: string, values: Readonly<Record<string, SQLInputValue>>): HealthSourceRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const set = assignments(values);
      this.context.sql.run(
        'change the health source',
        `update health_sources set ${set.text} where id = $id`,
        {
          ...set.parameters,
          id,
        },
      );
      const after = this.byId(id);
      this.context.changed('health_sources', 'UPDATE', after, before);
      return after;
    });
  }
}
