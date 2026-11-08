import type { PhotoInsights } from '@smarteverything/domain';
import type { BarSegment } from '../../../components/charts';
import type { RankedEntry } from '../../../components/ranked-list';
import { bytes, count, percent } from '../../../format/number';
import { compareText } from '../../../format/text';
import { videoTime } from './model';

function share(value: number, top: number): number {
  return top === 0 ? 0 : value / top;
}

function ranked(
  rows: readonly { readonly key: string; readonly label: string; readonly items: number }[],
): readonly RankedEntry[] {
  const top = rows.reduce((most, row) => Math.max(most, row.items), 0);
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: count(row.items),
    share: share(row.items, top),
    spoken: `${row.label}, ${count(row.items)} items`,
  }));
}

export function cameraName(make: string | null, model: string | null): string {
  if (model === null) return make ?? 'Unknown camera';
  if (make === null || model.toLowerCase().startsWith(make.toLowerCase())) return model;
  return `${make} ${model}`;
}

export function cameraEntries(cameras: PhotoInsights['cameras']): readonly RankedEntry[] {
  return ranked(
    cameras.map((camera) => ({
      key: `${camera.make ?? ''}|${camera.model ?? ''}`,
      label: cameraName(camera.make, camera.model),
      items: camera.items,
    })),
  );
}

export function lensEntries(lenses: PhotoInsights['lenses']): readonly RankedEntry[] {
  return ranked(lenses.map((lens) => ({ key: lens.name, label: lens.name, items: lens.items })));
}

export function countryEntries(
  countries: PhotoInsights['places']['countries'],
): readonly RankedEntry[] {
  return ranked(
    countries.map((country) => ({
      key: country.countryCode,
      label: country.country,
      items: country.items,
    })),
  );
}

export function placesLabel(places: PhotoInsights['places']): string {
  const named = places.countries.map((country) => `${country.country} ${count(country.items)}`);
  return named.length === 0
    ? 'Countries with photos: none yet'
    : `Countries with photos: ${named.join(', ')}`;
}

export interface CoverageRow {
  readonly key: string;
  readonly name: string;
  readonly progress: number;
  readonly value: string;
  readonly note: string;
}

export function coverageRows(coverage: PhotoInsights['backupCoverage']): readonly CoverageRow[] {
  return coverage.map((phone) => {
    const left = phone.total - phone.backedUp;
    const progress = phone.total === 0 ? 1 : phone.backedUp / phone.total;
    return {
      key: phone.deviceId,
      name: phone.name,
      progress,
      value: percent(progress, left === 0 ? 0 : 1),
      note: left === 0 ? 'Up to date' : `${count(left)} left`,
    };
  });
}

export function largestNote(video: PhotoInsights['largestVideos'][number]): string {
  return video.durationMs === null
    ? bytes(video.bytes)
    : `${bytes(video.bytes)} · ${videoTime(video.durationMs)}`;
}

export interface FolderRow {
  readonly key: string;
  readonly label: string;
  readonly segments: readonly BarSegment[];
  readonly total: number;
  readonly note: string;
}

export interface FolderBars {
  readonly rows: readonly FolderRow[];
  readonly scale: number;
  readonly summary: string;
}

export function folderBars(
  roots: PhotoInsights['roots'],
  labelOf: (rootId: string) => string,
): FolderBars {
  const rows = roots
    .map((root) => ({
      key: root.rootId,
      label: labelOf(root.rootId),
      segments: [
        { label: 'Photos', value: root.photoBytes, colour: 'viz-1' },
        { label: 'Videos', value: root.videoBytes, colour: 'viz-3' },
      ] as const,
      total: root.photoBytes + root.videoBytes,
      note: `${bytes(root.photoBytes)} photos · ${bytes(root.videoBytes)} videos`,
    }))
    .sort((left, right) => right.total - left.total || compareText(left.label, right.label));
  const all = rows.reduce((sum, row) => sum + row.total, 0);
  const folders = rows.length === 1 ? '1 folder' : `${count(rows.length)} folders`;
  return { rows, scale: rows[0]?.total ?? 0, summary: `${bytes(all)} in ${folders}` };
}
