import { z } from 'zod';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';

const STORED_OP = z
  .strictObject({ result: SQL_JSON })
  .transform((row) => z.record(z.string(), z.unknown()).parse(row.result));

export class DriveSyncOpsRepository {
  constructor(private readonly context: StoreContext) {}

  recall(placementId: string, opId: string): Readonly<Record<string, unknown>> | undefined {
    return this.context.sql.get(
      STORED_OP,
      'select result from drive_sync_ops where placement_id = $placementId and op_id = $opId',
      { placementId, opId },
    );
  }

  remember(placementId: string, opId: string, result: Readonly<Record<string, unknown>>): void {
    this.context.write(() => {
      this.context.sql.run(
        'remember the drive sync operation',
        `insert into drive_sync_ops (placement_id, op_id, result, at)
          values ($placementId, $opId, $result, $at)`,
        { placementId, opId, result: jsonText(result), at: this.context.now() },
      );
    });
  }

  claim(claim: {
    readonly placementId: string;
    readonly opId: string;
    readonly action: string;
  }): void {
    this.context.sql.run(
      'claim the drive sync operation',
      `insert into drive_sync_ops (placement_id, op_id, result, at)
        values ($placementId, $opId, $result, $at)
        on conflict (placement_id, op_id) do nothing`,
      {
        placementId: claim.placementId,
        opId: claim.opId,
        result: jsonText({ action: claim.action, reply: null }),
        at: this.context.now(),
      },
    );
  }

  rememberAll(
    entries: readonly {
      readonly placementId: string;
      readonly opId: string;
      readonly result: Readonly<Record<string, unknown>>;
    }[],
  ): void {
    this.context.write(() => {
      for (const entry of entries) {
        this.context.sql.run(
          'save the drive mount operation reply',
          `insert into drive_sync_ops (placement_id, op_id, result, at)
            values ($placementId, $opId, $result, $at)
            on conflict (placement_id, op_id) do update set result = excluded.result`,
          {
            placementId: entry.placementId,
            opId: entry.opId,
            result: jsonText(entry.result),
            at: this.context.now(),
          },
        );
      }
    });
  }
}
