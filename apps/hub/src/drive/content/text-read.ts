import { z } from 'zod';
import type { StoreContext } from '../../store/context';

const BODY = z.object({ body: z.string() });

export function readIndexedText(context: Pick<StoreContext, 'sql'>, itemId: string): string | null {
  return (
    context.sql.get(BODY, `select s.body from drive_item_text t
        join drive_item_text_search s on s.rowid = t.rowid where t.item_id = $itemId`, {
      itemId,
    })?.body ?? null
  );
}
