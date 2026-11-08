import {
  GOOGLE_CHOICE,
  GOOGLE_SYNC_LOG_ENTRY,
  type GoogleChoice,
  type GoogleSyncLogEntry,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_ENTRY = storedRow(GOOGLE_SYNC_LOG_ENTRY, { json: ['counts', 'conflicts', 'choice'] });

const COLUMNS = 'id, profile_id, at, trigger, product, counts, conflicts, error, choice';

export type GoogleSyncLogInput = Omit<GoogleSyncLogEntry, 'id' | 'at'>;

function parameters(row: GoogleSyncLogEntry): Record<string, SQLInputValue> {
  return {
    ...row,
    counts: jsonText(row.counts),
    conflicts: jsonText(row.conflicts),
    choice: row.choice === null ? null : jsonText(row.choice),
  };
}

export class GoogleSyncLogRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string, profileId: string): GoogleSyncLogEntry | undefined {
    return this.context.sql.get(
      STORED_ENTRY,
      `select ${COLUMNS} from google_sync_log where id = $id and profile_id = $profileId`,
      { id, profileId },
    );
  }

  byId(id: string, profileId: string): GoogleSyncLogEntry {
    return found(this.find(id, profileId), 'google sync log entry', id);
  }

  list(profileId: string): GoogleSyncLogEntry[] {
    return this.context.sql.all(
      STORED_ENTRY,
      `select ${COLUMNS} from google_sync_log where profile_id = $profileId order by at desc, id`,
      { profileId },
    );
  }

  insert(input: GoogleSyncLogInput): GoogleSyncLogEntry {
    return this.context.write(() => {
      const row = GOOGLE_SYNC_LOG_ENTRY.parse({
        ...input,
        id: this.context.newId(),
        at: this.context.now(),
      });
      const values = parameters(row);
      const columns = Object.keys(values);
      this.context.sql.run(
        'add the google sync log entry',
        `insert into google_sync_log (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      return row;
    });
  }

  replaceChoice(id: string, profileId: string, choice: GoogleChoice): GoogleSyncLogEntry {
    return this.context.write(() => {
      const after = GOOGLE_SYNC_LOG_ENTRY.parse({
        ...this.byId(id, profileId),
        choice: GOOGLE_CHOICE.parse(choice),
      });
      this.context.sql.run(
        'record the google choice',
        'update google_sync_log set choice = $choice where id = $id',
        { id, choice: jsonText(after.choice) },
      );
      return after;
    });
  }
}
