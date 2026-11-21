import {
  DRIVE_ACCESS_REQUEST,
  DRIVE_ACCESS_REQUEST_STATES,
  DRIVE_GRANT_ROLE,
  type DriveAccessAnswer,
  type DriveAccessRequest,
  type DriveGrantRole,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import { found, type StoreContext } from '../context';

const SELECT = `select q.id, q.item_id, q.requester_profile_id, r.owner_profile_id,
    i.name as item_name, q.role, q.message, q.state, q.answered_by, q.answered_at, q.expires_at,
    q.created_at
  from drive_access_requests q
  join drive_items i on i.id = q.item_id
  join drive_roots r on r.id = i.root_id`;

const REQUEST_COLUMNS = z.strictObject({
  id: z.string(),
  item_id: z.string(),
  requester_profile_id: z.string(),
  owner_profile_id: z.string(),
  item_name: z.string(),
  role: DRIVE_GRANT_ROLE,
  message: z.string().nullable(),
  state: z.enum(DRIVE_ACCESS_REQUEST_STATES),
  answered_by: z.string().nullable(),
  answered_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  created_at: z.string(),
});

type RequestRow = z.output<typeof REQUEST_COLUMNS>;

const STORED_REQUEST = storedRow(REQUEST_COLUMNS, {});

export function requestSeenBy(request: DriveAccessRequest, viewer: string): DriveAccessRequest {
  return viewer === request.ownerProfileId || request.state === 'approved'
    ? request
    : { ...request, itemName: null };
}

function requestOf(row: RequestRow, viewer: string): DriveAccessRequest {
  return requestSeenBy(ownerViewOf(row), viewer);
}

function ownerViewOf(row: RequestRow): DriveAccessRequest {
  return DRIVE_ACCESS_REQUEST.parse({
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    requesterProfileId: row.requester_profile_id,
    ownerProfileId: row.owner_profile_id,
    role: row.role,
    message: row.message,
    state: row.state,
    answeredBy: row.answered_by,
    answeredAt: row.answered_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  });
}

export class DriveAccessRequestPendingError extends Error {
  override readonly name = 'DriveAccessRequestPendingError';

  constructor(readonly requestId: string) {
    super(`The access request ${requestId} was already answered.`);
  }
}

export interface DriveAccessRequestInput {
  readonly id?: string | undefined;
  readonly itemId: string;
  readonly requesterProfileId: string;
  readonly role: DriveGrantRole;
  readonly message: string | null;
}

export interface DriveAccessRequestWindow {
  readonly requests: readonly DriveAccessRequest[];
  readonly next: string | null;
}

export class DriveAccessRequestsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string, viewer: string): DriveAccessRequest | undefined {
    const row = this.row(id);
    return row === undefined ? undefined : requestOf(row, viewer);
  }

  byId(id: string, viewer: string): DriveAccessRequest {
    return found(this.find(id, viewer), 'drive access request', id);
  }

  pendingFor(itemId: string, requesterProfileId: string): DriveAccessRequest | undefined {
    const row = this.context.sql.get(
      STORED_REQUEST,
      `${SELECT} where q.item_id = $itemId and q.requester_profile_id = $requesterProfileId
        and q.state = 'pending'`,
      { itemId, requesterProfileId },
    );
    return row === undefined ? undefined : requestOf(row, requesterProfileId);
  }

  made(profileId: string, after: string | null, limit: number): DriveAccessRequestWindow {
    return this.window('q.requester_profile_id = $profileId', profileId, after, limit);
  }

  waiting(ownerProfileId: string, after: string | null, limit: number): DriveAccessRequestWindow {
    return this.window(
      "r.owner_profile_id = $profileId and q.state = 'pending'",
      ownerProfileId,
      after,
      limit,
    );
  }

  create(input: DriveAccessRequestInput): DriveAccessRequest {
    return this.context.write(() => {
      const id = input.id ?? this.context.newId();
      this.context.sql.run(
        'create the drive access request',
        `insert into drive_access_requests (id, item_id, requester_profile_id, role, message, state,
          created_at) values ($id, $itemId, $requesterProfileId, $role, $message, 'pending', $now)`,
        {
          id,
          itemId: input.itemId,
          requesterProfileId: input.requesterProfileId,
          role: input.role,
          message: input.message,
          now: this.context.now(),
        },
      );
      const row = found(this.row(id), 'drive access request', id);
      this.context.changed('drive_access_requests', 'INSERT', ownerViewOf(row), null);
      return requestOf(row, input.requesterProfileId);
    });
  }

  answer(id: string, answeredBy: string, answer: DriveAccessAnswer): DriveAccessRequest {
    return this.context.write(() => {
      const before = this.row(id);
      if (before?.state !== 'pending') throw new DriveAccessRequestPendingError(id);
      const approved = answer.decision === 'approve';
      this.context.sql.run(
        'answer the drive access request',
        `update drive_access_requests set state = $state, role = $role, answered_by = $answeredBy,
          answered_at = $now, expires_at = $expiresAt where id = $id`,
        {
          id,
          state: approved ? 'approved' : 'declined',
          role: approved ? answer.role : before.role,
          answeredBy,
          now: this.context.now(),
          expiresAt: approved ? answer.expiresAt : null,
        },
      );
      const after = found(this.row(id), 'drive access request', id);
      this.context.changed(
        'drive_access_requests',
        'UPDATE',
        ownerViewOf(after),
        ownerViewOf(before),
      );
      return requestOf(after, answeredBy);
    });
  }

  private row(id: string): RequestRow | undefined {
    return this.context.sql.get(STORED_REQUEST, `${SELECT} where q.id = $id`, { id });
  }

  private window(
    where: string,
    profileId: string,
    after: string | null,
    limit: number,
  ): DriveAccessRequestWindow {
    const rows = this.context.sql.all(
      STORED_REQUEST,
      `${SELECT} where ${where}
        ${after === null ? '' : 'and (q.created_at, q.id) < (select created_at, id from drive_access_requests where id = $after)'}
        order by q.created_at desc, q.id desc limit $limit`,
      after === null ? { profileId, limit } : { profileId, after, limit },
    );
    const last = rows.at(-1);
    return {
      requests: rows.map((row) => requestOf(row, profileId)),
      next: rows.length === limit && last !== undefined ? last.id : null,
    };
  }
}
