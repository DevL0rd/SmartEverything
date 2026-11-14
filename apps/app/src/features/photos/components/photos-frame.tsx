import type { ReactNode } from 'react';
import type { PhotoInsightKind, PhotoInsights, PhotoRailCounts } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { mainPageSettings } from '../../../app-shell/main-pages';
import type { AppHref } from '../../../components/app-href';
import { SegmentBar, type BarSegment } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import type { PageSettingsLink } from '../../../components/page-settings-button';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import {
  LibraryFrame,
  SummaryWell,
  type LibraryFrameProps,
  type LibrarySection,
  type LibrarySectionGroup,
} from '../../../components/library-frame';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import { useLibraryRefresh } from '../../drive';
import { PAUSE_LABELS } from '../backup/model/conditions';
import { useBackupStatus, type BackupStatus } from '../backup/model/status';
import { usePhotoInsights, usePhotoRailCounts } from '../data';

export const PHOTOS_RAIL_HREF = {
  library: href.photos(),
  albums: href.photosPage('albums'),
  map: href.photosPage('map'),
  insights: href.photosPage('insights'),
  deleted: href.photosPage('deleted'),
} as const satisfies Readonly<Record<string, AppHref>>;

export const PHOTOS_BACKUP_SETTINGS_HREF: AppHref = href.settings.page('photos/backup');

export type PhotosRailId = keyof typeof PHOTOS_RAIL_HREF;

export interface PhotosRailView {
  readonly counts: PhotoRailCounts | undefined;
  readonly insights: PhotoInsights | undefined;
  readonly compact: boolean;
}

interface RailSpec {
  readonly label: string;
  readonly short?: string;
  readonly icon: IconName;
}

const SPEC: Readonly<Record<PhotosRailId, RailSpec>> = {
  library: { label: 'Library', icon: 'image' },
  albums: { label: 'Albums', icon: 'layers' },
  map: { label: 'Map and places', short: 'Map', icon: 'mapPin' },
  insights: { label: 'Insights', icon: 'trendUp' },
  deleted: { label: 'Recently deleted', short: 'Deleted', icon: 'trash' },
};

const TOP: readonly PhotosRailId[] = ['library', 'albums', 'map'];

const MANAGE: readonly PhotosRailId[] = ['insights', 'deleted'];

type Count = LibrarySection['count'];

type Amount = number | null | undefined;

function amountOf(value: Amount, one: string, many = `${one}s`): string | null {
  if (value === null || value === undefined || value === 0) return null;
  return `${count(value)} ${value === 1 ? one : many}`;
}

const NO_COUNT = (): Count => null;

const COUNT_OF: Readonly<Record<PhotosRailId, (view: PhotosRailView) => Count>> = {
  library: (view) => view.counts?.library ?? null,
  albums: (view) => view.counts?.albums ?? null,
  map: (view) => view.counts?.places ?? null,
  insights: NO_COUNT,
  deleted: (view) => view.counts?.deleted ?? null,
};

function insightsSummary(view: PhotosRailView): string | null {
  const places = view.insights?.places;
  if (places === undefined || places.places === 0) return null;
  return joinParts([
    amountOf(places.places, 'place'),
    amountOf(places.countries.length, 'country', 'countries'),
  ]);
}

const SUMMARY_OF: Readonly<Record<PhotosRailId, (view: PhotosRailView) => string | null>> = {
  library: (view) => amountOf(view.counts?.library, 'item'),
  albums: (view) => amountOf(view.counts?.albums, 'album'),
  map: (view) => amountOf(view.counts?.places, 'place'),
  insights: insightsSummary,
  deleted: (view) => amountOf(view.counts?.deleted, 'item'),
};

export function railSummaryOf(id: PhotosRailId, view: PhotosRailView): string | null {
  return SUMMARY_OF[id](view);
}

function DetailText({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
      {text}
    </Text>
  );
}

function sectionOf(id: PhotosRailId, view: PhotosRailView): LibrarySection {
  const spec = SPEC[id];
  const base = { id, label: spec.label, short: spec.short, icon: spec.icon };
  if (view.compact) return { ...base, count: COUNT_OF[id](view) };
  const summary = railSummaryOf(id, view);
  return {
    ...base,
    count: null,
    ...(summary === null ? {} : { detail: <DetailText text={summary} /> }),
  };
}

export function photosRailGroups(view: PhotosRailView): readonly LibrarySectionGroup[] {
  return [
    { title: null, sections: TOP.map((id) => sectionOf(id, view)) },
    { title: 'Manage', sections: MANAGE.map((id) => sectionOf(id, view)) },
  ];
}

export const PHOTOS_PHONE_TABS: readonly TabItem[] = [
  { key: 'library', label: 'Library', href: PHOTOS_RAIL_HREF.library },
  { key: 'albums', label: 'Albums', href: PHOTOS_RAIL_HREF.albums },
  { key: 'map', label: 'Places', href: PHOTOS_RAIL_HREF.map },
];

const HREFS: ReadonlyMap<string, AppHref> = new Map(Object.entries(PHOTOS_RAIL_HREF));

export function photosHrefOf(id: string): AppHref {
  const target = HREFS.get(id);
  if (target === undefined) throw new Error(`Photos has no section ${id}`);
  return target;
}

export function photosTitleOf(active: PhotosRailId): string {
  return active === 'library' ? 'Photos' : SPEC[active].label;
}

export function phoneLeftOf(status: BackupStatus): number | null {
  if (status.phase === 'off' || status.phase === 'unavailable' || status.phase === 'denied') {
    return null;
  }
  return Math.max(0, status.total - status.done);
}

function leftLine(status: BackupStatus): string {
  return `This device: ${count(phoneLeftOf(status) ?? 0)} left`;
}

const PHONE_HEADLINE: Readonly<
  Record<BackupStatus['phase'], (status: BackupStatus) => string | null>
> = {
  unavailable: () => null,
  off: () => 'Backup is off on this device',
  denied: () => 'This device: photo access is off',
  scanning: () => 'This device: looking for new photos',
  uploading: leftLine,
  paused: leftLine,
  idle: (status) =>
    (phoneLeftOf(status) ?? 0) === 0 ? 'This device: up to date' : leftLine(status),
};

function phoneStateOf(status: BackupStatus): string | null {
  if (status.phase === 'uploading') return 'Backing up';
  if (status.phase === 'paused') return PAUSE_LABELS[status.pauseReason ?? 'user'];
  return null;
}

export interface BackupLines {
  readonly headline: string | null;
  readonly state: string | null;
}

function devicesLine(phones: number | undefined): string | null {
  if (phones === undefined) return null;
  if (phones === 0) return 'No devices back up here yet';
  return phones === 1 ? '1 device backs up here' : `${count(phones)} devices back up here`;
}

export function backupLinesOf(
  phone: boolean,
  status: BackupStatus,
  phones: number | undefined,
): BackupLines {
  if (!phone) return { headline: devicesLine(phones), state: null };
  return { headline: PHONE_HEADLINE[status.phase](status), state: phoneStateOf(status) };
}

type KindGroup = 'Photos' | 'RAW' | 'Videos';

const KIND_GROUP: Readonly<Record<PhotoInsightKind, KindGroup>> = {
  photo: 'Photos',
  screenshot: 'Photos',
  raw: 'RAW',
  video: 'Videos',
};

const KIND_COLOUR: Readonly<Record<KindGroup, BarSegment['colour']>> = {
  Photos: 'viz-1',
  RAW: 'viz-green',
  Videos: 'viz-3',
};

const KIND_ORDER: readonly KindGroup[] = ['Photos', 'RAW', 'Videos'];

export function librarySegmentsOf(kinds: PhotoInsights['kinds']): readonly BarSegment[] {
  return KIND_ORDER.map((group) => ({
    label: group,
    value: kinds
      .filter((kind) => KIND_GROUP[kind.kind] === group)
      .reduce((sum, kind) => sum + kind.bytes, 0),
    colour: KIND_COLOUR[group],
  }));
}

export interface SummaryProps {
  readonly insights: PhotoInsights | undefined;
  readonly items: number | undefined;
  readonly lines: BackupLines;
}

function BackupLink({ line }: { readonly line: string }): ReactNode {
  return (
    <Interactive
      href={PHOTOS_BACKUP_SETTINGS_HREF}
      role="link"
      label={line}
      hint="Opens backup settings"
      className="-mx-1 min-h-11 flex-row items-center gap-2 rounded-sm px-1"
      layerClassName="rounded-sm"
    >
      <Icon name="upload" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" numberOfLines={2} className="min-w-0 flex-1">
        {line}
      </Text>
      <Icon name="chevronRight" size={16} tone="variant" />
    </Interactive>
  );
}

function backupLineOf(lines: BackupLines): string | null {
  const line = joinParts([lines.headline, lines.state]);
  return line === '' ? null : line;
}

export function RailSummary({ insights, lines }: SummaryProps): ReactNode {
  const line = backupLineOf(lines);
  return (
    <SummaryWell
      title="Library"
      trailing={
        insights === undefined ? null : (
          <Text variant="footnote" className="tabular font-sans-medium">
            {bytes(insights.bytes)}
          </Text>
        )
      }
    >
      {insights === undefined || insights.bytes === 0 ? null : (
        <SegmentBar
          segments={librarySegmentsOf(insights.kinds)}
          label="Library size by kind"
          size="thin"
          legend
          format={bytes}
        />
      )}
      {line === null ? null : <BackupLink line={line} />}
    </SummaryWell>
  );
}

export function PullUpSummary({ insights, items, lines }: SummaryProps): ReactNode {
  const library = joinParts([
    amountOf(items, 'item'),
    insights === undefined ? null : bytes(insights.bytes),
  ]);
  const line = backupLineOf(lines);
  return (
    <SummaryWell
      title="Photos"
      trailing={
        library === '' ? null : (
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
            {library}
          </Text>
        )
      }
    >
      {line === null ? null : <BackupLink line={line} />}
    </SummaryWell>
  );
}

export type PhotosFrameProps = Omit<
  LibraryFrameProps,
  'area' | 'title' | 'sections' | 'active' | 'hrefOf' | 'summary' | 'chips' | 'settings' | 'refresh'
> & {
  readonly settings?: PageSettingsLink;
  readonly active: PhotosRailId;
  readonly title?: string;
};

interface PhotosFrameData {
  readonly view: PhotosRailView;
  readonly summary: SummaryProps;
}

function usePhotosFrameData(): PhotosFrameData {
  const counts = usePhotoRailCounts().data;
  const insights = usePhotoInsights('all_time').data;
  const status = useBackupStatus();
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const phone = isNative();
  return {
    view: { counts, insights, compact },
    summary: {
      insights,
      items: counts?.library,
      lines: backupLinesOf(phone, status, counts?.backupDevices),
    },
  };
}

export function PhotosFrame({ active, title, ...frame }: PhotosFrameProps): ReactNode {
  const { view, summary } = usePhotosFrameData();
  const refresh = useLibraryRefresh(null);
  return (
    <LibraryFrame
      {...frame}
      settings={frame.settings ?? mainPageSettings('photos')}
      refresh={refresh}
      area="photos"
      title={title ?? photosTitleOf(active)}
      sections={photosRailGroups(view)}
      active={active}
      hrefOf={photosHrefOf}
      chips={
        frame.breadcrumbs === undefined ? (
          <TabsBar items={PHOTOS_PHONE_TABS} active={active} label="Photos sections" />
        ) : undefined
      }
      summary={view.compact ? <PullUpSummary {...summary} /> : <RailSummary {...summary} />}
    />
  );
}
