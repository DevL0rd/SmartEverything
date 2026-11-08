import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DriveProgressNotice, DriveRoot, DriveStats } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { CardGrid } from '../../../components/card-grid';
import { ProgressBar } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { gridColumnsOf } from '../../../components/frame-layout';
import type { MenuItem } from '../../../components/menu';
import type { HeaderAction } from '../../../components/page-header';
import { Section } from '../../../components/section';
import { useFrameBodyWidth } from '../../../components/section-body';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { useIsOwner, useLoaded, useSyncStatus } from '../../../store/selectors';
import {
  useAnyDriveProgress,
  useDriveRoots,
  useDriveStats,
  useRootProgress,
  type PhaseProgress,
} from '../../nas/data';
import { DriveFrame } from '../components/drive-frame';
import { useDriveSyncSummary } from '../components/sync-pill';
import { ComputersStrip } from '../roots/computers-strip';
import { QuickRecentRow } from '../roots/quick-recent-row';
import { RootCard } from '../roots/root-card';
import { itemsTextOf, rootVolumeOf } from '../roots/root-card-model';
import { StatStrip } from '../roots/stat-strip';
import { addRootHref, rootSettingsHref } from '../settings/page-roots';

type Phase = DriveProgressNotice['phase'];

const ADD_LABEL = 'Add a folder or drive';

const PHASES: readonly Phase[] = ['scan', 'hash', 'scrub'];

const PHASE_WORD: Readonly<Record<Phase, string>> = {
  scan: 'Scanning',
  hash: 'Finding duplicates in',
  scrub: 'Checking for damage in',
};

const PLACEHOLDERS = ['a', 'b', 'c'] as const;

const COMPUTERS_KEY = 'computers';

type LibraryTile =
  { readonly kind: 'root'; readonly root: DriveRoot } | { readonly kind: 'computers' };

export interface RootGroups {
  readonly mine: readonly DriveRoot[];
  readonly library: readonly DriveRoot[];
}

export function rootGroupsOf(roots: readonly DriveRoot[]): RootGroups {
  return {
    mine: roots.filter((root) => root.scope === 'person'),
    library: roots.filter((root) => root.scope === 'home'),
  };
}

export function libraryTilesOf(library: readonly DriveRoot[]): readonly LibraryTile[] {
  return [...library.map((root) => ({ kind: 'root', root }) as const), { kind: COMPUTERS_KEY }];
}

export function myDriveSubtitleOf(roots: readonly DriveRoot[], sync: string | null): string {
  const files = roots.reduce((all, root) => all + root.items, 0);
  return joinParts([itemsTextOf(files), sync]);
}

export function phaseLineOf(root: DriveRoot, phase: Phase, progress: PhaseProgress): string {
  return `${PHASE_WORD[phase]} ${root.label} · ${count(progress.done)} of ${count(progress.total)}`;
}

function headerActionsOf(owner: boolean): readonly HeaderAction[] {
  return owner ? [{ icon: 'plus', label: ADD_LABEL, href: addRootHref() }] : [];
}

function PhaseRow({
  root,
  phase,
  progress,
}: {
  readonly root: DriveRoot;
  readonly phase: Phase;
  readonly progress: PhaseProgress;
}): ReactNode {
  const line = phaseLineOf(root, phase, progress);
  return (
    <View className="gap-1.5">
      <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
        {line}
      </Text>
      <ProgressBar
        progress={progress.total === 0 ? 0 : progress.done / progress.total}
        colour="info"
        label={line}
      />
    </View>
  );
}

function RootProgress({ root }: { readonly root: DriveRoot }): ReactNode {
  const progress = useRootProgress(root.id);
  if (progress === undefined) return null;
  return PHASES.map((phase) => {
    const shown = progress[phase];
    return shown === undefined ? null : (
      <PhaseRow key={phase} root={root} phase={phase} progress={shown} />
    );
  });
}

function ScanProgress({ roots }: { readonly roots: readonly DriveRoot[] }): ReactNode {
  if (!useAnyDriveProgress()) return null;
  return (
    <Card title="Working on your files" icon="refresh">
      {roots.map((root) => (
        <RootProgress key={root.id} root={root} />
      ))}
    </Card>
  );
}

function useRootMenu(owner: boolean): (root: DriveRoot) => readonly MenuItem[] {
  const router = useRouter();
  return (root) => [
    {
      label: 'Open',
      icon: 'folder',
      onPress: (): void => {
        router.push(href.driveRoot(root.id));
      },
    },
    ...(root.synced
      ? [
          {
            label: 'Sync settings',
            icon: 'folderSync',
            onPress: (): void => {
              router.push(href.driveSyncFolder(root.id));
            },
          } as const,
        ]
      : []),
    ...(owner && root.scope === 'home'
      ? [
          {
            label: 'Library folder settings',
            icon: 'settings',
            onPress: (): void => {
              router.push(rootSettingsHref(root.id));
            },
          } as const,
        ]
      : []),
  ];
}

function RootTile({
  root,
  stats,
  menu,
}: {
  readonly root: DriveRoot;
  readonly stats: DriveStats | undefined;
  readonly menu: readonly MenuItem[];
}): ReactNode {
  return (
    <RootCard
      root={root}
      volume={stats === undefined ? null : rootVolumeOf(stats.volumes, root.id)}
      kinds={[]}
      menu={menu}
    />
  );
}

function YourFiles({
  roots,
  stats,
  owner,
}: {
  readonly roots: readonly DriveRoot[];
  readonly stats: DriveStats | undefined;
  readonly owner: boolean;
}): ReactNode {
  const columns = gridColumnsOf(useFrameBodyWidth());
  const menuOf = useRootMenu(owner);
  if (roots.length === 0) return null;
  return (
    <Section title="Your files" caption="Only you see these">
      <CardGrid
        items={roots}
        columns={columns}
        keyOf={(root) => root.id}
        render={(root) => <RootTile root={root} stats={stats} menu={menuOf(root)} />}
      />
    </Section>
  );
}

function LibraryFolders({
  roots,
  stats,
  owner,
}: {
  readonly roots: readonly DriveRoot[];
  readonly stats: DriveStats | undefined;
  readonly owner: boolean;
}): ReactNode {
  const columns = gridColumnsOf(useFrameBodyWidth());
  const menuOf = useRootMenu(owner);
  if (roots.length === 0) return <ComputersStrip />;
  return (
    <Section title="Library folders" caption="Files stay where they are; the hub keeps the index">
      <CardGrid
        items={libraryTilesOf(roots)}
        columns={columns}
        keyOf={(item) => (item.kind === 'root' ? item.root.id : COMPUTERS_KEY)}
        render={(item) =>
          item.kind === 'root' ? (
            <RootTile root={item.root} stats={stats} menu={menuOf(item.root)} />
          ) : (
            <ComputersStrip />
          )
        }
      />
    </Section>
  );
}

function MyDriveSkeleton(): ReactNode {
  return (
    <View aria-busy className="gap-section-gap">
      <Skeleton shape="block" className="h-16" />
      <View className="flex-row gap-4">
        {PLACEHOLDERS.map((key) => (
          <Skeleton key={key} shape="tile" className="h-56 min-w-0 flex-1" />
        ))}
      </View>
    </View>
  );
}

function MyDriveEmpty({ owner }: { readonly owner: boolean }): ReactNode {
  if (!owner) {
    return (
      <EmptyState
        icon="folder"
        title="No folders shared with you yet"
        body="Folders the owner shares with the home and your own private files show here."
      />
    );
  }
  return (
    <EmptyState
      icon="folder"
      title="Bring your files home"
      body="Add a folder or a drive the hub can see. Drive keeps it indexed, searchable and in sync."
      action={<Button label={ADD_LABEL} icon="plus" href={addRootHref()} />}
    />
  );
}

function MyDriveBody({
  roots,
  owner,
}: {
  readonly roots: readonly DriveRoot[];
  readonly owner: boolean;
}): ReactNode {
  const stats = useDriveStats().data;
  const groups = rootGroupsOf(roots);
  return (
    <View className="gap-section-gap">
      <StatStrip roots={roots} />
      <ScanProgress roots={roots} />
      <QuickRecentRow />
      <YourFiles roots={groups.mine} stats={stats} owner={owner} />
      <LibraryFolders roots={groups.library} stats={stats} owner={owner} />
    </View>
  );
}

function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="The hub is offline"
      body="Drive shows what the hub said last. Your files are safe and update when it is back."
    />
  );
}

function Content({
  loaded,
  roots,
  owner,
}: {
  readonly loaded: boolean;
  readonly roots: readonly DriveRoot[];
  readonly owner: boolean;
}): ReactNode {
  if (!loaded) return <MyDriveSkeleton />;
  if (roots.length === 0) return <MyDriveEmpty owner={owner} />;
  return <MyDriveBody roots={roots} owner={owner} />;
}

export function MyDriveScreen(): ReactNode {
  const owner = useIsOwner();
  const loaded = useLoaded();
  const live = useSyncStatus().status === 'live';
  const roots = useDriveRoots();
  const sync = useDriveSyncSummary()?.line ?? null;
  return (
    <DriveFrame
      section="index"
      subtitle={myDriveSubtitleOf(roots, sync)}
      actions={headerActionsOf(owner)}
      banner={live ? null : <OfflineBanner />}
    >
      <Content loaded={loaded} roots={roots} owner={owner} />
    </DriveFrame>
  );
}
