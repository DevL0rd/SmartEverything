import { z } from 'zod';

export const EDIT_PARAMS = z.strictObject({ itemId: z.uuid() }).readonly();

export function editItemOf(params: unknown): string | null {
  const parsed = EDIT_PARAMS.safeParse(params);
  return parsed.success ? parsed.data.itemId : null;
}
