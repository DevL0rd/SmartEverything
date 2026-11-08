import { z } from 'zod';
import type { ClientSql } from './sql.js';

export const PENDING_OP_KINDS = ['push', 'move', 'tombstone'] as const;
export const PENDING_OP_STATES = ['queued', 'sent'] as const;

const OP_ROW = z
  .object({
    op_id: z.string(),
    kind: z.enum(PENDING_OP_KINDS),
    payload: z.string().transform((text): unknown => JSON.parse(text)),
    state: z.enum(PENDING_OP_STATES),
  })
  .strict()
  .readonly();

export interface PendingOp {
  readonly opId: string;
  readonly kind: (typeof PENDING_OP_KINDS)[number];
  readonly payload: unknown;
  readonly state: (typeof PENDING_OP_STATES)[number];
}

export class PendingOpsRepository {
  constructor(private readonly sql: ClientSql) {}

  enqueue(op: Omit<PendingOp, 'state'>): void {
    this.sql.run(
      "insert into pending_ops (op_id, kind, payload, state) values (?, ?, ?, 'queued')",
      [op.opId, op.kind, JSON.stringify(op.payload)],
    );
  }

  list(): readonly PendingOp[] {
    return this.sql
      .all(OP_ROW, 'select op_id, kind, payload, state from pending_ops order by rowid')
      .map((row) => ({
        opId: row.op_id,
        kind: row.kind,
        payload: row.payload,
        state: row.state,
      }));
  }

  markSent(opId: string): boolean {
    return this.sql.run("update pending_ops set state = 'sent' where op_id = ?", [opId]) === 1;
  }

  requeueSent(): number {
    return this.sql.run("update pending_ops set state = 'queued' where state = 'sent'");
  }

  acknowledge(opId: string): boolean {
    return this.sql.run('delete from pending_ops where op_id = ?', [opId]) === 1;
  }
}
