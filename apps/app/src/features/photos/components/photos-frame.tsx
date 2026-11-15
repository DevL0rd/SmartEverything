import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhotoInsightKind, PhotoInsights, PhotoRailCounts } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { mainPageSettings } from '../../../app-shell/main-pages';
import type { AppHref } from '../../../components/app-href';
import type { Crumb } from '../../../components/breadcrumbs';
import { SegmentBar, type BarSegment } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import type { MenuItem } from '../../../components/menu';
import type { PageSettingsLink } from '../../../components/page-menu';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { PageShell, type StandardShellProps } from '../../../components/page-shell/page-shell';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import type { RailEntry, RailGroup } from '../../../components/page-shell/section-rail';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { SummaryWell } from '../../../components/summary-well';
import { Text } from '../../../components/text';
import { isNative } from '../../../design/platform';
import { useAreaWidth, useSizeClass } from '../../../design/size-class';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { useLibraryRefresh } from '../../drive';
import { PAUSE_LABELS } from '../backup/model/conditions';
import { useBackupStatus, type BackupStatus } from '../backup/model/status';
import { usePhotoInsights, usePhotoRailCounts } from '../data';

export const PHOTOS_RAIL_HREF = {
  library: href.photos(),
  people: href.photosPage('people'),
  albums: href.photosPage('albums'),
  sharing: href.photosPage('sharing'),
  map: href.photosPage('map'),
  folders: href.photosPage('folders'),
  insights: href.photosPage('insights'),
  archive: href.photosPage('archive'),
  locked: href.photosPage('locked'),
  deleted: href.photosPage('deleted'),
} as const satisfies Readonly<Record<string, AppHref>>;

export const PHOTOS_BACKUP_SETTINGS_HREF: AppHref = href.settings.page('photos/backup');

export type PhotosRailId = keyof typeof PHOTOS_RAIL_HREF;

interface RailSpec {
  readonly label: string;
  readonly short?: string;
  readonly icon: IconName;
}

const SPEC: Readonly<Record<PhotosRailId, RailSpec>> = {
  library: { label: 'Library', icon: 'image' },
  people: { label: 'People and pets', short: 'People', icon: 'users' },
  albums: { label: 'Albums', icon: 'layers' },
  sharing: { label: 'Sharing', icon: 'share' },
  map: { label: 'Map and places', short: 'Places', icon: 'mapPin' },
  folders: { label: 'Folders', icon: 'folder' },
  insights: { label: 'Insights', icon: 'trendUp' },
  archive: { label: 'Archive', icon: 'archive' },
  locked: { label: 'Locked folder', short: 'Locked', icon: 'lock' },
  deleted: { label: 'Recently deleted', short: 'Deleted', icon: 'trash' },
};

const TOP: readonly PhotosRailId[] = ['library', 'people', 'albums', 'sharing', 'map'];

const MANAGE: readonly PhotosRailId[] = ['folders', 'archive', 'locked', 'insights', 'deleted'];

type Count = number | null;

type Amount = number | null | undefined;

function amountOf(value: Amount, one: string, many = `${one}s`): string | null {
  if (value === null || value === undefined || value === 0) return null;
  return `${count(value)} ${value === 1 ? one : many}`;
}

const NO_COUNT = (): Count => null;

type RailCounts = PhotoRailCounts | undefined;

const COUNT_OF: Readonly<Record<PhotosRailId, (counts: RailCounts) => Count>> = {
  library: (counts) => counts?.library ?? null,
  people: (counts) => counts?.people ?? null,
  albums: (counts) => counts?.albums ?? null,
  sharing: (counts) => counts?.sharing ?? null,
  map: (counts) => counts?.places ?? null,
  folders: NO_COUNT,
  insights: NO_COUNT,
  archive: (counts) => counts?.archive ?? null,
  locked: NO_COUNT,
  deleted: (counts) => counts?.deleted ?? null,
};

function countTextOf(value: Count): string | undefined {
  return value === null || value === 0 ? undefined : count(value);
}

function entryOf(id: PhotosRailId, counts: RailCounts): RailEntry {
  const spec = SPEC[id];
  return {
    id,
    label: spec.label,
    short: spec.short,
    icon: spec.icon,
    missing: null,
    count: countTextOf(COUNT_OF[id](counts)),
  };
}

export function photosRailGroups(counts: RailCounts): readonly RailGroup[] {
  return [
    { title: null, entries: TOP.map((id) => entryOf(id, counts)) },
    { title: 'Manage', entries: MANAGE.map((id) => entryOf(id, counts)) },
  ];
}

const HREFS: ReadonlyMap<string, AppHref> = new Map(Object.entries(PHOTOS_RAIL_HREF));

export function photosHrefOf(id: string): AppHref {
  const target = HREFS.get(id);
  if (target === undefined) throw new Error(`Photos has no section ${id}`);
  return target;
}

export function photosTitleOf(active: PhotosRailId): string {
  return SPEC[active].label;
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
      title="Library"
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

export interface PhotosFrameProps {
  readonly active: PhotosRailId;
  readonly title?: string;
  readonly subtitle?: string;
  readonly breadcrumbs?: readonly Crumb[];
  readonly actions?: readonly ShellAction[];
  readonly overflow?: readonly MenuItem[];
  readonly settings?: PageSettingsLink;
  readonly search?: ShellSearchConfig;
  readonly toolbar?: ReactNode;
  readonly selection?: ReactNode;
  readonly banner?: ReactNode;
  readonly footer?: ReactNode;
  readonly primaryAction?: PrimaryActionProps;
  readonly scroll?: boolean;
  readonly children: ReactNode;
}

interface PhotosFrameData {
  readonly counts: RailCounts;
  readonly compact: boolean;
  readonly summary: SummaryProps;
}

function usePhotosFrameData(): PhotosFrameData {
  const counts = usePhotoRailCounts().data;
  const insights = usePhotoInsights('all_time').data;
  const status = useBackupStatus();
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const phone = isNative();
  return {
    counts,
    compact,
    summary: {
      insights,
      items: counts?.library,
      lines: backupLinesOf(phone, status, counts?.backupDevices),
    },
  };
}

export function photosSectionsOf(
  active: PhotosRailId,
  counts: RailCounts,
  footer: ReactNode,
): ShellSections {
  return {
    label: 'Photos sections',
    active,
    hrefOf: photosHrefOf,
    groups: photosRailGroups(counts),
    footer,
  };
}

const NO_ACTIONS: readonly ShellAction[] = [];

function SelectionRow({ children }: { readonly children: ReactNode }): ReactNode {
  return <View testID="photos-selection">{children}</View>;
}

type FrameRest = Omit<PhotosFrameProps, 'active' | 'title'>;

function toolbarOf(frame: FrameRest): ReactNode {
  const selection = frame.selection ?? null;
  if (selection !== null) return <SelectionRow>{selection}</SelectionRow>;
  return frame.toolbar;
}

function headOf(frame: FrameRest): Partial<StandardShellProps> {
  const toolbar = toolbarOf(frame);
  return {
    ...(frame.subtitle === undefined ? {} : { subtitle: frame.subtitle }),
    ...(frame.breadcrumbs === undefined ? {} : { breadcrumbs: frame.breadcrumbs }),
    ...(frame.overflow === undefined || frame.overflow.length === 0
      ? {}
      : { overflow: frame.overflow }),
    ...(frame.search === undefined ? {} : { search: frame.search }),
    ...(toolbar === undefined || toolbar === null ? {} : { toolbar }),
  };
}

function restOf(frame: FrameRest): Partial<StandardShellProps> {
  const selecting = frame.selection !== undefined && frame.selection !== null;
  return {
    ...(frame.banner === undefined || frame.banner === null ? {} : { banner: frame.banner }),
    ...(frame.footer === undefined || frame.footer === null ? {} : { footer: frame.footer }),
    ...(frame.primaryAction === undefined || selecting
      ? {}
      : { primaryAction: frame.primaryAction }),
    ...(frame.scroll === undefined ? {} : { scroll: frame.scroll }),
  };
}

export function PhotosFrame({ active, title, ...frame }: PhotosFrameProps): ReactNode {
  const { counts, compact, summary } = usePhotosFrameData();
  const refresh = useLibraryRefresh(null);
  const desktop = useSizeClass().header === 'desktop';
  const switcher = !compact || frame.breadcrumbs === undefined;
  return (
    <PageShell
      title={title ?? photosTitleOf(active)}
      back={frame.breadcrumbs !== undefined && !desktop}
      settings={frame.settings ?? mainPageSettings('photos')}
      actions={frame.actions ?? NO_ACTIONS}
      {...(switcher
        ? {
            sections: photosSectionsOf(
              active,
              counts,
              compact ? <PullUpSummary {...summary} /> : <RailSummary {...summary} />,
            ),
          }
        : {})}
      onRefresh={refresh.refresh}
      refreshing={refresh.refreshing}
      {...headOf(frame)}
      {...restOf(frame)}
    >
      {frame.children}
    </PageShell>
  );
}
