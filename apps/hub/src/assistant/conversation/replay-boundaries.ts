import type { ChatTimelineEmbed, ChatTimelinePart } from '@smarteverything/domain';

type Activity = Exclude<ChatTimelinePart, { readonly kind: 'steer' }>;
type Boundary = Extract<ChatTimelinePart, { readonly kind: 'steer' }>;
interface Cut {
  readonly at: number;
  readonly part: Boundary;
}
interface Cursor {
  index: number;
  offset: number;
  at: number;
  diverged: boolean;
}

function consumeText(
  saved: Exclude<Activity, { readonly kind: 'tool' }>,
  current: readonly Activity[],
  before: Cursor,
): Cursor {
  const cursor = { ...before };
  let offset = 0;
  while (offset < saved.text.length) {
    const part = current[cursor.index];
    if (part?.kind !== saved.kind) return { ...cursor, diverged: true };
    while (offset < saved.text.length && cursor.offset < part.text.length) {
      if (saved.text[offset] !== part.text[cursor.offset]) return { ...cursor, diverged: true };
      offset += 1;
      cursor.offset += 1;
      cursor.at += 1;
    }
    if (cursor.offset === part.text.length) {
      cursor.offset = 0;
      cursor.index += 1;
    }
  }
  return cursor;
}

function consume(saved: Activity, current: readonly Activity[], cursor: Cursor): Cursor {
  if (cursor.diverged) return cursor;
  if (saved.kind !== 'tool') return consumeText(saved, current, cursor);
  const part = current[cursor.index];
  return part?.kind === 'tool' && part.tool.callId === saved.tool.callId
    ? { ...cursor, index: cursor.index + 1, at: cursor.at + 1 }
    : { ...cursor, diverged: true };
}

function cutsOf(saved: ChatTimelineEmbed, current: readonly Activity[]): readonly Cut[] {
  const cuts: Cut[] = [];
  let cursor: Cursor = { index: 0, offset: 0, at: 0, diverged: false };
  for (const part of saved.parts) {
    if (part.kind === 'steer') cuts.push({ at: cursor.at, part });
    else cursor = consume(part, current, cursor);
  }
  return cuts;
}

function sizeOf(part: Activity): number {
  return part.kind === 'tool' ? 1 : part.text.length;
}

function portion(part: Activity, from: number, to: number): readonly Activity[] {
  if (from === to) return [];
  if (part.kind === 'tool') return [part];
  return [
    {
      ...part,
      key: from === 0 ? part.key : `${part.key}#resume:${String(from)}`,
      text: part.text.slice(from, to),
    },
  ];
}

export function replayBoundaries(
  saved: ChatTimelineEmbed,
  current: ChatTimelineEmbed,
): ChatTimelineEmbed {
  if (!saved.parts.some((part) => part.kind === 'steer')) return current;
  const activities = current.parts.filter((part): part is Activity => part.kind !== 'steer');
  const cuts = cutsOf(saved, activities);
  const result: ChatTimelinePart[] = [];
  let at = 0;
  let next = 0;
  for (const part of activities) {
    const size = sizeOf(part);
    let offset = 0;
    let cut = cuts[next];
    while (cut !== undefined && cut.at <= at + size) {
      const to = cut.at - at;
      result.push(...portion(part, offset, to), cut.part);
      offset = to;
      next += 1;
      cut = cuts[next];
    }
    result.push(...portion(part, offset, size));
    at += size;
  }
  result.push(...cuts.slice(next).map((cut) => cut.part));
  return { ...current, parts: result };
}
