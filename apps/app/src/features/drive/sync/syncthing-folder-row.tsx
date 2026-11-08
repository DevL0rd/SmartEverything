import type { ReactNode } from 'react';
import type { DriveRoot, SyncthingFolder } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ListRow } from '../../../components/list-row';
import { joinParts, plural } from '../../../format/text';
import { useMutationState } from '../../../store/mutation';
import { FolderRing } from '../../../plugins/syncthing/model/folder-ring';
import { folderState, orderedFolders } from '../../../plugins/syncthing/model/folder-model';
import { useSyncthingSnapshot } from '../../../plugins/syncthing/syncthing-data';
import { EMPTY_ROOT_DRAFT, addRoot, addRootBodyOf } from '../settings/add-root-sheet';

export interface SyncthingFolderRowProps {
  readonly folder: SyncthingFolder;
  readonly roots: readonly DriveRoot[];
  readonly owner: boolean;
}

export function syncthingLineOf(folder: SyncthingFolder): string {
  const devices = folder.sharedWith.length;
  return joinParts([folderState(folder).text, devices === 0 ? null : plural(devices, 'device')]);
}

export function inLibrary(folder: SyncthingFolder, roots: readonly DriveRoot[]): boolean {
  return roots.some((root) => root.path === folder.path);
}

function AddButton({ folder }: { readonly folder: SyncthingFolder }): ReactNode {
  const mutation = useMutationState();
  const body = addRootBodyOf({ ...EMPTY_ROOT_DRAFT, folder: folder.path, label: folder.label }, []);
  if (body === null) return null;
  return (
    <Button
      label="Add to library"
      spoken={`Add ${folder.label} to the library`}
      icon="plus"
      variant="outlined"
      loading={mutation.busy}
      onPress={() => {
        mutation.run(() => addRoot(body), {
          failure: `${folder.label} was not added`,
          label: 'drive.sync.syncthing_add',
        });
      }}
    />
  );
}

function Trailing({ folder, roots, owner }: SyncthingFolderRowProps): ReactNode {
  if (inLibrary(folder, roots)) return <Badge label="In Drive" tone="positive" icon="check" />;
  return owner ? <AddButton folder={folder} /> : null;
}

export function SyncthingFolderRow(props: SyncthingFolderRowProps): ReactNode {
  const { folder } = props;
  const state = folderState(folder);
  const line = syncthingLineOf(folder);
  return (
    <ListRow
      title={folder.label === '' ? folder.id : folder.label}
      subtitle={line}
      subtitleTone={state.tone === 'critical' ? 'critical' : 'variant'}
      label={`${folder.label}, ${line}`}
      leading={
        <FolderRing
          state={state}
          size={28}
          label={`${folder.label}, ${String(state.percent)} percent synced`}
        />
      }
      trailing={<Trailing {...props} />}
    />
  );
}

export function SyncthingCard({
  roots,
  owner,
}: {
  readonly roots: readonly DriveRoot[];
  readonly owner: boolean;
}): ReactNode {
  const snapshot = useSyncthingSnapshot();
  if (snapshot.state !== 'ready' || snapshot.value.folders.length === 0) return null;
  return (
    <Card title="Syncthing folders" icon="folderSync" padding="none" className="gap-0">
      {orderedFolders(snapshot.value.folders).map((folder) => (
        <SyncthingFolderRow key={folder.id} folder={folder} roots={roots} owner={owner} />
      ))}
    </Card>
  );
}
