import type { MessageItem } from '../data/thread';
import type { InlineTimelinePart } from './inline-timeline';
import { visibleReplyParts } from './reply-timeline';
import type { ReplySegment } from './reply-segments';
import { positionOf } from './speaker';

interface AnchoredRange {
  readonly after: string | null;
  readonly from: number;
  readonly to: number;
}

function rangesOf(
  parts: readonly InlineTimelinePart[],
  anchors: ReadonlySet<string>,
): readonly AnchoredRange[] {
  const ranges: AnchoredRange[] = [];
  let from = 0;
  let after: string | null = null;
  parts.forEach((part, index) => {
    if (part.kind !== 'steer' || !anchors.has(part.message_id)) return;
    ranges.push({ after, from, to: index });
    after = part.message_id;
    from = index + 1;
  });
  ranges.push({ after, from, to: parts.length });
  return ranges;
}

function slicedItem(item: MessageItem, range: AnchoredRange, segment: ReplySegment): MessageItem {
  return range.after === null
    ? { ...item, segment }
    : {
        ...item,
        key: `${item.row.id}#after:${range.after}`,
        position: 'only',
        day: null,
        gap: null,
        divider: false,
        segment,
      };
}

function appendAfter(waiting: Map<string, MessageItem[]>, id: string, item: MessageItem): void {
  const items = waiting.get(id);
  if (items === undefined) waiting.set(id, [item]);
  else items.push(item);
}

function orderedItems(
  items: readonly MessageItem[],
  dependencies: ReadonlyMap<string, readonly string[]>,
): readonly MessageItem[] {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const emitted = new Set<string>();
  const visiting = new Set<string>();
  const result: MessageItem[] = [];
  const emit = (key: string): void => {
    if (emitted.has(key) || visiting.has(key)) return;
    const item = byKey.get(key);
    if (item === undefined) return;
    visiting.add(key);
    for (const before of dependencies.get(key) ?? []) emit(before);
    visiting.delete(key);
    emitted.add(key);
    result.push(item);
  };
  for (const item of items) emit(item.key);
  return result;
}

function dependsOn(dependencies: Map<string, string[]>, key: string, before: string): void {
  const previous = dependencies.get(key);
  if (previous === undefined) dependencies.set(key, [before]);
  else previous.push(before);
}

export function interleavedReplies(
  items: readonly MessageItem[],
  showSteps: boolean,
  joins: (left: MessageItem | undefined, right: MessageItem | undefined) => boolean,
): readonly MessageItem[] {
  const ids = new Set(items.map((item) => item.row.id));
  const waiting = new Map<string, MessageItem[]>();
  const dependencies = new Map<string, string[]>();
  const originals = items.map((item) => {
    const parts = visibleReplyParts(item.row, showSteps);
    if (parts === null) return item;
    const anchors = new Set(
      parts.flatMap((part) =>
        part.kind === 'steer' && part.message_id !== item.row.id && ids.has(part.message_id)
          ? [part.message_id]
          : [],
      ),
    );
    if (anchors.size === 0) return item;
    const ranges = rangesOf(parts, anchors);
    const slices = ranges.map((range, slice) =>
      slicedItem(item, range, {
        index: slice,
        count: ranges.length,
        from: range.from,
        to: range.to,
      }),
    );
    slices.forEach((slice, position) => {
      const after = ranges[position]?.after;
      const previous = slices[position - 1];
      if (after === null || after === undefined || previous === undefined) return;
      appendAfter(waiting, after, slice);
      dependsOn(dependencies, after, previous.key);
      dependsOn(dependencies, slice.key, after);
    });
    return slices[0] ?? item;
  });
  const ordered = orderedItems(
    originals.flatMap((item) => [item, ...(waiting.get(item.row.id) ?? [])]),
    dependencies,
  );
  return ordered.map((item, index) => ({
    ...item,
    position: positionOf(joins(ordered[index - 1], item), joins(item, ordered[index + 1])),
  }));
}
