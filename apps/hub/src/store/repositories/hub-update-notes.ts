import type { StoreContext } from '../context';
import { z } from 'zod';

const RUN = z.strictObject({ run_id: z.uuid() });

export class HubUpdateNotesRepository {
  constructor(private readonly context: StoreContext) {}

  has(runId: string): boolean {
    return (
      this.context.sql.get(RUN, 'select run_id from hub_update_notes where run_id=$runId', {
        runId,
      }) !== undefined
    );
  }

  claim(runId: string): boolean {
    return (
      this.context.sql.run(
        'claim a hub update outcome note',
        'insert into hub_update_notes(run_id) values($runId) on conflict(run_id) do nothing',
        { runId },
      ) > 0
    );
  }
}
