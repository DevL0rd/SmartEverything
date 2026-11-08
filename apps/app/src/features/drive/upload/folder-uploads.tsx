import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { DriveItem } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import type { HeaderAction } from '../../../components/page-header';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useFileDrop } from '../../../platform/file-drop';
import { pickFiles, type PickedBlob, type PickedFile } from '../../../platform/pick-files';
import { useSyncStatus } from '../../../store/selectors';
import { useDriveSyncClients } from '../../nas/data';
import { syncedComputers, type FolderSlotContext } from '../folder/folder-model';
import { retryFolderId, uploadFiles, useFolderUploads } from './drive-uploads';
import { blockedDropText, dropDetail, dropTitle } from './upload-model';
import { UploadStrip } from './upload-strip';

function isBlob(file: PickedFile): file is PickedBlob {
  return 'blob' in file && typeof file.blob === 'function';
}

function send(files: readonly PickedBlob[], folderId: string): void {
  background(uploadFiles(files, folderId), 'drive.upload.start_failed');
}

async function chooseInto(folderId: string): Promise<void> {
  try {
    send(await pickFiles('files'), folderId);
  } catch (error) {
    notify({ message: 'Files couldn’t be chosen', error, tone: 'critical' });
  }
}

export function uploadActionsOf(
  folder: DriveItem | null,
  writable: boolean,
): readonly HeaderAction[] {
  if (folder === null || !writable) return [];
  return [
    {
      icon: 'upload',
      label: 'Upload',
      onPress: (): void => {
        background(chooseInto(folder.id), 'drive.upload.pick_failed');
      },
    },
  ];
}

function DropOverlay({
  title,
  detail,
  blocked,
}: {
  readonly title: string;
  readonly detail: string;
  readonly blocked: boolean;
}): ReactNode {
  return (
    <View
      pointerEvents="none"
      className="absolute inset-0 z-10 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/10 p-6"
    >
      <View className="size-14 items-center justify-center rounded-full bg-primary-container">
        <Icon name={blocked ? 'alert' : 'upload'} size={24} tone="onPrimaryContainer" />
      </View>
      <Text variant="title-3" align="center">
        {title}
      </Text>
      <Text variant="callout" tone="variant" align="center">
        {detail}
      </Text>
    </View>
  );
}

interface DropCopy {
  readonly title: string;
  readonly detail: string;
  readonly blocked: boolean;
}

function useDropCopy(context: FolderSlotContext, online: boolean): DropCopy {
  const clients = useDriveSyncClients();
  const { root, folder } = context;
  if (folder === null) {
    return {
      title: 'Open a folder to upload',
      detail: 'Files go into a folder inside this library folder.',
      blocked: true,
    };
  }
  if (!online || root.readOnly) {
    return { title: 'Can’t upload here now', detail: blockedDropText(online), blocked: true };
  }
  return {
    title: dropTitle(folder.name),
    detail: dropDetail(syncedComputers(root, clients)),
    blocked: false,
  };
}

function FolderStrip({
  folder,
  online,
}: {
  readonly folder: DriveItem;
  readonly online: boolean;
}): ReactNode {
  const view = useFolderUploads(folder.id);
  useEffect(() => {
    if (online) retryFolderId(folder.id);
  }, [online, folder.id]);
  if (view.rows.length === 0) return null;
  return <UploadStrip view={view} folderId={folder.id} folderName={folder.name} />;
}

export function FolderUploads({
  context,
  children,
}: {
  readonly context: FolderSlotContext;
  readonly children: ReactNode;
}): ReactNode {
  const ref = useRef<View>(null);
  const [hovering, setHovering] = useState(false);
  const online = useSyncStatus().status === 'live';
  const copy = useDropCopy(context, online);
  const { folder } = context;
  useFileDrop(ref, {
    onHover: setHovering,
    onFiles: (files) => {
      if (folder !== null && !copy.blocked) send(files.filter(isBlob), folder.id);
    },
  });
  return (
    <View ref={ref} className="min-h-0 flex-1">
      <View className="min-h-0 flex-1">
        {children}
        {hovering ? <DropOverlay {...copy} /> : null}
      </View>
      {folder === null ? null : <FolderStrip folder={folder} online={online} />}
    </View>
  );
}
