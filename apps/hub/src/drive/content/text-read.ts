import { z } from 'zod';
import type { StoreContext } from '../../store/context';

const BODY = z.object({ body: z.string() });

export function readIndexedText(context: Pick<StoreContext, 'sql'>, itemId: string): string | null {
  return (
    context.sql.get(BODY, 'select body from drive_item_text_search where item_id = $itemId', {
      itemId,
    })?.body ?? null
  );
}
