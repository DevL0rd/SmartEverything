import type { PhoneDetail } from '@smarteverything/domain';
import type { RankedEntry } from '../../../components/ranked-list';
import { bytes, percent } from '../../../format/number';

export type StackColour = 'viz-1' | 'viz-2' | 'viz-3' | 'viz-4' | 'viz-5' | 'viz-6';

export type StorageSection = NonNullable<PhoneDetail['storage']>;

type PartKind = StorageSection['parts'][number]['kind'];

const PART_LABEL: Readonly<Record<PartKind, string>> = {
  apps: 'Apps',
  images: 'Images',
  video: 'Video',
  audio: 'Audio',
  system: 'System',
  other: 'Other',
};

const PART_COLOUR: Readonly<Record<PartKind, StackColour>> = {
  apps: 'viz-1',
  images: 'viz-2',
  video: 'viz-3',
  audio: 'viz-4',
  system: 'viz-5',
  other: 'viz-6',
};

export interface StoragePart {
  readonly key: string;
  readonly label: string;
  readonly weight: number;
  readonly colour: StackColour | null;
  readonly text: string;
}

export function usedBytes(storage: StorageSection): number {
  return Math.max(0, storage.totalBytes - storage.freeBytes);
}

export function usedShare(storage: StorageSection): number {
  return storage.totalBytes > 0 ? usedBytes(storage) / storage.totalBytes : 0;
}

export function needsUsageAccess(storage: StorageSection, own: boolean): boolean {
  return own ? storage.parts.length === 0 : false;
}

export function usedText(storage: StorageSection): string {
  return `${percent(usedShare(storage))} used`;
}

export function partsOf(storage: StorageSection): readonly StoragePart[] {
  const parts = storage.parts
    .filter((part) => part.bytes > 0)
    .sort((left, right) => right.bytes - left.bytes);
  return [
    ...parts.map((part) => ({
      key: part.kind,
      label: PART_LABEL[part.kind],
      weight: part.bytes,
      colour: PART_COLOUR[part.kind],
      text: bytes(part.bytes),
    })),
    freePart(storage),
  ];
}

function freePart(storage: StorageSection): StoragePart {
  return {
    key: 'free',
    label: 'Free',
    weight: storage.freeBytes,
    colour: null,
    text: bytes(storage.freeBytes),
  };
}

export function summaryParts(storage: StorageSection): readonly StoragePart[] {
  const used = usedBytes(storage);
  return [
    { key: 'used', label: 'Used', weight: used, colour: 'viz-1', text: bytes(used) },
    freePart(storage),
  ];
}

export function storageSpoken(storage: StorageSection): string {
  const named = partsOf(storage).map((part) => `${part.label} ${part.text}`);
  return `Storage, ${named.join(', ')}, of ${bytes(storage.totalBytes)}`;
}

export function largestApps(storage: StorageSection): readonly RankedEntry[] {
  const sorted = storage.apps.slice().sort((left, right) => right.bytes - left.bytes);
  const biggest = sorted[0]?.bytes ?? 0;
  return sorted.map((app) => ({
    key: app.package,
    label: app.label === '' ? app.package : app.label,
    value: bytes(app.bytes),
    share: biggest > 0 ? app.bytes / biggest : 0,
  }));
}
