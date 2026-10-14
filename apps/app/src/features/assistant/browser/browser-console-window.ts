import type { ConsolePage, ConsoleRecord } from './browser-diagnostics-contract';
export const PINNED_CONSOLE_RECORD_LIMIT = 2000;
export interface PinnedConsoleWindow {
  readonly kind: 'paused';
  readonly page: ConsolePage;
  readonly latestSeen: string | null;
  readonly skippedOlder: number;
}
export type ConsoleWindow = { readonly kind: 'tail' } | PinnedConsoleWindow;
class ConsolePageChangedError extends Error {
  override readonly name = 'ConsolePageChangedError';
  constructor(
    readonly expected: string,
    readonly received: string,
  ) {
    super(
      `Console page changed while loading older entries: expected ${expected}, received ${received}.`,
    );
  }
}
export function pinConsolePage(page: ConsolePage): PinnedConsoleWindow {
  return { kind: 'paused', page, latestSeen: page.records.at(-1)?.id ?? null, skippedOlder: 0 };
}
export function pinnedConsoleFull(window: PinnedConsoleWindow): boolean {
  return window.page.records.length >= PINNED_CONSOLE_RECORD_LIMIT;
}
export function prependConsolePage(
  window: PinnedConsoleWindow,
  older: ConsolePage,
): PinnedConsoleWindow {
  const expected = `${window.page.documentId}:${window.page.epoch}`;
  const received = `${older.documentId}:${older.epoch}`;
  if (expected !== received) throw new ConsolePageChangedError(expected, received);
  const prefix = uniqueOlderRecords(window.page.records, older.records);
  const room = Math.max(0, PINNED_CONSOLE_RECORD_LIMIT - window.page.records.length);
  const accepted = prefix.slice(Math.max(0, prefix.length - room));
  return {
    ...window,
    page: { ...older, records: [...accepted, ...window.page.records] },
    skippedOlder: window.skippedOlder + prefix.length - accepted.length,
  };
}
function uniqueOlderRecords(
  current: readonly ConsoleRecord[],
  older: readonly ConsoleRecord[],
): readonly ConsoleRecord[] {
  const seen = new Set(current.map((record) => record.id));
  return older.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}
