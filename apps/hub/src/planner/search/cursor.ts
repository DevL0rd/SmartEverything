import { ApiError } from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';

const CURSOR = z.strictObject({
  group: z.int().min(0).max(2),
  time: z.number(),
  item: z.string().min(1),
  key: z.string().min(1),
});

export type SearchPosition = z.infer<typeof CURSOR>;

export function encodeCursor(position: SearchPosition): string {
  return Buffer.from(JSON.stringify(position)).toString('base64url');
}

export function decodeCursor(cursor: string): SearchPosition {
  try {
    return CURSOR.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch (cause) {
    throw new ApiError(
      'invalid_request',
      `Expected the cursor of an earlier search page but received one that cannot be read: ${messageOf(cause)}`,
    );
  }
}

export function compare(a: SearchPosition, b: SearchPosition): number {
  return (
    a.group - b.group ||
    a.time - b.time ||
    a.item.localeCompare(b.item) ||
    a.key.localeCompare(b.key)
  );
}
