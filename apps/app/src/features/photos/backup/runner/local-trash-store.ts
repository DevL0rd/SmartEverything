import { z } from 'zod';
import type { LedgerStorage } from './ports';

const LOCAL_TRASH_ENTRY = z.strictObject({
  itemId: z.uuid(),
  localId: z.string().min(1),
  modificationTime: z.number(),
});

const STORED_LOCAL_TRASH = z.strictObject({
  version: z.literal(1),
  entries: z.array(LOCAL_TRASH_ENTRY),
});

export type LocalTrashEntry = z.infer<typeof LOCAL_TRASH_ENTRY>;

export const LOCAL_TRASH_STORAGE_KEY = 'smarteverything.photos.backup.local-trash';

export async function loadLocalTrash(storage: LedgerStorage): Promise<readonly LocalTrashEntry[]> {
  const raw = await storage.getItem(LOCAL_TRASH_STORAGE_KEY);
  if (raw === null) return [];
  const parsed = STORED_LOCAL_TRASH.safeParse(JSON.parse(raw));
  if (!parsed.success)
    throw new Error(
      `The list of photos moved to this device's trash is unreadable: ${parsed.error.message}`,
    );
  return parsed.data.entries;
}

export function saveLocalTrash(
  storage: LedgerStorage,
  entries: readonly LocalTrashEntry[],
): Promise<void> {
  return storage.setItem(
    LOCAL_TRASH_STORAGE_KEY,
    JSON.stringify({ version: 1, entries: [...entries] }),
  );
}

export function trashedTimes(entries: readonly LocalTrashEntry[]): ReadonlyMap<string, number> {
  return new Map(entries.map((entry) => [entry.localId, entry.modificationTime]));
}
