import type { AssistantMessageRow } from '@smarteverything/domain';
import { dayLabel, localDayKey } from '../../../format/time';

export type ThreadItem =
  | {
      readonly type: 'message';
      readonly key: string;
      readonly row: AssistantMessageRow;
      readonly turnStart: boolean;
      readonly day: string | null;
    }
  | { readonly type: 'status'; readonly key: string; readonly request: AssistantMessageRow };

function chronological(rows: readonly AssistantMessageRow[]): readonly AssistantMessageRow[] {
  return [...rows].sort((left, right) => left.created_at.localeCompare(right.created_at));
}

function shown(row: AssistantMessageRow): boolean {
  return (
    row.text.trim() !== '' || row.attachments.length > 0 || row.role === 'person' || hasStatus(row)
  );
}

function exchangeEnds(
  rows: readonly AssistantMessageRow[],
): ReadonlyMap<string, AssistantMessageRow> {
  const ends = new Map<string, AssistantMessageRow>();
  const lastOf = new Map<string, string>();
  for (const row of rows) {
    if (row.role === 'person') {
      lastOf.set(row.id, row.id);
    } else if (row.reply_to !== null && lastOf.has(row.reply_to)) {
      lastOf.set(row.reply_to, row.id);
    }
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const [requestId, lastId] of lastOf) {
    const request = byId.get(requestId);
    if (request !== undefined && hasStatus(request)) {
      ends.set(lastId, request);
    }
  }
  return ends;
}

function hasStatus(request: AssistantMessageRow): boolean {
  if (request.state === null) {
    return false;
  }
  return request.state !== 'answered' || request.steps.length > 0;
}

export function threadOf(
  rows: readonly AssistantMessageRow[],
  now: number,
  timeZone: string | null,
): readonly ThreadItem[] {
  const ordered = chronological(rows.filter(shown));
  const ends = exchangeEnds(ordered);
  const items: ThreadItem[] = [];
  ordered.forEach((row, index) => {
    const previous = ordered[index - 1];
    const newDay =
      previous === undefined ||
      localDayKey(previous.created_at, timeZone) !== localDayKey(row.created_at, timeZone);
    items.push({
      type: 'message',
      key: row.id,
      row,
      turnStart: previous?.role !== row.role,
      day: newDay ? dayLabel(row.created_at, now, timeZone) : null,
    });
    const request = ends.get(row.id);
    if (request !== undefined) {
      items.push({ type: 'status', key: `status-${request.id}`, request });
    }
  });
  return items.reverse();
}

export function oldestOf(rows: readonly AssistantMessageRow[]): string | null {
  return chronological(rows)[0]?.created_at ?? null;
}
