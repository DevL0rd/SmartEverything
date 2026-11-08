import type { DriveItem, DuplicateGroup, DuplicateStats } from '@smarteverything/domain';
import type { BarSegment } from '../../../components/charts';
import type { ConfirmRequest } from '../../../components/confirm-store';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count, decimal } from '../../../format/number';

export const SOURCE_COLOURS: readonly ColourRole[] = [
  'viz-6',
  'viz-3',
  'viz-5',
  'viz-1',
  'viz-2',
  'viz-4',
];

export const KEEP_BEST_RULE =
  'Keep best keeps the largest picture, then the larger file, then the newest. Albums, favourites and descriptions move to the one you keep. Copies go to Recently deleted.';

export type SourceLabels = ReadonlyMap<string, string>;

export function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`;
}

export function sourceColourOf(index: number): ColourRole {
  return SOURCE_COLOURS[index % SOURCE_COLOURS.length] ?? 'viz-1';
}

export function sourceSegmentsOf(stats: DuplicateStats): readonly BarSegment[] {
  return stats.sources.map((source, index) => ({
    label: source.label,
    value: source.copies,
    colour: sourceColourOf(index),
  }));
}

export function sourceLabelsOf(stats: DuplicateStats | undefined): SourceLabels {
  return new Map((stats?.sources ?? []).map((source) => [source.rootId, source.label]));
}

export interface LibraryShare {
  readonly total: string;
  readonly share: number;
}

export function libraryShareOf(
  bytesBack: number,
  libraryBytes: number | undefined,
): LibraryShare | null {
  if (libraryBytes === undefined || libraryBytes === 0) return null;
  return { total: `of ${bytes(libraryBytes)}`, share: Math.min(1, bytesBack / libraryBytes) };
}

export function summaryOf(stats: DuplicateStats): string {
  return `${plural(stats.groups, 'group', 'groups')} · ${plural(stats.extraCopies, 'extra copy', 'extra copies')}`;
}

export const KEEP_ALL_LABEL = 'Keep best in all groups';

export function keepAllConfirmOf(stats: DuplicateStats): ConfirmRequest {
  const copies = plural(stats.extraCopies, 'copy moves', 'copies move');
  return {
    title:
      stats.groups === 1
        ? 'Keep best in the 1 group?'
        : `Keep best in all ${count(stats.groups)} groups?`,
    body: `${copies} to Recently deleted. Their ${bytes(stats.bytesBack)} is freed when they leave for good, a year after today. Albums and favourites move to the photo you keep. You can restore any copy until then.`,
    confirmLabel: `Keep best in ${plural(stats.groups, 'group', 'groups')}`,
    cancelLabel: 'Keep all copies',
  };
}

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : null;
}

export function copiesOf(group: DuplicateGroup): readonly DriveItem[] {
  return [
    ...group.items.filter((item) => item.id === group.keeperItemId),
    ...group.items.filter((item) => item.id !== group.keeperItemId),
  ];
}

export function groupLineOf(group: DuplicateGroup): string {
  return `${plural(group.items.length, 'copy', 'copies')} · saves ${bytes(group.reclaimableBytes)}`;
}

function listOf(names: readonly string[]): string {
  const last = names.at(-1);
  if (names.length < 2 || last === undefined) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${last}`;
}

export function groupSourcesOf(group: DuplicateGroup, labels: SourceLabels): string | null {
  const names = new Set<string>();
  for (const item of copiesOf(group)) {
    const label = labels.get(item.rootId);
    if (label !== undefined) names.add(label);
  }
  return names.size === 0 ? null : listOf([...names]);
}

function videoSizeOf(width: number, height: number): string {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long >= 3840) return '4K';
  return `${String(short)}p`;
}

export function shapeOf(item: DriveItem): string | null {
  const raw = extensionOf(item.name);
  if (item.kind === 'video') {
    return item.width !== null && item.height !== null ? videoSizeOf(item.width, item.height) : raw;
  }
  if (item.kind === 'image' && item.width !== null && item.height !== null) {
    return `${decimal((item.width * item.height) / 1_000_000)} MP`;
  }
  return raw;
}

export function itemLineOf(item: DriveItem): string {
  const shape = shapeOf(item);
  const size = bytes(item.bytes);
  return shape === null ? size : `${shape} · ${size}`;
}

function folderOf(relPath: string): string | null {
  const slash = relPath.lastIndexOf('/');
  return slash > 0 ? relPath.slice(0, slash) : null;
}

export function sourceOf(item: DriveItem, labels: SourceLabels): string | null {
  const label = labels.get(item.rootId);
  if (label === undefined) return null;
  const folder = folderOf(item.relPath);
  return folder === null ? label : `${label}/${folder}`;
}

export function keptLabelOf(result: {
  readonly trashed: number;
  readonly reclaimedBytes: number;
}): string {
  if (result.trashed === 0) return 'Nothing moved. The other copies are in read-only folders.';
  return `${plural(result.trashed, 'copy', 'copies')} moved to Recently deleted · ${bytes(result.reclaimedBytes)} back in a year`;
}

export function copyLabelOf(item: DriveItem, keeper: boolean, labels: SourceLabels): string {
  return [keeper ? 'Keep' : 'Copy', item.name, itemLineOf(item), sourceOf(item, labels)]
    .filter(Boolean)
    .join(', ');
}
