import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { DriveRoot, DriveRootChange, DriveRootSync } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { updateDriveRoot } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { confirm, type ConfirmRequest } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { twoFrameColumnsAt } from '../../../components/frame-layout';
import { SelectRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useFrameBodyWidth } from '../../../components/section-body';
import type { SelectOption } from '../../../components/select-picker';
import { Text } from '../../../components/text';
import { bytes } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { useMutationState } from '../../../store/mutation';
import { useIsOwner, useLoaded, useSyncStatus } from '../../../store/selectors';
import { useDriveRoots } from '../../nas/data';
import { DriveFrame } from '../components/drive-frame';
import { itemsTextOf } from '../roots/root-card-model';
import { SyncStatusLine, useRootSyncLine } from '../roots/sync-status-line';
import { FolderComputers } from './folder-computers';
import { SkipPatterns } from './skip-patterns';
import { SyncSkeleton } from './sync-screen';

export interface FolderSettingsSlots {
  readonly thisComputer?: ReactNode;
}

export type ConflictChoice = 'both' | 'ask';

export const CONFLICT_OPTIONS: readonly SelectOption<ConflictChoice>[] = [
  { value: 'both', label: 'Keep both and tell me' },
  { value: 'ask', label: 'Ask me each time' },
];

export const STOP_SYNCING = 'Stop syncing';

export const STOP_NOTE = 'Stops the sync on every computer. Nothing is deleted.';

const MAIN_COLUMN = { flexGrow: 3, flexBasis: 0 } as const;
const SIDE_COLUMN = { flexGrow: 2, flexBasis: 0 } as const;

export function conflictChoiceOf(sync: DriveRootSync): ConflictChoice {
  return sync.conflictCopies ? 'both' : 'ask';
}

export function conflictLabelOf(sync: DriveRootSync): string {
  return sync.conflictCopies ? 'Keep both and tell me' : 'Ask me each time';
}

export function versionsNoteOf(root: DriveRoot): string {
  if (root.readOnly) return 'A view-only folder is never changed, so it keeps no versions.';
  return root.versions
    ? 'Each change keeps the earlier version for a year.'
    : 'Off for this folder. Earlier versions still age out over a year.';
}

export function folderSettingsSubtitleOf(root: DriveRoot): string {
  return joinParts([
    root.scope === 'home' ? 'Shared' : 'Yours',
    bytes(root.bytes),
    itemsTextOf(root.items),
  ]);
}

export function stopSyncingRequestOf(root: DriveRoot): ConfirmRequest {
  return {
    title: `Stop syncing ${root.label}?`,
    body: `${STOP_NOTE} The copies on each computer stay where they are.`,
    confirmLabel: STOP_SYNCING,
    tone: 'destructive',
  };
}

interface RootChange {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly save: (change: DriveRootChange, failure: string) => void;
}

function useRootChange(root: DriveRoot): RootChange {
  const mutation = useMutationState();
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    save: (change, failure): void => {
      mutation.run(() => updateDriveRoot(root.id, change), {
        failure,
        label: 'drive.sync.folder_settings',
        inline: true,
      });
    },
  };
}

function useStopSyncing(root: DriveRoot, change: RootChange): () => void {
  return () => {
    background(
      confirm(stopSyncingRequestOf(root)).then((yes) => {
        if (yes) change.save({ synced: false }, `${root.label} is still syncing`);
      }),
      'drive.sync.stop_failed',
    );
  };
}

interface RowsProps {
  readonly root: DriveRoot;
  readonly sync: DriveRootSync;
  readonly editable: boolean;
  readonly change: RootChange;
}

function ConflictRow({ sync, editable, change }: Omit<RowsProps, 'root'>): ReactNode {
  const title = 'When two computers change a file';
  if (!editable) return <ValueRow title={title} icon="merge" value={conflictLabelOf(sync)} />;
  return (
    <SelectRow
      title={title}
      icon="merge"
      options={CONFLICT_OPTIONS}
      value={conflictChoiceOf(sync)}
      disabled={change.busy}
      onChange={(choice) => {
        change.save({ conflictCopies: choice === 'both' }, 'The conflict choice was not saved');
      }}
    />
  );
}

function FolderRows({ root, sync, editable, change }: RowsProps): ReactNode {
  const locked = !editable || change.busy;
  const stop = useStopSyncing(root, change);
  return (
    <List title="Folder">
      <SwitchRow
        title="Keep in sync"
        subtitle="Computers below get every change"
        icon="folderSync"
        value
        disabled={locked}
        onChange={stop}
      />
      <SwitchRow
        title="Keep versions"
        subtitle={versionsNoteOf(root)}
        icon="history"
        value={root.versions}
        disabled={locked || root.readOnly}
        onChange={(versions) => {
          change.save({ versions }, 'The versions setting was not saved');
        }}
      />
      <ConflictRow sync={sync} editable={editable} change={change} />
      <SwitchRow
        title="Include hidden files"
        subtitle="Files and folders whose names start with a dot, everywhere in this library folder"
        icon="eye"
        value={root.includeHidden}
        disabled={locked}
        onChange={(includeHidden) => {
          change.save({ includeHidden }, 'The hidden files setting was not saved');
        }}
      />
    </List>
  );
}

function StopSyncing({
  root,
  change,
}: {
  readonly root: DriveRoot;
  readonly change: RootChange;
}): ReactNode {
  const stop = useStopSyncing(root, change);
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3 border-t-hairline border-outline-variant px-4 pt-4">
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {STOP_NOTE}
      </Text>
      <Button
        label={STOP_SYNCING}
        spoken={`${STOP_SYNCING} ${root.label}`}
        variant="destructive"
        disabled={change.busy}
        onPress={stop}
      />
    </View>
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

function SyncLineBlock({ root }: { readonly root: DriveRoot }): ReactNode {
  const line = useRootSyncLine(root);
  return line === null ? null : <SyncStatusLine line={line} />;
}

function SettingsColumn({ root, sync, editable }: Omit<RowsProps, 'change'>): ReactNode {
  const change = useRootChange(root);
  const skips = useRootChange(root);
  return (
    <View className="gap-section-gap">
      <SyncLineBlock root={root} />
      <View className="gap-1">
        <FolderRows root={root} sync={sync} editable={editable} change={change} />
        <ProblemLine problem={change.problem} />
      </View>
      <SkipPatterns
        patterns={sync.ignorePatterns}
        editable={editable}
        busy={skips.busy}
        problem={skips.problem}
        footer="Matching files stay on the hub and are not copied to the computers below."
        onChange={(ignorePatterns) => {
          skips.save({ ignorePatterns }, 'The skip list was not saved');
        }}
      />
      <FolderComputers root={root} />
      {editable ? <StopSyncing root={root} change={change} /> : null}
    </View>
  );
}

function Columns({
  main,
  side,
}: {
  readonly main: ReactNode;
  readonly side: ReactNode;
}): ReactNode {
  const wide = twoFrameColumnsAt(useFrameBodyWidth());
  if (side === undefined) return <View className="max-w-reading">{main}</View>;
  if (!wide) {
    return (
      <View className="gap-section-gap">
        {main}
        {side}
      </View>
    );
  }
  return (
    <View className="flex-row items-start gap-4">
      <View style={MAIN_COLUMN} className="min-w-0">
        {main}
      </View>
      <View style={SIDE_COLUMN} className="min-w-0 gap-4">
        {side}
      </View>
    </View>
  );
}

export function notSyncedBodyOf(root: DriveRoot, editable: boolean): string {
  if (root.path === null) {
    return 'This library folder lives inside SmartEverything, so it cannot be synced to computers.';
  }
  return editable
    ? 'Sync it and each computer with the Desktop app can keep a copy that the hub keeps in step.'
    : 'The owner of the home can sync this library folder to computers.';
}

function NotSynced({
  root,
  editable,
}: {
  readonly root: DriveRoot;
  readonly editable: boolean;
}): ReactNode {
  const change = useRootChange(root);
  const syncable = root.path !== null;
  const body = notSyncedBodyOf(root, editable);
  return (
    <View className="gap-2">
      <EmptyState
        icon="folderSync"
        title={`${root.label} is not synced`}
        body={body}
        {...(syncable && editable
          ? {
              action: (
                <Button
                  label="Make this folder synced"
                  icon="folderSync"
                  loading={change.busy}
                  disabled={change.busy}
                  onPress={() => {
                    change.save({ synced: true }, `${root.label} was not synced`);
                  }}
                />
              ),
            }
          : {})}
      />
      <ProblemLine problem={change.problem} />
    </View>
  );
}

function FolderBody({
  root,
  slots,
}: {
  readonly root: DriveRoot;
  readonly slots: FolderSettingsSlots;
}): ReactNode {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  const editable = owner && live;
  if (!root.synced) return <NotSynced root={root} editable={editable} />;
  return (
    <Columns
      main={<SettingsColumn root={root} sync={root.sync} editable={editable} />}
      side={slots.thisComputer}
    />
  );
}

function OfflineBanner(): ReactNode {
  const live = useSyncStatus().status === 'live';
  if (live) return null;
  return (
    <Banner
      tone="info"
      title="The hub is offline"
      body="These settings show what the hub said last. They can be changed when it is back."
    />
  );
}

function NotFound(): ReactNode {
  return (
    <DriveFrame section="sync" title="Synced folder">
      <EmptyState
        icon="folderSync"
        title="Folder not found"
        body="This library folder is no longer in Drive. The synced folders are listed on Sync."
        action={<Button label="Open Sync" variant="tonal" href={href.drivePage('sync')} />}
      />
    </DriveFrame>
  );
}

export function FolderSettingsScreen({
  slots = {},
}: {
  readonly slots?: FolderSettingsSlots;
}): ReactNode {
  const { rootId } = useLocalSearchParams<{ rootId: string }>();
  const loaded = useLoaded();
  const root = useDriveRoots().find((entry) => entry.id === rootId) ?? null;
  if (!loaded) {
    return (
      <DriveFrame section="sync" title="Synced folder">
        <SyncSkeleton />
      </DriveFrame>
    );
  }
  if (root === null) return <NotFound />;
  return (
    <DriveFrame
      section="sync"
      title={root.label}
      subtitle={folderSettingsSubtitleOf(root)}
      breadcrumbs={[{ label: 'Sync', href: href.drivePage('sync') }, { label: root.label }]}
      banner={<OfflineBanner />}
    >
      <FolderBody root={root} slots={slots} />
    </DriveFrame>
  );
}
