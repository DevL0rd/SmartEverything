import { z } from 'zod';
import type { StoreContext } from '../context';

const FAILURE = z.object({ version: z.number(), reason: z.string() });

export class EntryFailures {
  constructor(private readonly context: StoreContext) {}

  record(sourceId: string, entryId: string, version: number, reason: string): boolean {
    const before = this.context.sql.get(
      FAILURE,
      `select version, reason from health_entry_failures
       where entry_id = $entryId and source_id = $sourceId`,
      { entryId, sourceId },
    );
    if (before?.version === version && before.reason === reason) {
      return false;
    }
    this.context.sql.run(
      'note the Health Connect failure',
      `insert into health_entry_failures (entry_id, source_id, version, reason, failed_at)
       values ($entryId, $sourceId, $version, $reason, $now)
       on conflict (entry_id, source_id) do update set version = excluded.version,
         reason = excluded.reason, failed_at = excluded.failed_at`,
      { entryId, sourceId, version, reason, now: this.context.now() },
    );
    return true;
  }

  clear(entryId: string, sourceId: string | null): boolean {
    return (
      this.context.sql.run(
        'forget the Health Connect failure',
        `delete from health_entry_failures
         where entry_id = $entryId and ($sourceId is null or source_id = $sourceId)`,
        { entryId, sourceId },
      ) > 0
    );
  }
}
