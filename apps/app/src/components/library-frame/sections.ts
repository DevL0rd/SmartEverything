import type { ReactNode } from 'react';
import { frameLayoutMath } from '../frame-layout';
import type { IconName } from '../icon';
import type { RailEntry, RailGroup } from '../section-rail';
import { count as formatCount } from '../../format/number';

export interface LibrarySection {
  readonly id: string;
  readonly label: string;
  readonly short?: string | undefined;
  readonly icon: IconName;
  readonly count: number | string | null;
  readonly detail?: ReactNode;
}

export interface LibrarySectionGroup {
  readonly title: string | null;
  readonly sections: readonly LibrarySection[];
}

export const { frameLayoutOf: libraryLayoutOf, railWidthOf: libraryRailWidthOf } = frameLayoutMath({
  compactMax: 600,
  iconRailMax: 900,
  wideRailMin: 1024,
});

export function countText(count: LibrarySection['count']): string | undefined {
  if (count === null || count === '') return undefined;
  return typeof count === 'number' ? formatCount(count) : count;
}

export function railEntryOf(section: LibrarySection): RailEntry {
  return {
    id: section.id,
    label: section.label,
    short: section.short,
    icon: section.icon,
    missing: null,
    detail: section.detail ?? null,
    count: countText(section.count),
  };
}

export function railGroupsOf(groups: readonly LibrarySectionGroup[]): readonly RailGroup[] {
  return groups.map((group) => ({
    title: group.title,
    entries: group.sections.map(railEntryOf),
  }));
}
