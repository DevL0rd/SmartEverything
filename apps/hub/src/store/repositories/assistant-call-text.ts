import { z } from 'zod';
import { storedRow } from '../codec';
export const CALL_TEXT = storedRow(
  z.strictObject({ at: z.iso.datetime({ offset: true }), text: z.string() }),
  {},
);

export type CallText = z.output<typeof CALL_TEXT>;
