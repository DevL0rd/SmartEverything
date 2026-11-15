import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRoot, DriveStats } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { ProgressBar, SegmentBar, type BarSegment } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import type { RailGroup } from '../../../components/page-shell/section-rail';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count } from '../../../format/number';
import { plural } from '../../../format/text';
import {
  flattenPages,
  useDriveAlbums,
  useDriveGrantRows,
  useDrivePlacementRows,
  useDriveUsage,
  useDriveStats,
  useDriveTrash,
  useLibraryRefresh,
  useMyDrive,
  useSharedDrive,
  useUnreadDriveNotifications,
  useViewerId,
} from '../data';
import { SummaryWell } from '../../../components/library-frame';
import { kindSegmentsOf } from '../model/item-kinds';
import type { DriveSection } from '../model/section-routes';
import { DriveHeaderStatus, useDriveHeader, type DriveHeaderProps } from './drive-header';
import {
  SyncLine,
  isFailedPlacement,
  useDriveSyncSummary,
  useOpenConflicts,
  type DriveSyncSummary,
} from './sync-pill';

export interface DriveFrameProps extends DriveHeaderProps {
  readonly iconRail?: boolean;
  readonly banner?: ReactNode;
  readonly reconcileRootId?: string | null;
  readonly scroll?: boolean;
  readonly search?: ShellSearchConfig;
  readonly children: ReactNode;
}

interface SectionDef {
  readonly id: DriveSection;
  readonly label: string;
  readonly icon: IconName;
}

interface GroupDef {
  readonly title: string | null;
  readonly sections: readonly SectionDef[];
}

export const DRIVE_SECTION_GROUPS: readonly GroupDef[] = [
  {
    title: null,
    sections: [
      { id: 'index', label: 'My Drive', icon: 'hardDrive' },
      { id: 'shared-drive', label: 'Shared Drive', icon: 'users' },
      { id: 'shared', label: 'Shared with me', icon: 'share' },
      { id: 'priority', label: 'Priority', icon: 'sparkles' },
      { id: 'recent', label: 'Recent', icon: 'history' },
      { id: 'starred', label: 'Starred', icon: 'star' },
    ],
  },
  {
    title: 'Activity',
    sections: [
      { id: 'notifications', label: 'Notifications', icon: 'bell' },
      { id: 'activity', label: 'Activity', icon: 'activity' },
    ],
  },
  { title: 'Computers', sections: [{ id: 'computers', label: 'Computers', icon: 'laptop' }] },
  {
    title: 'Space',
    sections: [
      { id: 'storage', label: 'Storage', icon: 'chartPie' },
      { id: 'trash', label: 'Trash', icon: 'trash' },
    ],
  },
];

const SECTION_DEFS: readonly SectionDef[] = DRIVE_SECTION_GROUPS.flatMap((group) => group.sections);

const PHONE_TABS: readonly DriveSection[] = [
  'index',
  'shared-drive',
  'shared',
  'recent',
  'starred',
];

const SECTION_HREF: ReadonlyMap<string, AppHref> = new Map(
  SECTION_DEFS.map((def) => [def.id, def.id === 'index' ? href.drive() : href.drivePage(def.id)]),
);

class UnknownDriveSectionError extends Error {
  override readonly name = 'UnknownDriveSectionError';
}

export function driveSectionHref(id: string): AppHref {
  const target = SECTION_HREF.get(id);
  if (target === undefined) throw new UnknownDriveSectionError(`There is no Drive section ${id}.`);
  return target;
}

export interface CountUpTo {
  readonly count: number;
  readonly more: boolean;
}

export interface DriveSpace {
  readonly used: number;
  readonly quota: number | null;
  readonly disk: number | null;
}

export interface RailInputs {
  readonly myDrive: DriveRoot | null;
  readonly sharedDrive: DriveRoot | null;
  readonly smartFolders: number;
  readonly sharedWithMe: number;
  readonly unread: number;
  readonly computerProblems: number;
  readonly trash: CountUpTo;
  readonly sync: string | null;
}

export interface DriveRailEntry {
  readonly count: number | string | null;
  readonly detail: string | null;
}

export type DriveRail = Readonly<Partial<Record<DriveSection, DriveRailEntry>>>;

function filesText(root: DriveRoot | null): string | null {
  return root === null ? null : `${count(root.items)} ${root.items === 1 ? 'file' : 'files'}`;
}

function badgeOf(value: number): number | null {
  return value === 0 ? null : value;
}

function trashBadgeOf(trash: CountUpTo): number | string | null {
  if (trash.count === 0) return null;
  return trash.more ? `${count(trash.count)}+` : trash.count;
}

export function driveRailOf(inputs: RailInputs): DriveRail {
  return {
    index: { count: null, detail: filesText(inputs.myDrive) },
    'shared-drive': { count: null, detail: filesText(inputs.sharedDrive) },
    shared: { count: badgeOf(inputs.sharedWithMe), detail: null },
    notifications: { count: badgeOf(inputs.unread), detail: null },
    starred: {
      count: null,
      detail: inputs.smartFolders === 0 ? null : plural(inputs.smartFolders, 'smart folder'),
    },
    computers: { count: badgeOf(inputs.computerProblems), detail: inputs.sync },
    trash: { count: trashBadgeOf(inputs.trash), detail: null },
  };
}

export interface SpaceMeter {
  readonly text: string;
  readonly share: number | null;
  readonly colour: ColourRole;
}

export function spaceMeterOf(space: DriveSpace): SpaceMeter {
  const total = space.quota ?? space.disk;
  const share = total === null || total === 0 ? null : Math.min(1, space.used / total);
  const text =
    space.quota === null
      ? `${bytes(space.used)} · no limit`
      : `${bytes(space.used)} of ${bytes(space.quota)}`;
  return { text, share, colour: share !== null && share >= 1 ? 'critical' : 'primary' };
}

function DetailText({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
      {text}
    </Text>
  );
}

function SpaceDetail({ meter }: { readonly meter: SpaceMeter }): ReactNode {
  return (
    <View className="gap-1 pt-1">
      {meter.share === null ? null : (
        <ProgressBar progress={meter.share} colour={meter.colour} label="Your drive" />
      )}
      <DetailText text={meter.text} />
    </View>
  );
}

function detailOf(
  id: DriveSection,
  text: string | null,
  space: SpaceMeter | null,
): ReactNode | undefined {
  if (id === 'storage' && space !== null) return <SpaceDetail meter={space} />;
  return text === null ? undefined : <DetailText text={text} />;
}

function countTextOf(value: number | string | null): string | undefined {
  if (value === null) return undefined;
  return typeof value === 'number' ? count(value) : value;
}

export function driveSectionGroupsOf(
  rail: DriveRail,
  space: SpaceMeter | null,
): readonly RailGroup[] {
  return DRIVE_SECTION_GROUPS.map((group) => ({
    title: group.title,
    entries: group.sections.map((def) => {
      const entry = rail[def.id];
      return {
        id: def.id,
        label: def.label,
        icon: def.icon,
        missing: null,
        detail: detailOf(def.id, entry?.detail ?? null, space) ?? null,
        count: countTextOf(entry?.count ?? null),
      };
    }),
  }));
}

function useTrashCount(): CountUpTo {
  const trash = useDriveTrash(null);
  return { count: flattenPages(trash.data, (page) => page.items).length, more: trash.hasNextPage };
}

function useComputerProblems(): number {
  const failed = useDrivePlacementRows().filter(
    (placement) => placement.enabled && isFailedPlacement(placement),
  ).length;
  return failed + useOpenConflicts().open;
}

function useSpace(myDrive: DriveRoot | null, stats: DriveStats | undefined): SpaceMeter | null {
  const viewerId = useViewerId();
  const own = useDriveUsage().data?.find((row) => row.profileId === viewerId);
  if (myDrive === null) return null;
  return spaceMeterOf({
    used: myDrive.bytes,
    quota: own?.quota ?? null,
    disk: stats?.space.totalBytes ?? null,
  });
}

function useRailGroups(stats: DriveStats | undefined): readonly RailGroup[] {
  const viewerId = useViewerId();
  const myDrive = useMyDrive();
  const rail = driveRailOf({
    myDrive,
    sharedDrive: useSharedDrive(),
    smartFolders: useDriveAlbums('drive').filter((album) => album.kind === 'smart').length,
    sharedWithMe: useDriveGrantRows().filter((grant) => grant.profileId === viewerId).length,
    unread: useUnreadDriveNotifications(),
    computerProblems: useComputerProblems(),
    trash: useTrashCount(),
    sync: useDriveSyncSummary()?.line ?? null,
  });
  return driveSectionGroupsOf(rail, useSpace(myDrive, stats));
}

export interface StorageSummary {
  readonly used: string;
  readonly caption: string;
  readonly total: number;
  readonly segments: readonly BarSegment[];
}

export function storageSummaryOf(stats: DriveStats): StorageSummary {
  return {
    used: `${bytes(stats.bytes)} of ${bytes(stats.space.totalBytes)}`,
    caption: `${bytes(stats.space.freeBytes)} free on the data disk`,
    total: stats.space.totalBytes,
    segments: kindSegmentsOf(stats.kinds),
  };
}

function DrivesWell({
  stats,
  sync,
}: {
  readonly stats: DriveStats | undefined;
  readonly sync: DriveSyncSummary | null;
}): ReactNode {
  if (stats === undefined && sync === null) return null;
  const summary = stats === undefined ? null : storageSummaryOf(stats);
  return (
    <SummaryWell
      title="Your drives"
      {...(summary === null ? {} : { trailing: <DetailText text={summary.used} /> })}
    >
      {summary === null ? null : (
        <>
          <SegmentBar
            segments={summary.segments}
            label="Your drives by kind"
            size="thin"
            format={bytes}
            total={summary.total}
          />
          <DetailText text={summary.caption} />
        </>
      )}
      {sync === null ? null : <SyncLine summary={sync} />}
    </SummaryWell>
  );
}

function DrivesFooter({ stats }: { readonly stats: DriveStats | undefined }): ReactNode {
  return (
    <View className="pt-2">
      <DrivesWell stats={stats} sync={useDriveSyncSummary()} />
    </View>
  );
}

export function driveSectionsOf(
  active: DriveSection,
  groups: readonly RailGroup[],
  footer: ReactNode,
  iconRail: boolean,
): ShellSections {
  return {
    label: 'Drive sections',
    active,
    hrefOf: driveSectionHref,
    phoneTabs: PHONE_TABS,
    groups,
    footer,
    ...(iconRail ? { iconRail } : {}),
  };
}

export function frameActionsOf(
  phone: boolean,
  actions: readonly ShellAction[],
  refresh: () => void,
): readonly ShellAction[] {
  return phone
    ? actions
    : [...actions, { icon: 'refresh', label: 'Refresh', iconOnly: true, onPress: refresh }];
}

export function DriveFrame(frame: DriveFrameProps): ReactNode {
  const header = useDriveHeader(frame);
  const phone = useSizeClass().header === 'large';
  const stats = useDriveStats().data;
  const groups = useRailGroups(stats);
  const refresh = useLibraryRefresh(frame.reconcileRootId ?? null);
  return (
    <DriveHeaderStatus pill={!phone}>
      <PageShell
        {...header}
        back={false}
        actions={frameActionsOf(phone, header.actions, refresh.refresh)}
        sections={driveSectionsOf(
          frame.section,
          groups,
          <DrivesFooter stats={stats} />,
          frame.iconRail === true,
        )}
        onRefresh={refresh.refresh}
        refreshing={refresh.refreshing}
        {...(frame.banner === undefined ? {} : { banner: frame.banner })}
        {...(frame.scroll === undefined ? {} : { scroll: frame.scroll })}
        {...(frame.search === undefined ? {} : { search: frame.search })}
      >
        {frame.children}
      </PageShell>
    </DriveHeaderStatus>
  );
}
