import { z } from 'zod';
import {
  DSH_SESSION_HEADER,
  DSH_SESSION_ID,
  DSH_SESSION_COMPOSITION,
  DSH_WRITER_CLAIM,
  DSH_SESSION_METADATA,
  type DshSessionId,
  type DshSessionMetadata,
} from '@smarteverything/domain';
import { found, type StoreContext } from '../context';
import { SQL_JSON } from '../sql';
import { DshSessionStorageError } from './dsh-session-errors';

export const DSH_STORED_SESSION = z.strictObject({
  session_id: DSH_SESSION_ID,
  chat_id: z.uuid(),
  profile_id: z.uuid(),
  header: SQL_JSON.pipe(DSH_SESSION_HEADER),
  composition: SQL_JSON.pipe(DSH_SESSION_COMPOSITION),
  inherited_event_count: z.int().nonnegative(),
  next_seq: z.int().nonnegative(),
  epoch: z.int().nonnegative(),
  claim: SQL_JSON.pipe(DSH_WRITER_CLAIM).nullable(),
  claim_state: z.enum(['active', 'released']).nullable(),
  acquire_operation: z.uuid().nullable(),
  creation_request: z.string(),
});
export type DshStoredSession = z.infer<typeof DSH_STORED_SESSION>;
const COLUMNS =
  'session_id,chat_id,profile_id,header,composition,inherited_event_count,next_seq,epoch,claim,claim_state,acquire_operation,creation_request';

export class DshSessionRows {
  constructor(readonly context: StoreContext) {}

  find(id: DshSessionId): DshStoredSession | undefined {
    return this.context.sql.get(
      DSH_STORED_SESSION,
      `select ${COLUMNS} from dsh_sessions where session_id=$id`,
      { id },
    );
  }
  get(id: DshSessionId, profileId: string): DshStoredSession {
    const row = found(this.find(id), 'native session', id);
    this.authorize(row, profileId);
    return row;
  }
  authorize(row: DshStoredSession, profileId: string): void {
    if (row.profile_id !== z.uuid().parse(profileId)) {
      throw new DshSessionStorageError(
        row.session_id,
        'forbidden',
        'the session belongs to a different profile',
      );
    }
    if (row.header.id !== row.session_id) {
      throw new DshSessionStorageError(
        row.session_id,
        'corruption',
        'the stored header and session identity disagree',
      );
    }
  }
  list(profileId: string): DshSessionMetadata[] {
    return this.context.sql
      .all(
        DSH_STORED_SESSION,
        `select ${COLUMNS} from dsh_sessions where profile_id=$profile order by created_at,session_id`,
        { profile: z.uuid().parse(profileId) },
      )
      .map(sessionMetadata);
  }
}

export function sessionMetadata(row: DshStoredSession): DshSessionMetadata {
  return DSH_SESSION_METADATA.parse({
    chat_id: row.chat_id,
    profile_id: row.profile_id,
    header: row.header,
    composition: row.composition,
    inherited_event_count: row.inherited_event_count,
    next_seq: row.next_seq,
    durable_seq: row.next_seq - 1,
  });
}
