import type { PaletteEntry, PaletteGroup } from './palette-categories';
import { isShown, type PaletteContext, type PaletteUsage } from './palette-search';
import { suggestedEntries } from './suggestions';

export interface Overview {
  readonly suggested: readonly PaletteEntry[];
  readonly favourites: readonly PaletteEntry[];
  readonly recents: readonly PaletteEntry[];
  readonly groups: readonly PaletteGroup[];
}

function byUsage(
  entries: readonly PaletteEntry[],
  ids: readonly string[],
  context: PaletteContext,
): readonly PaletteEntry[] {
  return ids.flatMap((id) => {
    const entry = entries.find((candidate) => candidate.usageId === id);
    return entry !== undefined && isShown(entry, context) ? [entry] : [];
  });
}

export function visibleGroups(
  groups: readonly PaletteGroup[],
  context: PaletteContext,
): readonly PaletteGroup[] {
  return groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => isShown(entry, context)),
    }))
    .filter((group) => group.entries.length > 0);
}

export function overviewOf(
  entries: readonly PaletteEntry[],
  groups: readonly PaletteGroup[],
  context: PaletteContext,
  usage: PaletteUsage,
): Overview {
  return {
    suggested: suggestedEntries(entries, context, usage),
    favourites: byUsage(entries, usage.favourites, context),
    recents: byUsage(entries, usage.recents, context).slice(0, 6),
    groups: visibleGroups(groups, context),
  };
}

export function openGroup(
  groups: readonly PaletteGroup[],
  key: string | null,
): PaletteGroup | undefined {
  return key === null ? undefined : groups.find((group) => group.key === key);
}
