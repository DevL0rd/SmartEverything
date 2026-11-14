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

  forgetBefore(at: string): number {
    return this.context.write(() =>
      this.context.sql.run(
        'forget the old drive sync operations',
        'delete from drive_sync_ops where at < $at',
        { at },
      ),
    );
  }
}
