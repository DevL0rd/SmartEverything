import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';
import { DRIVE_ROOT_ADD, type DriveRootAdd } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { addDriveRoot, type DriveResult } from '../../../api/drive';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { useDriveRoots, useDriveVolumes } from '../../nas/data';
import {
  FolderChoice,
  VolumePicker,
  folderNameOf,
  volumeGroupsOf,
  type DriveVolumeEntry,
} from './volume-picker';
import { ROOT_ACCESS_OPTIONS, type RootAccess } from './root-model';

const log = new Logger('app.drive');

export interface AddRootDraft {
  readonly mountId: string | null;
  readonly folder: string | null;
  readonly label: string;
  readonly access: RootAccess;
  readonly versions: boolean;
  readonly inPhotos: boolean;
  readonly includeHidden: boolean;
  readonly skip: string;
}

export const EMPTY_ROOT_DRAFT: AddRootDraft = {
  mountId: null,
  folder: null,
  label: '',
  access: 'edit',
  versions: true,
  inPhotos: false,
  includeHidden: false,
  skip: '',
};

export function skipPatternsOf(text: string): readonly string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function chosenPathOf(draft: AddRootDraft, volumes: readonly DriveVolumeEntry[]): string | null {
  if (draft.folder !== null) return draft.folder;
  return volumes.find((volume) => volume.mountId === draft.mountId)?.mountPoint ?? null;
}

export function suggestedNameOf(draft: AddRootDraft, volumes: readonly DriveVolumeEntry[]): string {
  const path = chosenPathOf(draft, volumes);
  return path === null ? '' : folderNameOf(path);
}

export function addRootBodyOf(
  draft: AddRootDraft,
  volumes: readonly DriveVolumeEntry[],
): DriveRootAdd | null {
  const path = chosenPathOf(draft, volumes);
  if (path === null) return null;
  const readOnly = draft.access === 'view';
  const named = draft.label.trim();
  const parsed = DRIVE_ROOT_ADD.safeParse({
    kind: draft.folder === null ? 'volume' : 'folder',
    path,
    label: named === '' ? folderNameOf(path) : named,
    scope: 'home',
    ownerProfileId: null,
    readOnly,
    versions: !readOnly && draft.versions,
    inPhotos: draft.inPhotos,
    skipPatterns: skipPatternsOf(draft.skip),
    includeHidden: draft.includeHidden,
  });
  return parsed.success ? parsed.data : null;
}

export async function addRoot(body: DriveRootAdd): Promise<void> {
  const root = await addDriveRoot(body);
  log.info('root.added', { rootId: root.id, kind: body.kind, readOnly: body.readOnly });
}

type Change = (patch: Partial<AddRootDraft>) => void;

type VolumesQuery = UseQueryResult<DriveResult<'listVolumes'>>;

function VolumesBlock({
  query,
  draft,
  onChange,
}: {
  readonly query: VolumesQuery;
  readonly draft: AddRootDraft;
  readonly onChange: Change;
}): ReactNode {
  const roots = useDriveRoots();
  if (query.isPending) {
    return (
      <View className="gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </View>
    );
  }
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          background(query.refetch(), 'drive.volumes_refetch_failed');
        }}
      />
    );
  }
  const groups = volumeGroupsOf(query.data, roots);
  if (groups.length === 0) {
    return (
      <EmptyState
        compact
        icon="hardDrive"
        title="No disks found"
        body="The hub did not report any mounted disks. Connect a disk to the hub and open this again."
      />
    );
  }
  return (
    <VolumePicker
      groups={groups}
      selected={draft.mountId}
      onSelect={(mountId) => {
        onChange({ mountId, folder: null });
      }}
    />
  );
}

function AccessChoice({
  draft,
  onChange,
}: {
  readonly draft: AddRootDraft;
  readonly onChange: Change;
}): ReactNode {
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant" className="px-4">
        Who can use it
      </Text>
      <Segmented
        label="Who can use it"
        fill
        value={draft.access}
        options={ROOT_ACCESS_OPTIONS}
        onChange={(access) => {
          onChange({ access });
        }}
      />
    </View>
  );
}

function OptionRows({
  draft,
  onChange,
}: {
  readonly draft: AddRootDraft;
  readonly onChange: Change;
}): ReactNode {
  const view = draft.access === 'view';
  return (
    <List inset>
      <SwitchRow
        title="Keep earlier versions"
        {...(view
          ? { subtitle: 'A view-only folder is never changed, so it keeps no versions.' }
          : {})}
        icon="history"
        disabled={view}
        value={!view && draft.versions}
        onChange={(versions) => {
          onChange({ versions });
        }}
      />
      <SwitchRow
        title="Show its photos in Photos"
        icon="image"
        value={draft.inPhotos}
        onChange={(inPhotos) => {
          onChange({ inPhotos });
        }}
      />
      <SwitchRow
        title="Include hidden files"
        subtitle="Files and folders whose names start with a dot"
        icon="eye"
        value={draft.includeHidden}
        onChange={(includeHidden) => {
          onChange({ includeHidden });
        }}
      />
    </List>
  );
}

function SheetFooter({
  body,
  mutation,
  onClose,
}: {
  readonly body: DriveRootAdd | null;
  readonly mutation: MutationState;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <View className="ml-auto flex-row justify-end gap-2">
      <Button label="Cancel" variant="tonal" disabled={mutation.busy} onPress={onClose} />
      <Button
        label="Add folder"
        loading={mutation.busy}
        disabled={body === null || mutation.busy}
        onPress={() => {
          if (body === null) return;
          mutation.run(() => addRoot(body), {
            failure: 'The folder was not added',
            label: 'drive.root.add',
            inline: true,
            onDone: onClose,
          });
        }}
      />
    </View>
  );
}

function AddRootForm({
  query,
  draft,
  problem,
  onChange,
}: {
  readonly query: VolumesQuery;
  readonly draft: AddRootDraft;
  readonly problem: string | null;
  readonly onChange: Change;
}): ReactNode {
  const volumes = query.data ?? [];
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        Pick a disk on the hub, or a folder on it. Everyone in the home sees it in Drive.
      </Text>
      <VolumesBlock query={query} draft={draft} onChange={onChange} />
      <FolderChoice place={draft} volumes={volumes} onChange={onChange} />
      <TextField
        label="Name in Drive"
        value={draft.label}
        placeholder={suggestedNameOf(draft, volumes)}
        onChange={(label) => {
          onChange({ label });
        }}
        error={problem}
      />
      <AccessChoice draft={draft} onChange={onChange} />
      <OptionRows draft={draft} onChange={onChange} />
      <TextField
        label="Skip these"
        kind="code"
        multiline
        value={draft.skip}
        placeholder="**/node_modules/**"
        helper="One pattern per line. Skipped files are not read or shown in Drive."
        onChange={(skip) => {
          onChange({ skip });
        }}
      />
      <Text variant="footnote" tone="variant">
        Files stay where they are. Drive reads the folder in the background and picks up changes
        made outside it.
      </Text>
    </View>
  );
}

export function AddRootSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const [draft, setDraft] = useState<AddRootDraft>(EMPTY_ROOT_DRAFT);
  const mutation = useMutationState();
  const query = useDriveVolumes(open);
  const body = addRootBodyOf(draft, query.data ?? []);
  const close = (): void => {
    setDraft(EMPTY_ROOT_DRAFT);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title="Add a folder or drive"
      detents={['full']}
      footer={<SheetFooter body={body} mutation={mutation} onClose={close} />}
    >
      {open ? (
        <AddRootForm
          query={query}
          draft={draft}
          problem={mutation.problem}
          onChange={(patch) => {
            setDraft((current) => ({ ...current, ...patch }));
          }}
        />
      ) : null}
    </Sheet>
  );
}
