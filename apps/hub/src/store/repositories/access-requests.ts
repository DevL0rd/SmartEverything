import {
  ACCESS_REQUEST_ROW,
  type AccessRequestDecision,
  type AccessRequestRow,
  type NewAccessRequest,
} from '@smarteverything/domain';
import { found, type StoreContext } from '../context';
import { StoreConflictError } from '../sql';

const COLUMNS =
  'id, profile_id, kind, target, note, status, until, requested_at, decided_at, decided_by';

export class AccessRequestsRepository {
  constructor(private readonly context: StoreContext) {}

  byId(id: string): AccessRequestRow {
    return found(
      this.context.sql.get(
        ACCESS_REQUEST_ROW,
        `select ${COLUMNS} from access_requests where id = $id`,
        { id },
      ),
      'access request',
      id,
    );
  }

  list(status?: AccessRequestRow['status'], profileId?: string): AccessRequestRow[] {
    return this.context.sql.all(
      ACCESS_REQUEST_ROW,
      `select ${COLUMNS} from access_requests
       where ($status is null or status = $status) and ($profileId is null or profile_id = $profileId)
       order by requested_at desc, rowid desc`,
      { status: status ?? null, profileId: profileId ?? null },
    );
  }

  create(profileId: string, request: NewAccessRequest): AccessRequestRow {
    return this.context.write(() => {
      const id = this.context.newId();
      this.context.sql.run(
        'add the access request',
        `insert into access_requests (id, profile_id, kind, target, note, requested_at)
         values ($id, $profileId, $kind, $target, $note, $now)`,
        {
          id,
          profileId,
          kind: request.kind,
          target: request.target,
          note: request.note,
          now: this.context.now(),
        },
      );
      return this.byId(id);
    });
  }

  decide(id: string, decidedBy: string, decision: AccessRequestDecision): AccessRequestRow {
    return this.context.write(() => {
      const before = this.byId(id);
      if (before.status !== 'pending') {
        throw new StoreConflictError('decide the request', `it was already ${before.status}`);
      }
      this.context.sql.run(
        'decide the access request',
        `update access_requests set status = $status, until = $until, decided_at = $now,
           decided_by = $decidedBy where id = $id`,
        {
          id,
          status: decision.approve ? 'approved' : 'denied',
          until: decision.approve ? decision.until : null,
          now: this.context.now(),
          decidedBy,
        },
      );
      return this.byId(id);
    });
  }
}
