import { z } from 'zod';
import {
  DSH_SESSION_EVENT,
  DSH_SESSION_METADATA,
  DSH_SESSION_PAGE,
  type DshSessionAppend,
  type DshSessionMetadata,
  type DshSessionPage,
  type DshSessionRead,
  type DshSessionRelease,
} from '@smarteverything/domain';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';
import { DshSessionStorageError } from './dsh-session-errors';
import { sessionMetadata, type DshStoredSession } from './dsh-session-rows';
import { validateNativeAppend } from './dsh-session-event-validation';

const EVENT_ROW = z.strictObject({
  seq: z.int().nonnegative(),
  event: SQL_JSON.pipe(DSH_SESSION_EVENT),
});
const RECEIPT = z.strictObject({
  request: z.string(),
  result: SQL_JSON.pipe(DSH_SESSION_METADATA),
});

export class DshSessionEvents {
  constructor(private readonly context: StoreContext) {}

  read(row: DshStoredSession, request: DshSessionRead): DshSessionPage {
    const offset = request.offset ?? 0;
    const limit = request.limit ?? 10_000;
    const rows = this.context.sql.all(
      EVENT_ROW,
      'select seq,event from dsh_session_events where session_id=$id and seq >= $offset and seq < $end order by seq limit $limit',
      { id: row.session_id, offset, end: row.next_seq, limit },
    );
    for (const [index, entry] of rows.entries()) {
      if (entry.seq !== offset + index || entry.event.seq !== entry.seq) {
        throw new DshSessionStorageError(
          row.session_id,
          'corruption',
          'the durable event sequence contains a gap or mismatched envelope',
        );
      }
    }
    const expected = Math.min(limit, Math.max(0, row.next_seq - offset));
    if (rows.length !== expected)
      throw new DshSessionStorageError(
        row.session_id,
        'corruption',
        'the durable prefix is missing events',
      );
    const next = offset + rows.length;
    return DSH_SESSION_PAGE.parse({
      metadata: sessionMetadata(row),
      events: rows.map((entry) => entry.event),
      next_offset: next < row.next_seq ? next : null,
    });
  }
  append(row: DshStoredSession, input: DshSessionAppend): DshSessionMetadata {
    const receipt = this.receipt(input);
    if (receipt !== undefined) return receipt;
    this.validateAppend(row, input);
    const vocabulary = new Set(row.composition.event_vocabulary);
    for (const [index, event] of input.events.entries()) {
      if (event.seq !== row.next_seq + index)
        throw new DshSessionStorageError(
          row.session_id,
          'sequence',
          `expected event ${String(row.next_seq + index)}, received ${String(event.seq)}`,
        );
      if (!vocabulary.has(event.type) && event.ignorable !== true)
        throw new DshSessionStorageError(
          row.session_id,
          'composition',
          `required event type ${event.type} is outside the stored vocabulary`,
        );
      this.context.sql.run(
        'append native session event',
        'insert into dsh_session_events(session_id,seq,event) values($id,$seq,$event)',
        { id: row.session_id, seq: event.seq, event: jsonText(event) },
      );
    }
    const next = row.next_seq + input.events.length;
    this.context.sql.run(
      'advance durable native session prefix',
      'update dsh_sessions set next_seq=$next where session_id=$id',
      { next, id: row.session_id },
    );
    const result = sessionMetadata({ ...row, next_seq: next });
    this.keepReceipt(input, result);
    return result;
  }
  private validateAppend(row: DshStoredSession, input: DshSessionAppend): void {
    const previous = this.context.sql.all(
      EVENT_ROW,
      'select seq,event from dsh_session_events where session_id=$id order by seq',
      { id: row.session_id },
    );
    if (
      previous.length !== row.next_seq ||
      previous.some((entry, index) => entry.seq !== index || entry.event.seq !== entry.seq)
    ) {
      throw new DshSessionStorageError(
        row.session_id,
        'corruption',
        'the durable event rows differ from their recorded prefix',
      );
    }
    validateNativeAppend(row.session_id, [
      ...previous.map((entry) => entry.event),
      ...input.events,
    ]);
  }
  receipt(input: DshSessionAppend | DshSessionRelease): DshSessionMetadata | undefined {
    const receipt = this.context.sql.get(
      RECEIPT,
      'select request,result from dsh_session_receipts where session_id=$id and operation_id=$operation',
      { id: input.claim.session_id, operation: input.operation_id },
    );
    if (receipt === undefined) return undefined;
    if (receipt.request !== jsonText(input))
      throw new DshSessionStorageError(
        input.claim.session_id,
        'receipt',
        'the operation was retried with a different payload',
      );
    return receipt.result;
  }
  keepReceipt(input: DshSessionAppend | DshSessionRelease, result: DshSessionMetadata): void {
    this.context.sql.run(
      'retain native session operation receipt',
      'insert into dsh_session_receipts(session_id,operation_id,request,result) values($id,$operation,$request,$result)',
      {
        id: input.claim.session_id,
        operation: input.operation_id,
        request: jsonText(input),
        result: jsonText(result),
      },
    );
  }
}
