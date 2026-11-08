import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoInsightKind, PhotoInsights, PhotoRailCounts } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { SegmentBar, type BarSegment } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import { useAreaWidth } from '../../../design/size-class';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { useIsOwner } from '../../../store/selectors';
import {
  LibraryFrame,
  SummaryWell,
  type LibraryFrameProps,
  type LibrarySection,
  type LibrarySectionGroup,
} from '../../nas/frame';
import { libraryLayoutOf } from '../../nas/frame/sections';
import { PAUSE_LABELS } from '../backup/model/conditions';
import { useBackupStatus, type BackupStatus } from '../backup/model/status';
import { usePhotoInsights, usePhotoRailCounts } from '../data';
import { videoTime } from '../insights/model';

export const PHOTOS_RAIL_HREF = {
  timeline: href.photos(),
  search: href.photosPage('search'),
  memories: href.photosPage('memories'),
  albums: href.photosPage('albums'),
  map: href.photosPage('map'),
  favourites: href.photosPage('favourites'),
  videos: href.photosPage('videos'),
  screenshots: href.photosPage('screenshots'),
  cameras: href.photosPage('cameras'),
  ai: href.photosPage('ai'),
  duplicates: href.photosPage('duplicates'),
  backup: href.photosPage('backup'),
  insights: href.photosPage('insights'),
  deleted: href.photosPage('deleted'),
} as const satisfies Readonly<Record<string, AppHref>>;

export type PhotosRailId = keyof typeof PHOTOS_RAIL_HREF;

export interface PhotosRailView {
  readonly counts: PhotoRailCounts | undefined;
  readonly insights: PhotoInsights | undefined;
  readonly owner: boolean;
  readonly phone: boolean;
  readonly compact: boolean;
  readonly phoneLeft: number | null;
}

interface RailSpec {
  readonly label: string;
  readonly short?: string;
  readonly icon: IconName;
}

const SPEC: Readonly<Record<PhotosRailId, RailSpec>> = {
  timeline: { label: 'Timeline', icon: 'image' },
  search: { label: 'Search', icon: 'search' },
  memories: { label: 'Memories', icon: 'clock' },
  albums: { label: 'Albums', icon: 'layers' },
  map: { label: 'Map and places', short: 'Map', icon: 'mapPin' },
  favourites: { label: 'Favourites', short: 'Faves', icon: 'star' },
  videos: { label: 'Videos', icon: 'film' },
  screenshots: { label: 'Screenshots', short: 'Screens', icon: 'smartphone' },
  cameras: { label: 'Cameras', icon: 'camera' },
  ai: { label: 'Made with AI', short: 'AI', icon: 'sparkles' },
  duplicates: { label: 'Duplicates', short: 'Copies', icon: 'copy' },
  backup: { label: 'Backup', icon: 'upload' },
  insights: { label: 'Insights', icon: 'trendUp' },
  deleted: { label: 'Recently deleted', short: 'Deleted', icon: 'trash' },
};

const TOP: readonly PhotosRailId[] = ['timeline', 'search', 'memories', 'albums', 'map'];

const LIBRARY: readonly PhotosRailId[] = ['favourites', 'videos', 'screenshots', 'cameras', 'ai'];

const MANAGE: readonly PhotosRailId[] = ['duplicates', 'backup', 'insights', 'deleted'];

type Count = LibrarySection['count'];

type Amount = number | null | undefined;

function amountOf(value: Amount, one: string, many = `${one}s`): string | null {
  if (value === null || value === undefined || value === 0) return null;
  return `${count(value)} ${value === 1 ? one : many}`;
}

function bareOf(value: Amount): string | null {
  return value === null || value === undefined || value === 0 ? null : count(value);
}

function backupCount(view: PhotosRailView): string | null {
  if (!view.phone) return amountOf(view.counts?.backupPhones, 'device');
  return view.phoneLeft === null || view.phoneLeft === 0 ? null : `${count(view.phoneLeft)} left`;
}

const NO_COUNT = (): Count => null;

const COUNT_OF: Readonly<Record<PhotosRailId, (view: PhotosRailView) => Count>> = {
  timeline: (view) => view.counts?.timeline ?? null,
  search: NO_COUNT,
  memories: (view) => view.counts?.memories ?? null,
  albums: (view) => view.counts?.albums ?? null,
  map: (view) => view.counts?.places ?? null,
  favourites: (view) => view.counts?.favourites ?? null,
  videos: (view) => view.counts?.videos ?? null,
  screenshots: (view) => view.counts?.screenshots ?? null,
  cameras: (view) => view.counts?.cameras ?? null,
  ai: (view) => view.counts?.ai ?? null,
  duplicates: (view) => amountOf(view.counts?.duplicates, 'group'),
  backup: backupCount,
  insights: NO_COUNT,
  deleted: (view) => view.counts?.deleted ?? null,
};

function videosSummary(view: PhotosRailView): string | null {
  const videos = bareOf(view.counts?.videos);
  if (videos === null) return null;
  const length = view.insights?.videoTotals.durationMs ?? 0;
  return joinParts([videos, length === 0 ? null : videoTime(length)]);
}

function insightsSummary(view: PhotosRailView): string | null {
  const places = view.insights?.places;
  if (places === undefined || places.places === 0) return null;
  return joinParts([
    amountOf(places.places, 'place'),
    amountOf(places.countries.length, 'country', 'countries'),
  ]);
}

const SUMMARY_OF: Readonly<Record<PhotosRailId, (view: PhotosRailView) => string | null>> = {
  timeline: (view) => amountOf(view.counts?.timeline, 'item'),
  search: () => 'Places, dates, what is in it',
  memories: (view) => amountOf(view.counts?.memories, 'memory', 'memories'),
  albums: (view) => amountOf(view.counts?.albums, 'album'),
  map: (view) => amountOf(view.counts?.places, 'place'),
  favourites: (view) => bareOf(view.counts?.favourites),
  videos: videosSummary,
  screenshots: (view) => bareOf(view.counts?.screenshots),
  cameras: (view) => bareOf(view.counts?.cameras),
  ai: (view) => bareOf(view.counts?.ai),
  duplicates: (view) => amountOf(view.counts?.duplicates, 'group'),
  backup: backupCount,
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
  const manage = view.owner ? MANAGE : MANAGE.filter((id) => id !== 'duplicates');
  return [
    { title: null, sections: TOP.map((id) => sectionOf(id, view)) },
    { title: 'Library', sections: LIBRARY.map((id) => sectionOf(id, view)) },
    { title: 'Manage', sections: manage.map((id) => sectionOf(id, view)) },
  ];
}

export const PHOTOS_PHONE_TABS: readonly TabItem[] = [
  { key: 'timeline', label: 'Timeline', href: PHOTOS_RAIL_HREF.timeline },
  { key: 'memories', label: 'Memories', href: PHOTOS_RAIL_HREF.memories },
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
  return active === 'timeline' ? 'Photos' : SPEC[active].label;
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

function phonesLine(phones: number | undefined): string | null {
  if (phones === undefined) return null;
  if (phones === 0) return 'No devices back up here yet';
  return phones === 1 ? '1 device backs up here' : `${count(phones)} devices back up here`;
}

export function backupLinesOf(
  phone: boolean,
  status: BackupStatus,
  phones: number | undefined,
): BackupLines {
  if (!phone) return { headline: phonesLine(phones), state: null };
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

export function RailSummary({ insights, lines }: SummaryProps): ReactNode {
  const line = joinParts([lines.headline, lines.state]);
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
      {line === '' ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {line}
        </Text>
      )}
    </SummaryWell>
  );
}

export function PullUpSummary({ insights, items, lines }: SummaryProps): ReactNode {
  const library = joinParts([
    amountOf(items, 'item'),
    insights === undefined ? null : bytes(insights.bytes),
  ]);
  return (
    <SummaryWell
      title="Photos"
      trailing={
        lines.headline === null ? null : (
          <Text variant="caption" tone="primary" numberOfLines={1} className="tabular">
            {lines.headline}
          </Text>
        )
      }
    >
      {library === '' && lines.state === null ? null : (
        <View className="flex-row items-center gap-3">
          <Text
            variant="caption"
            tone="variant"
            numberOfLines={1}
            className="min-w-0 flex-1 tabular"
          >
            {library}
          </Text>
          {lines.state === null ? null : (
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {lines.state}
            </Text>
          )}
        </View>
      )}
    </SummaryWell>
  );
}

export type PhotosFrameProps = Omit<
  LibraryFrameProps,
  'area' | 'title' | 'sections' | 'active' | 'hrefOf' | 'summary' | 'chips'
> & {
  readonly active: PhotosRailId;
  readonly title?: string;
};

interface PhotosFrameData {
  readonly view: PhotosRailView;
  readonly summary: SummaryProps;
}

function usePhotosFrameData(): PhotosFrameData {
  const owner = useIsOwner();
  const counts = usePhotoRailCounts().data;
  const insights = usePhotoInsights('all_time').data;
  const status = useBackupStatus();
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const phone = isNative();
  return {
    view: { counts, insights, owner, phone, compact, phoneLeft: phoneLeftOf(status) },
    summary: {
      insights,
      items: counts?.timeline,
      lines: backupLinesOf(phone, status, counts?.backupPhones),
    },
  };
}

export function PhotosFrame({ active, title, ...frame }: PhotosFrameProps): ReactNode {
  const { view, summary } = usePhotosFrameData();
  return (
    <LibraryFrame
      {...frame}
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
