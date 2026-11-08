import { GOOGLE_ACCOUNT_ROW, type GoogleAccountRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_ACCOUNT = storedRow(GOOGLE_ACCOUNT_ROW, {
  json: ['scopes', 'calendar_ids', 'list_ids'],
});

const COLUMNS =
  'profile_id, email, scopes, status, problem, calendar_ids, list_ids, last_sync_at, last_error';

export type GoogleAccountPatch = Partial<Omit<GoogleAccountRow, 'profile_id'>>;

function parameters(row: GoogleAccountRow): Record<string, SQLInputValue> {
  return {
    ...row,
    scopes: jsonText(row.scopes),
    calendar_ids: jsonText(row.calendar_ids),
    list_ids: jsonText(row.list_ids),
  };
}

export class GoogleAccountsRepository {
  constructor(private readonly context: StoreContext) {}

  find(profileId: string): GoogleAccountRow | undefined {
    return this.context.sql.get(
      STORED_ACCOUNT,
      `select ${COLUMNS} from google_accounts where profile_id = $profileId`,
      { profileId },
    );
  }

  byProfile(profileId: string): GoogleAccountRow {
    return found(this.find(profileId), 'google account', profileId);
  }

  list(): GoogleAccountRow[] {
    return this.context.sql.all(
      STORED_ACCOUNT,
      `select ${COLUMNS} from google_accounts order by profile_id`,
    );
  }

  insert(input: GoogleAccountRow): GoogleAccountRow {
    return this.context.write(() => {
      const row = GOOGLE_ACCOUNT_ROW.parse(input);
      const values = parameters(row);
      const columns = Object.keys(values);
      this.context.sql.run(
        'add the google account',
        `insert into google_accounts (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      this.context.changed('google_accounts', 'INSERT', row, null);
      return row;
    });
  }

  update(profileId: string, patch: GoogleAccountPatch): GoogleAccountRow {
    return this.context.write(() => {
      const before = this.byProfile(profileId);
      const after = GOOGLE_ACCOUNT_ROW.parse({ ...before, ...patch });
      const set = assignments(parameters(after));
      this.context.sql.run(
        'change the google account',
        `update google_accounts set ${set.text} where profile_id = $profile_id`,
        set.parameters,
      );
      this.context.changed('google_accounts', 'UPDATE', after, before);
      return after;
    });
  }

  remove(profileId: string): void {
    this.context.write(() => {
      const before = this.byProfile(profileId);
      this.context.sql.run(
        'remove the google account',
        'delete from google_accounts where profile_id = $profileId',
        { profileId },
      );
      this.context.changed('google_accounts', 'DELETE', null, before);
    });
  }
}
