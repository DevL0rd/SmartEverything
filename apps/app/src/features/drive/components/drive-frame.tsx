import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveRoot, DriveStats } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { ProgressBar, SegmentBar, type BarSegment } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import type { MenuItem } from '../../../components/menu';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import type { RailGroup } from '../../../components/page-shell/section-rail';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count } from '../../../format/number';
import {
  flattenPages,
  useDriveGrantRows,
  useDrivePlacementRows,
  useDriveUsage,
  useDriveStats,
  useDriveTrash,
  useLibraryRefresh,
  useMyDrive,
  useUnreadDriveNotifications,
  useViewerId,
} from '../data';
import { SummaryWell } from '../../../components/summary-well';
import { driveUseOf } from '../home/use-drive-use';
import { kindSegmentsOf } from '../model/item-kinds';
import type { DriveSection } from '../model/section-routes';
import {
  DriveHeaderStatus,
  useDriveHeader,
  useSyncPillShown,
  type DriveHeaderProps,
} from './drive-header';
import {
  SyncLine,
  isFailedPlacement,
  useDriveSyncSummary,
  useOpenConflicts,
  type DriveSyncSummary,
} from './sync-pill';

export interface DriveFrameProps extends DriveHeaderProps {
  readonly iconRail?: boolean;
  readonly back?: boolean;
  readonly banner?: ReactNode;
  readonly reconcileRootId?: string | null;
  readonly scroll?: boolean;
  readonly search?: ShellSearchConfig;
  readonly overflow?: readonly MenuItem[];
  readonly controls?: ReactNode;
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
      { id: 'shared', label: 'Shared', icon: 'share' },
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
  readonly sharedWithMe: number;
  readonly unread: number;
  readonly computerProblems: number;
  readonly trash: CountUpTo;
}

export type DriveRail = Readonly<Partial<Record<DriveSection, number | string | null>>>;

function badgeOf(value: number): number | null {
  return value === 0 ? null : value;
}

function trashBadgeOf(trash: CountUpTo): number | string | null {
  if (trash.count === 0) return null;
  return trash.more ? `${count(trash.count)}+` : trash.count;
}

export function driveRailOf(inputs: RailInputs): DriveRail {
  return {
    shared: badgeOf(inputs.sharedWithMe),
    notifications: badgeOf(inputs.unread),
    computers: badgeOf(inputs.computerProblems),
    trash: trashBadgeOf(inputs.trash),
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

function SpaceLine({ meter }: { readonly meter: SpaceMeter }): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="caption" tone="variant" numberOfLines={1}>
          Your drive
        </Text>
        <DetailText text={meter.text} />
      </View>
      {meter.share === null ? null : (
        <ProgressBar progress={meter.share} colour={meter.colour} label="Your drive" />
      )}
    </View>
  );
}

function countTextOf(value: number | string | null): string | undefined {
  if (value === null) return undefined;
  return typeof value === 'number' ? count(value) : value;
}

export function driveSectionGroupsOf(rail: DriveRail): readonly RailGroup[] {
  return DRIVE_SECTION_GROUPS.map((group) => ({
    title: group.title,
    entries: group.sections.map((def) => ({
      id: def.id,
      label: def.label,
      icon: def.icon,
      missing: null,
      count: countTextOf(rail[def.id] ?? null),
    })),
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
  const usage = useDriveUsage().data;
  if (myDrive === null) return null;
  const use = driveUseOf({ root: myDrive, viewerId, usage });
  if (use.quota.kind === 'unknown') return null;
  return spaceMeterOf({
    used: use.used,
    quota: use.quota.kind === 'limit' ? use.quota.bytes : null,
    disk: stats?.space.totalBytes ?? null,
  });
}

function useRailGroups(): readonly RailGroup[] {
  const viewerId = useViewerId();
  const rail = driveRailOf({
    sharedWithMe: useDriveGrantRows().filter((grant) => grant.profileId === viewerId).length,
    unread: useUnreadDriveNotifications(),
    computerProblems: useComputerProblems(),
    trash: useTrashCount(),
  });
  return driveSectionGroupsOf(rail);
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
  space,
  sync,
}: {
  readonly stats: DriveStats | undefined;
  readonly space: SpaceMeter | null;
  readonly sync: DriveSyncSummary | null;
}): ReactNode {
  if (stats === undefined && space === null && sync === null) return null;
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
      {space === null ? null : <SpaceLine meter={space} />}
      {sync === null ? null : <SyncLine summary={sync} />}
    </SummaryWell>
  );
}

function DrivesFooter({ stats }: { readonly stats: DriveStats | undefined }): ReactNode {
  const space = useSpace(useMyDrive(), stats);
  const sync = useDriveSyncSummary();
  const pill = useSyncPillShown();
  return (
    <View className="pt-2">
      <DrivesWell stats={stats} space={space} sync={pill ? null : sync} />
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
    groups,
    footer,
    ...(iconRail ? { iconRail } : {}),
  };
}

export function DriveFrame(frame: DriveFrameProps): ReactNode {
  const header = useDriveHeader(frame);
  const pill = useSyncPillShown();
  const stats = useDriveStats().data;
  const groups = useRailGroups();
  const refresh = useLibraryRefresh(frame.reconcileRootId ?? null);
  return (
    <DriveHeaderStatus pill={pill}>
      <PageShell
        {...header}
        back={frame.back === true}
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
        {...(frame.overflow === undefined ? {} : { overflow: frame.overflow })}
        {...(frame.controls === undefined ? {} : { controls: frame.controls })}
      >
        {frame.children}
      </PageShell>
    </DriveHeaderStatus>
  );
}
