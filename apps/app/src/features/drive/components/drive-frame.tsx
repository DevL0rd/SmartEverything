import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SMART_RULE_ITEM_KINDS } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { SegmentBar, type BarSegment } from '../../../components/charts';
import type { IconName } from '../../../components/icon';
import { NavRow } from '../../../components/rows';
import type { FrameWidth } from '../../../components/section-body';
import { TabsBar, type TabItem } from '../../../components/tabs-bar';
import { Text } from '../../../components/text';
import { atLeast, useAreaWidth, useSizeClass } from '../../../design/size-class';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { useDriveAlbums, useDriveRoots, useDriveStats, useDriveSyncClients } from '../../nas/data';
import { LibraryFrame, SummaryWell, type LibrarySectionGroup } from '../../nas/frame';
import { libraryLayoutOf } from '../../nas/frame/sections';
import type { DriveSection } from '../model/section-routes';
import { DriveHeaderStatus, useDriveHeader, type DriveHeaderProps } from './drive-header';
import { SyncWell, useDriveSyncSummary } from './sync-pill';

export interface DriveFrameProps extends DriveHeaderProps {
  readonly iconRail?: boolean;
  readonly banner?: ReactNode;
  readonly reconcileRootId?: string | null;
  readonly width?: FrameWidth;
  readonly scroll?: boolean;
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

export type DriveRailDetails = Readonly<Partial<Record<DriveSection, string>>>;

export const DRIVE_SECTION_GROUPS: readonly GroupDef[] = [
  {
    title: null,
    sections: [
      { id: 'index', label: 'My Drive', icon: 'hardDrive' },
      { id: 'recent', label: 'Recent', icon: 'history' },
      { id: 'starred', label: 'Starred', icon: 'star' },
      { id: 'shared', label: 'Shared', icon: 'users' },
      { id: 'activity', label: 'Activity', icon: 'activity' },
    ],
  },
  {
    title: 'Computers',
    sections: [
      { id: 'sync', label: 'Sync', icon: 'folderSync' },
      { id: 'computers', label: 'Computers', icon: 'laptop' },
    ],
  },
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

type ItemKind = (typeof SMART_RULE_ITEM_KINDS)[number];

const KIND_COLOUR: Readonly<Record<ItemKind, ColourRole>> = {
  image: 'viz-1',
  video: 'viz-3',
  document: 'viz-6',
  audio: 'viz-4',
  other: 'track',
};

const KIND_LABEL: Readonly<Record<ItemKind, string>> = {
  image: 'Images',
  video: 'Videos',
  document: 'Documents',
  audio: 'Audio',
  other: 'Other',
};

type Roots = ReturnType<typeof useDriveRoots>;

function volumesOf(roots: Roots): number {
  return new Set(
    roots.flatMap((root) =>
      'volume' in root && root.volume !== null ? [root.volume.mountId] : [],
    ),
  ).size;
}

export interface RailInputs {
  readonly roots: Roots;
  readonly smartFolders: number;
  readonly computers: number;
  readonly sync: string | null;
}

export function driveRailDetailsOf(inputs: RailInputs): DriveRailDetails {
  const { roots, smartFolders, computers, sync } = inputs;
  const files = roots.reduce((all, root) => all + root.items, 0);
  const used = roots.reduce((all, root) => all + root.bytes, 0);
  const volumes = volumesOf(roots);
  return {
    ...(roots.length === 0 ? {} : { index: `${count(files)} ${files === 1 ? 'file' : 'files'}` }),
    ...(smartFolders === 0 ? {} : { starred: plural(smartFolders, 'smart folder') }),
    ...(sync === null ? {} : { sync }),
    ...(computers === 0 ? {} : { computers: plural(computers, 'computer') }),
    ...(roots.length === 0
      ? {}
      : {
          storage: joinParts([
            `${bytes(used)} used`,
            volumes === 0 ? null : plural(volumes, 'volume'),
          ]),
        }),
  };
}

function useRailDetails(): DriveRailDetails {
  const roots = useDriveRoots();
  const smartFolders = useDriveAlbums('drive').filter((album) => album.kind === 'smart').length;
  const clients = useDriveSyncClients();
  const sync = useDriveSyncSummary()?.line ?? null;
  const computers = new Set(clients.map((client) => client.deviceId)).size;
  return driveRailDetailsOf({ roots, smartFolders, computers, sync });
}

function DetailText({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
      {text}
    </Text>
  );
}

export function driveSectionGroupsOf(details: DriveRailDetails): readonly LibrarySectionGroup[] {
  return DRIVE_SECTION_GROUPS.map((group) => ({
    title: group.title,
    sections: group.sections.map((def) => {
      const detail = details[def.id];
      return {
        id: def.id,
        label: def.label,
        icon: def.icon,
        count: null,
        ...(detail === undefined ? {} : { detail: <DetailText text={detail} /> }),
      };
    }),
  }));
}

type Stats = NonNullable<ReturnType<typeof useDriveStats>['data']>;

export interface StorageSummary {
  readonly used: string;
  readonly caption: string | null;
  readonly total: number | undefined;
  readonly segments: readonly BarSegment[];
}

export function storageSummaryOf(stats: Stats): StorageSummary {
  const total = stats.volumes.reduce((all, volume) => all + volume.totalBytes, 0);
  const free = stats.volumes.reduce((all, volume) => all + volume.freeBytes, 0);
  const segments = stats.kinds.map((kind) => ({
    label: KIND_LABEL[kind.kind],
    value: kind.bytes,
    colour: KIND_COLOUR[kind.kind],
  }));
  if (stats.volumes.length === 0) {
    return { used: `${bytes(stats.bytes)} used`, caption: null, total: undefined, segments };
  }
  return {
    used: `${bytes(stats.bytes)} of ${bytes(total)}`,
    caption: `${plural(stats.volumes.length, 'volume')} · ${bytes(free)} free`,
    total,
    segments,
  };
}

function StorageWell({ stats }: { readonly stats: Stats }): ReactNode {
  const summary = storageSummaryOf(stats);
  return (
    <SummaryWell
      title="Storage"
      trailing={
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {summary.used}
        </Text>
      }
    >
      <SegmentBar
        segments={summary.segments}
        label="Storage by kind"
        size="thin"
        format={bytes}
        {...(summary.total === undefined ? {} : { total: summary.total })}
      />
      {summary.caption === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {summary.caption}
        </Text>
      )}
    </SummaryWell>
  );
}

function RailStorageWell(): ReactNode {
  const stats = useDriveStats().data;
  return stats === undefined ? null : <StorageWell stats={stats} />;
}

function PullUpWells(): ReactNode {
  const sync = useDriveSyncSummary();
  const stats = useDriveStats().data;
  if (sync === null && stats === undefined) return null;
  return (
    <View className="flex-row gap-2">
      {sync === null ? null : (
        <View className="min-w-0 flex-1">
          <SyncWell summary={sync} />
        </View>
      )}
      {stats === undefined ? null : (
        <View className="min-w-0 flex-1">
          <StorageWell stats={stats} />
        </View>
      )}
    </View>
  );
}

function PullUpFooter({
  settings,
  close,
}: {
  readonly settings: AppHref;
  readonly close: () => void;
}): ReactNode {
  return (
    <View className="gap-2 pt-2">
      <PullUpWells />
      <NavRow title="Drive settings" icon="settings" href={settings} onPress={close} />
    </View>
  );
}

const CHIP_ITEMS: readonly TabItem[] = SECTION_DEFS.map((def) => ({
  key: def.id,
  label: def.label,
  href: driveSectionHref(def.id),
}));

function useIconRail(asked: boolean | undefined): boolean {
  const wide = atLeast(useSizeClass().width, 'large');
  return asked === true || !wide;
}

export function DriveFrame(frame: DriveFrameProps): ReactNode {
  const header = useDriveHeader(frame);
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const iconRail = useIconRail(frame.iconRail);
  const sections = driveSectionGroupsOf(useRailDetails());
  return (
    <DriveHeaderStatus pill={!compact}>
      <LibraryFrame
        area="drive"
        {...header}
        sections={sections}
        active={frame.section}
        hrefOf={driveSectionHref}
        iconRail={iconRail}
        {...(compact ? {} : { summary: <RailStorageWell /> })}
        renderPullUpFooter={(close) => (
          <PullUpFooter settings={header.settings.href} close={close} />
        )}
        chips={<TabsBar items={CHIP_ITEMS} active={frame.section} label="Drive sections" />}
        {...(frame.banner === undefined ? {} : { banner: frame.banner })}
        {...(frame.reconcileRootId === undefined ? {} : { reconcileRootId: frame.reconcileRootId })}
        {...(frame.width === undefined ? {} : { width: frame.width })}
        {...(frame.scroll === undefined ? {} : { scroll: frame.scroll })}
      >
        {frame.children}
      </LibraryFrame>
    </DriveHeaderStatus>
  );
}
