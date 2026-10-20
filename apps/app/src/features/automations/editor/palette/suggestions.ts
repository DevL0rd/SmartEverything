import type { PaletteEntry } from './palette-categories';
import {
  LOOP_ONLY_KINDS,
  NO_USAGE,
  givesExpected,
  isShown,
  reasonFor,
  type PaletteContext,
  type PaletteUsage,
} from './palette-search';

export const MAX_SUGGESTIONS = 6;

const AFTER_TRIGGER_KINDS: readonly string[] = ['flow.guard', 'device.set'];
const IN_LOOP_KINDS: readonly string[] = [...LOOP_ONLY_KINDS];

function pickKinds(entries: readonly PaletteEntry[], kindIds: readonly string[]): PaletteEntry[] {
  return kindIds
    .map((id) => entries.find((entry) => entry.key === `node:${id}`))
    .filter((entry) => entry !== undefined);
}

function pickUsage(entries: readonly PaletteEntry[], ids: readonly string[]): PaletteEntry[] {
  return ids
    .map((id) => entries.find((entry) => entry.usageId === id))
    .filter((entry) => entry !== undefined);
}

function contextual(
  entries: readonly PaletteEntry[],
  context: PaletteContext,
  usage: PaletteUsage,
): PaletteEntry[] {
  if (context.slot === 'value' && context.expected !== null) {
    const expected = context.expected;
    const fitting = entries.filter((entry) => givesExpected(entry, expected));
    return [...pickUsage(fitting, [...usage.favourites, ...usage.recents]), ...fitting];
  }
  if (context.slot === 'trigger') return [];
  const kinds = [
    ...(context.inLoop ? IN_LOOP_KINDS : []),
    ...(context.afterTrigger ? AFTER_TRIGGER_KINDS : []),
  ];
  return pickKinds(entries, kinds);
}

export function suggestedEntries(
  entries: readonly PaletteEntry[],
  context: PaletteContext,
  usage: PaletteUsage = NO_USAGE,
): readonly PaletteEntry[] {
  const usable = entries.filter(
    (entry) => isShown(entry, context) && reasonFor(entry, context) === null,
  );
  const ordered = [
    ...contextual(usable, context, usage),
    ...pickUsage(usable, usage.favourites),
    ...pickUsage(usable, usage.recents),
  ];
  const seen = new Set<string>();
  const unique = ordered.filter((entry) => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
  return unique.slice(0, MAX_SUGGESTIONS);
}
