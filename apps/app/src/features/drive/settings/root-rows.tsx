import type { ReactNode } from 'react';
import type { DriveRoot, DriveRootChange, DriveWatcherState } from '@smarteverything/domain';
import { scanDriveRoot, updateDriveRoot } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { NavRow, SelectRow, SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { versionsNoteOf } from '../sync/folder-settings-screen';
import {
  ROOT_ACCESS_OPTIONS,
  accessChangeOf,
  accessNoteOf,
  rootAccessOf,
  rootWatchLineOf,
  syncValueOf,
  whoSeesOf,
  type RootAbilities,
} from './root-model';

export interface RootChange {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly save: (change: DriveRootChange, failure: string) => void;
}

export function useRootChange(root: DriveRoot): RootChange {
  const mutation = useMutationState();
  return {
    busy: mutation.busy,
    problem: mutation.problem,
    save: (change, failure): void => {
      mutation.run(() => updateDriveRoot(root.id, change), {
        failure,
        label: 'drive.settings.root_change',
        inline: true,
      });
    },
  };
}

interface RowsProps {
  readonly root: DriveRoot;
  readonly can: RootAbilities;
  readonly change: RootChange;
}

function AccessRow({ root, can, change }: RowsProps): ReactNode {
  const title = 'Who can use it';
  if (!can.access) {
    const option = ROOT_ACCESS_OPTIONS.find((entry) => entry.value === rootAccessOf(root));
    return (
      <ValueRow
        title={title}
        subtitle={accessNoteOf(root)}
        wrapSubtitle
        icon="users"
        value={option?.label ?? ''}
      />
    );
  }
  return (
    <SelectRow
      title={title}
      subtitle={accessNoteOf(root)}
      wrapSubtitle
      icon="users"
      options={ROOT_ACCESS_OPTIONS}
      value={rootAccessOf(root)}
      disabled={change.busy}
      onChange={(access) => {
        change.save(accessChangeOf(access), 'Who can use it was not changed');
      }}
    />
  );
}

export function NameRows({
  root,
  can,
  change,
  onRename,
}: RowsProps & { readonly onRename: () => void }): ReactNode {
  return (
    <List title="Folder">
      {can.change ? (
        <NavRow title="Name" icon="pencil" value={root.label} onPress={onRename} />
      ) : (
        <ValueRow title="Name" icon="pencil" value={root.label} />
      )}
      <ValueRow title="Who sees it" icon="eye" value={whoSeesOf(root)} />
      <AccessRow root={root} can={can} change={change} />
    </List>
  );
}

export function KeepRows({ root, can, change }: RowsProps): ReactNode {
  const locked = !can.change || change.busy;
  return (
    <List title="What Drive keeps">
      <SwitchRow
        title="Keep versions"
        subtitle={versionsNoteOf(root)}
        wrapSubtitle
        icon="history"
        value={root.versions}
        disabled={locked || root.readOnly}
        onChange={(versions) => {
          change.save({ versions }, 'The versions setting was not saved');
        }}
      />
      <SwitchRow
        title="Show its photos in Photos"
        subtitle="Pictures and videos here appear on the Photos timeline"
        wrapSubtitle
        icon="image"
        value={root.inPhotos}
        disabled={locked}
        onChange={(inPhotos) => {
          change.save({ inPhotos }, 'The Photos setting was not saved');
        }}
      />
      <SwitchRow
        title="Include hidden files"
        subtitle="Files and folders whose names start with a dot"
        wrapSubtitle
        icon="eyeOff"
        value={root.includeHidden}
        disabled={locked}
        onChange={(includeHidden) => {
          change.save({ includeHidden }, 'The hidden files setting was not saved');
        }}
      />
    </List>
  );
}

function rescan(mutation: MutationState, root: DriveRoot): void {
  mutation.run(() => scanDriveRoot(root.id), {
    failure: `${root.label} was not rescanned`,
    label: 'drive.settings.root_rescan',
    inline: true,
  });
}

export function WatchRow({
  root,
  can,
  watcher,
}: {
  readonly root: DriveRoot;
  readonly can: RootAbilities;
  readonly watcher: DriveWatcherState | undefined;
}): ReactNode {
  const mutation = useMutationState();
  const line = rootWatchLineOf(root, watcher);
  const scanning = root.state === 'scanning';
  return (
    <ListRow
      title="Watching for changes"
      icon={watcher === 'unavailable' ? 'eyeOff' : 'refresh'}
      iconTone={line.tone}
      subtitle={mutation.problem ?? line.text}
      subtitleTone={mutation.problem === null ? line.tone : 'critical'}
      wrapSubtitle
      {...(can.change
        ? {
            trailing: (
              <Button
                label="Rescan"
                spoken={`Rescan ${root.label}`}
                icon="refresh"
                variant="tonal"
                loading={mutation.busy || scanning}
                disabled={mutation.busy || scanning}
                onPress={() => {
                  rescan(mutation, root);
                }}
              />
            ),
          }
        : {})}
    />
  );
}

export function SyncRow({ root }: { readonly root: DriveRoot }): ReactNode {
  return (
    <List
      title="Sync"
      footer="Synced folder settings hold its skip list for sync, conflict copies and each computer."
    >
      <NavRow
        title="Synced folder"
        subtitle={root.synced ? 'Computers keep a copy in step' : 'Keep a copy on your computers'}
        icon="folderSync"
        value={syncValueOf(root)}
        href={href.driveSyncFolder(root.id)}
      />
    </List>
  );
}
