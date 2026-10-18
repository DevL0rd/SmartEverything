import {
  ACCESS_AUDIT_ROW,
  type AccessAuditEntry,
  type AccessAuditRow,
} from '@smarteverything/domain';
import { found, type StoreContext } from '../context';

const COLUMNS = 'id, at, profile_id, client_id, kind, detail';

export class AccessAuditRepository {
  constructor(private readonly context: StoreContext) {}

  record(entry: AccessAuditEntry): AccessAuditRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'record the access event',
        `insert into access_audit (id, at, profile_id, client_id, kind, detail)
         values ($id, $at, $profileId, $clientId, $kind, $detail)`,
        {
          id,
          at: this.context.now(),
          profileId: entry.profile_id,
          clientId: entry.client_id,
          kind: entry.kind,
          detail: entry.detail,
        },
      );
      return found(
        this.context.sql.get(
          ACCESS_AUDIT_ROW,
          `select ${COLUMNS} from access_audit where id = $id`,
          {
            id,
          },
        ),
        'access event',
        id,
      );
    });
  }

  list(limit: number, profileId?: string): AccessAuditRow[] {
    return this.context.sql.all(
      ACCESS_AUDIT_ROW,
      `select ${COLUMNS} from access_audit
       where $profileId is null or profile_id = $profileId
       order by at desc, rowid desc limit $limit`,
      { profileId: profileId ?? null, limit },
    );
  }
}
