import { z } from 'zod';
import {
  DSH_SESSION_EVENT,
  DSH_SESSION_METADATA,
  DSH_SESSION_PAGE,
  type DshSessionAppend,
  type DshSessionMetadata,
  type DshSessionPage,
  type DshSessionRead,
} from '@smarteverything/domain';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';
import { DshSessionStorageError } from './dsh-session-errors';
import { sessionMetadata, type DshStoredSession } from './dsh-session-rows';
import {
  surfaceTailOf,
  validateNativeAppend,
  type EventAt,
  type SurfaceTail,
} from './dsh-session-event-validation';

const PAGE_BYTES = 16 * 1024 * 1024;
const EVENT_ROW = z.strictObject({
  seq: z.int().nonnegative(),
  event: SQL_JSON.pipe(DSH_SESSION_EVENT),
});
const STORED_EVENT = z.strictObject({ event: SQL_JSON.pipe(DSH_SESSION_EVENT) });
const SURFACE_ROW = z.strictObject({
  seq: z.int().nonnegative(),
  type: z.string(),
  op: z.string().nullable(),
});
const RECEIPT = z.strictObject({
  request: z.string(),
  result: SQL_JSON.pipe(DSH_SESSION_METADATA),
});

export class DshSessionEvents {
  private readonly tails = new Map<string, { readonly next: number; readonly tail: SurfaceTail }>();

  constructor(private readonly context: StoreContext) {}

  read(row: DshStoredSession, request: DshSessionRead): DshSessionPage {
    const offset = request.offset ?? 0;
    const limit = request.limit ?? 10_000;
    const rows = this.context.sql.all(
      EVENT_ROW,
      `select seq,event from (
         select seq,event,sum(size) over (order by seq) as upto from (
           select seq,event,length(cast(event as blob)) as size from dsh_session_events
           where session_id=$id and seq >= $offset and seq < $end order by seq limit $limit
         )
       ) where upto <= $budget or seq = $offset order by seq`,
      { id: row.session_id, offset, end: row.next_seq, limit, budget: PAGE_BYTES },
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
    if (rows.length === 0 && offset < row.next_seq)
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
    const result = this.write(row, input.events);
    this.keepReceipt(input, result);
    return result;
  }
  write(row: DshStoredSession, events: DshSessionAppend['events']): DshSessionMetadata {
    for (const [index, event] of events.entries()) {
      if (event.seq !== row.next_seq + index)
        throw new DshSessionStorageError(
          row.session_id,
          'sequence',
          `expected event ${String(row.next_seq + index)}, received ${String(event.seq)}`,
        );
    }
    const tail = this.takeTail(row);
    validateNativeAppend(
      {
        sessionId: row.session_id,
        from: row.next_seq,
        events,
        stored: this.storedEvent(row.session_id),
      },
      tail,
    );
    for (const event of events)
      this.context.sql.run(
        'append native session event',
        'insert into dsh_session_events(session_id,seq,event) values($id,$seq,$event)',
        { id: row.session_id, seq: event.seq, event: jsonText(event) },
      );
    const next = row.next_seq + events.length;
    this.context.sql.run(
      'advance durable native session prefix',
      'update dsh_sessions set next_seq=$next where session_id=$id',
      { next, id: row.session_id },
    );
    this.tails.set(row.session_id, { next, tail });
    return sessionMetadata({ ...row, next_seq: next });
  }
  private takeTail(row: DshStoredSession): SurfaceTail {
    const cached = this.tails.get(row.session_id);
    this.tails.delete(row.session_id);
    if (cached?.next === row.next_seq) return cached.tail;
    const rows = this.context.sql.all(
      SURFACE_ROW,
      "select seq, json_extract(event,'$.type') as type, json_extract(event,'$.surfaceOp') as op from dsh_session_events where session_id=$id order by seq",
      { id: row.session_id },
    );
    if (rows.length !== row.next_seq || rows.some((entry, index) => entry.seq !== index))
      throw new DshSessionStorageError(
        row.session_id,
        'corruption',
        'the durable event rows differ from their recorded prefix',
      );
    return surfaceTailOf(rows);
  }
  private storedEvent(sessionId: string): EventAt {
    return (seq) =>
      this.context.sql.get(
        STORED_EVENT,
        'select event from dsh_session_events where session_id=$id and seq=$seq',
        { id: sessionId, seq },
      )?.event;
  }
  receipt(input: DshSessionAppend): DshSessionMetadata | undefined {
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
  keepReceipt(input: DshSessionAppend, result: DshSessionMetadata): void {
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
