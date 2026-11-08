import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { DriveRoot } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { removeDriveRoot, updateDriveRoot } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { SettingsFrame } from '../../../settings/settings-frame';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useIsOwner, useLoaded, useSyncStatus } from '../../../store/selectors';
import { useDriveHealth, useDriveRoots } from '../../nas/data';
import { PlacementSection } from '../placements/placement-section';
import { placementTargetOf } from '../sync/folder-computers';
import { SkipPatterns } from '../sync/skip-patterns';
import {
  MANAGED_NOTE,
  REMOVE_NOTE,
  REMOVE_ROOT,
  VIRTUAL_NOTE,
  removeRootConfirmed,
  rootAbilitiesOf,
  rootIdOf,
  rootSubtitleOf,
  type RootAbilities,
} from './root-model';
import { KeepRows, NameRows, SyncRow, WatchRow, useRootChange } from './root-rows';
import { DRIVE_SETTINGS_PAGE } from './sections';

const INDEX_SKIP_FOOTER =
  'Drive leaves matching files out of the library: they are not listed, searched or shown in Photos.';

function renameRequestOf(root: DriveRoot): TextEditRequest {
  return {
    id: `drive-root-name-${root.id}`,
    title: `Rename ${root.label}`,
    label: 'Name in Drive',
    initial: root.label,
    placeholder: 'Folder name',
    confirmLabel: 'Rename',
    maxLength: Number.POSITIVE_INFINITY,
    save: async (label): Promise<void> => {
      await updateDriveRoot(root.id, { label });
    },
  };
}

function leaveToLibrary(): void {
  router.replace(href.settings.page(DRIVE_SETTINGS_PAGE));
}

function RemoveBlock({ root }: { readonly root: DriveRoot }): ReactNode {
  const [busy, setBusy] = useState(false);
  const remove = (): void => {
    setBusy(true);
    background(
      removeRootConfirmed(root, { confirm, remove: removeDriveRoot, leave: leaveToLibrary })
        .catch(notifyFailure(`${root.label} is still in the library`))
        .finally(() => {
          setBusy(false);
        }),
      'drive.settings.root_remove_failed',
    );
  };
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3 border-t-hairline border-outline-variant px-4 pt-4">
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {REMOVE_NOTE}
      </Text>
      <Button
        label={REMOVE_ROOT}
        spoken={`${REMOVE_ROOT}: ${root.label}`}
        icon="trash"
        variant="destructive"
        loading={busy}
        disabled={busy}
        onPress={remove}
      />
    </View>
  );
}

function RootLine({ root }: { readonly root: DriveRoot }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="tabular px-4" numberOfLines={2}>
      {rootSubtitleOf(root)}
    </Text>
  );
}

function KeptNote({ root }: { readonly root: DriveRoot }): ReactNode {
  const note = root.path === null ? VIRTUAL_NOTE : root.kind === 'managed' ? MANAGED_NOTE : null;
  if (note === null) return null;
  return (
    <Text variant="footnote" tone="variant" className="px-4">
      {note}
    </Text>
  );
}

function ProblemLine({ problem }: { readonly problem: string | null }): ReactNode {
  if (problem === null) return null;
  return (
    <Text variant="footnote" tone="critical" className="px-4">
      {problem}
    </Text>
  );
}

function IndexRows({
  root,
  can,
}: {
  readonly root: DriveRoot;
  readonly can: RootAbilities;
}): ReactNode {
  const skips = useRootChange(root);
  const watcher = useDriveHealth().data?.watcher;
  return (
    <View className="gap-section-gap">
      <List title="Indexing">
        <WatchRow root={root} can={can} watcher={watcher} />
      </List>
      <SkipPatterns
        patterns={root.skipPatterns}
        footer={INDEX_SKIP_FOOTER}
        editable={can.change}
        busy={skips.busy}
        problem={skips.problem}
        onChange={(skipPatterns) => {
          skips.save({ skipPatterns }, 'The skip list was not saved');
        }}
      />
    </View>
  );
}

function RootBody({
  root,
  editable,
}: {
  readonly root: DriveRoot;
  readonly editable: boolean;
}): ReactNode {
  const can = rootAbilitiesOf(root, editable);
  const change = useRootChange(root);
  const [rename, setRename] = useState<TextEditRequest | null>(null);
  const openRename = (): void => {
    setRename(renameRequestOf(root));
  };
  return (
    <View className="gap-section-gap">
      <RootLine root={root} />
      <KeptNote root={root} />
      <View className="gap-1">
        <NameRows root={root} can={can} change={change} onRename={openRename} />
        <KeepRows root={root} can={can} change={change} />
        <ProblemLine problem={change.problem} />
      </View>
      <IndexRows root={root} can={can} />
      {can.placements ? <SyncRow root={root} /> : null}
      {can.placements ? <PlacementSection target={placementTargetOf(root)} /> : null}
      {can.remove ? <RemoveBlock root={root} /> : null}
      <TextEditSheet
        request={rename}
        onClose={() => {
          setRename(null);
        }}
      />
    </View>
  );
}

function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="The hub is offline"
      body="These settings show what the hub said last. They can be changed when it is back."
      wrapBody
    />
  );
}

function MemberBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Only the owner changes library folders"
      body="You can see how this folder is set up."
      wrapBody
    />
  );
}

function bannerOf(live: boolean, owner: boolean): ReactNode {
  if (!live) return <OfflineBanner />;
  return owner ? null : <MemberBanner />;
}

function RootSkeleton(): ReactNode {
  return (
    <View className="gap-section-gap">
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
      <Skeleton className="h-16" />
    </View>
  );
}

function Frame({
  title,
  banner = null,
  children,
}: {
  readonly title: string;
  readonly banner?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <SettingsFrame
      page={DRIVE_SETTINGS_PAGE}
      title={title}
      detail
      {...(banner === null ? {} : { banner })}
    >
      {children}
    </SettingsFrame>
  );
}

function NotFound(): ReactNode {
  return (
    <Frame title="Library folder">
      <EmptyState
        icon="folder"
        title="Folder not found"
        body="This folder is no longer in the library. The library folders are listed in Drive settings."
        action={
          <Button
            label="Open Drive settings"
            variant="tonal"
            href={href.settings.page(DRIVE_SETTINGS_PAGE)}
          />
        }
      />
    </Frame>
  );
}

export function RootDetailScreen(): ReactNode {
  const route = useLocalSearchParams<{ rootId?: string; page?: string[] }>();
  const rootId = rootIdOf(route);
  const loaded = useLoaded();
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const root = useDriveRoots().find((entry) => entry.id === rootId) ?? null;
  if (!loaded) {
    return (
      <Frame title="Library folder">
        <RootSkeleton />
      </Frame>
    );
  }
  if (root === null) return <NotFound />;
  const editable = owner && live;
  return (
    <Frame title={root.label} banner={bannerOf(live, owner)}>
      <RootBody root={root} editable={editable} />
    </Frame>
  );
}
