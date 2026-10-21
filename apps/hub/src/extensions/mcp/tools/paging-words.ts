import type { McpToolName } from '@smarteverything/domain';
import { z } from 'zod';

const RECORD = z.record(z.string(), z.unknown());

const NEXT_PAGE_KEYS: ReadonlySet<string> = new Set(['next_cursor']);

const NEXT_AS_CURSOR: ReadonlySet<McpToolName> = new Set(['process_read', 'file_read']);

function renamedKeys(value: unknown, top: boolean, nextIsCursor: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => renamedKeys(item, false, nextIsCursor));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      NEXT_PAGE_KEYS.has(key) || (nextIsCursor && key === 'next') ? 'nextCursor' : key,
      renamedKeys(child, false, nextIsCursor && top),
    ]),
  );
}

export function withOnePagingWord(
  name: McpToolName,
  structured: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return RECORD.parse(renamedKeys(structured, true, NEXT_AS_CURSOR.has(name)));
}
