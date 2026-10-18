import {
  appendTo,
  jsonEquals,
  type BoardClass,
  type BoardWidget,
  type WidgetSize,
} from '@smarteverything/domain';
import type {
  GalleryEntry,
  PickerState,
  TargetRow,
  TargetSection,
  WidgetDefinition,
} from '../types';
import { SIZE_LABELS, placeableSize, sizeOptions } from './edit-model';

export interface GalleryItem {
  readonly id: string;
  readonly definition: WidgetDefinition;
  readonly entry: GalleryEntry;
}

export interface GalleryGroup {
  readonly title: string;
  readonly items: readonly GalleryItem[];
}

export interface Suggestion {
  readonly item: GalleryItem;
  readonly row: TargetRow;
}

export interface TargetOption extends TargetRow {
  readonly onPage: boolean;
}

export interface TargetGroup {
  readonly title: string;
  readonly rows: readonly TargetOption[];
}

const OTHER_GROUP = 'More widgets';

const MAX_SUGGESTIONS = 4;

const GROUP_ORDER: readonly string[] = ['Lights', 'Devices', 'Cameras', 'Home', 'Health'];

function plainEntry(definition: WidgetDefinition, board: BoardClass): GalleryEntry {
  return {
    title: definition.title,
    subtitle: sizeOptions(definition, board)
      .map((option) => SIZE_LABELS[option.size])
      .join(' · '),
    icon: definition.icon,
    group: definition.group ?? OTHER_GROUP,
  };
}

function isRepeatable(item: GalleryItem): boolean {
  return item.entry.pick !== undefined || item.definition.instanceOptions !== undefined;
}

export function galleryItems(
  definitions: readonly WidgetDefinition[],
  placed: readonly BoardWidget[],
  board: BoardClass,
): readonly GalleryItem[] {
  const used = new Set(placed.map((widget) => widget.type));
  return definitions
    .flatMap((definition) =>
      (definition.entries ?? [plainEntry(definition, board)]).map((entry, index) => ({
        id: `${definition.type}:${String(index)}`,
        definition,
        entry,
      })),
    )
    .filter((item) => isRepeatable(item) || !used.has(item.definition.type));
}

function matches(query: string, ...texts: readonly string[]): boolean {
  const needle = query.trim().toLowerCase();
  return needle === '' || texts.some((text) => text.toLowerCase().includes(needle));
}

function rankOf(group: string): number {
  if (group === OTHER_GROUP) {
    return GROUP_ORDER.length + 1;
  }
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
}

export function galleryGroups(
  items: readonly GalleryItem[],
  query: string,
): readonly GalleryGroup[] {
  const groups = new Map<string, GalleryItem[]>();
  for (const item of items) {
    if (matches(query, item.entry.title, item.entry.subtitle, item.entry.group)) {
      appendTo(groups, item.entry.group, item);
    }
  }
  return [...groups.entries()]
    .map(([title, grouped]) => ({ title, items: grouped }))
    .sort((a, b) => rankOf(a.title) - rankOf(b.title));
}

function isOnPage(placed: readonly BoardWidget[], options: TargetRow['options']): boolean {
  return placed.some((widget) => jsonEquals(widget.options ?? {}, options));
}

function interleaved<T>(lists: readonly (readonly T[])[]): readonly T[] {
  const longest = Math.max(0, ...lists.map((list) => list.length));
  return Array.from({ length: longest }, (_, index) => lists.map((list) => list[index])).flatMap(
    (round) => round.filter((entry) => entry !== undefined),
  );
}

export function suggestionsOf(
  items: readonly GalleryItem[],
  state: PickerState,
  placed: readonly BoardWidget[],
): readonly Suggestion[] {
  const lists = items.map((item) => {
    const ofType = placed.filter((widget) => widget.type === item.definition.type);
    return (item.entry.pick?.suggestions?.(state) ?? [])
      .filter((row) => !isOnPage(ofType, row.options))
      .map((row) => ({ item, row }));
  });
  return interleaved(lists).slice(0, MAX_SUGGESTIONS);
}

export function targetGroups(
  sections: readonly TargetSection[],
  placed: readonly BoardWidget[],
  query: string,
): readonly TargetGroup[] {
  return sections
    .map((section) => ({
      title: section.title,
      rows: section.rows
        .filter((row) => matches(query, row.title, row.subtitle))
        .map((row) => ({
          ...row,
          onPage: isOnPage(placed, row.options),
        })),
    }))
    .filter((section) => section.rows.length > 0);
}

export function entrySize(item: GalleryItem, board: BoardClass): WidgetSize | null {
  const preferred = item.entry.defaultSize;
  if (preferred !== undefined && item.definition.sizes[board].includes(preferred)) {
    return preferred;
  }
  return placeableSize(item.definition, board);
}

export interface GalleryAdd {
  readonly type: string;
  readonly size: WidgetSize;
  readonly options?: NonNullable<BoardWidget['options']>;
}
