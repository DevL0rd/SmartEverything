import type { AssistantMessageRow } from '@smarteverything/domain';
import { oldestOf } from './thread';

export const HISTORY_PAGE_SIZE = 50;

interface Recovery {
  readonly first: string | undefined;
  readonly through: string | null;
  readonly additionalPage: boolean;
  readonly load: (before: string | undefined) => Promise<readonly AssistantMessageRow[]>;
  readonly current: () => boolean;
}

interface LoadedHistory {
  readonly rows: readonly AssistantMessageRow[];
  readonly complete: boolean;
}

class HistoryCursorError extends Error {
  override readonly name = 'HistoryCursorError';

  constructor(
    readonly before: string,
    readonly received: string,
  ) {
    super(
      `Older messages did not advance the cursor before ${before}. The oldest row is ${received}.`,
    );
  }
}

function oldestOnPage(
  page: readonly AssistantMessageRow[],
  before: string | undefined,
): string | null {
  const oldest = oldestOf(page);
  if (oldest !== null && before !== undefined && oldest >= before)
    throw new HistoryCursorError(before, oldest);
  return oldest;
}

export async function recoverPages({
  first,
  through,
  additionalPage,
  load,
  current,
}: Recovery): Promise<LoadedHistory | null> {
  const rows: AssistantMessageRow[] = [];
  let before = first;
  let needsMore = additionalPage;
  while (current()) {
    const page = await load(before);
    if (!current()) return null;
    const oldest = oldestOnPage(page, before);
    rows.push(...page);
    if (oldest === null || page.length < HISTORY_PAGE_SIZE) return { rows, complete: true };
    if (through === null || oldest <= through) {
      if (!needsMore) return { rows, complete: false };
      needsMore = false;
    }
    before = oldest;
  }
  return null;
}
