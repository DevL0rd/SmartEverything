import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { DriveFolderPlace } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { useFileDrop } from '../../../platform/file-drop';
import { pickFiles, type PickedBlob, type PickedFile } from '../../../platform/pick-files';
import { useSyncStatus } from '../../../store/selectors';
import { useDrivePlacementRows } from '../data';
import { placedComputersOf, type FolderSlotContext } from '../folder/folder-model';
import { retryFolderId, uploadFiles, useFolderUploads } from './drive-uploads';
import { blockedDropText, dropDetail, dropTitle, placeIdOf, placeOf } from './upload-model';
import { UploadStrip } from './upload-strip';

function isBlob(file: PickedFile): file is PickedBlob {
  return 'blob' in file && typeof file.blob === 'function';
}

function send(files: readonly PickedBlob[], place: DriveFolderPlace): void {
  background(uploadFiles(files, place), 'drive.upload.start_failed');
}

async function chooseInto(place: DriveFolderPlace): Promise<void> {
  try {
    send(await pickFiles('files'), place);
  } catch (error) {
    notify({ message: 'Files couldn’t be chosen', error, tone: 'critical' });
  }
}

export function chooseUploads(place: DriveFolderPlace): void {
  background(chooseInto(place), 'drive.upload.pick_failed');
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

function useDropCopy(
  context: FolderSlotContext,
  where: string,
  state: { readonly online: boolean; readonly full: boolean },
): DropCopy {
  const placements = useDrivePlacementRows();
  if (!state.online || !context.writable || state.full) {
    return {
      title: 'Can’t upload here now',
      detail: blockedDropText(state.online, state.full),
      blocked: true,
    };
  }
  return {
    title: dropTitle(where),
    detail: dropDetail(placedComputersOf(placements, context.rootId)),
    blocked: false,
  };
}

function PlaceStrip({
  place,
  name,
  online,
}: {
  readonly place: DriveFolderPlace;
  readonly name: string;
  readonly online: boolean;
}): ReactNode {
  const placeId = placeIdOf(place);
  const view = useFolderUploads(placeId);
  useEffect(() => {
    if (online) retryFolderId(placeId);
  }, [online, placeId]);
  if (view.rows.length === 0) return null;
  return <UploadStrip view={view} placeId={placeId} placeName={name} />;
}

export function FolderUploads({
  context,
  where,
  full,
  children,
}: {
  readonly context: FolderSlotContext;
  readonly where: string;
  readonly full: boolean;
  readonly children: ReactNode;
}): ReactNode {
  const ref = useRef<View>(null);
  const [hovering, setHovering] = useState(false);
  const online = useSyncStatus().status === 'live';
  const copy = useDropCopy(context, where, { online, full });
  const place = placeOf(context.rootId, context.folder);
  useFileDrop(ref, {
    onHover: setHovering,
    onFiles: (files) => {
      if (!copy.blocked) send(files.filter(isBlob), place);
    },
  });
  return (
    <View ref={ref} className="min-h-0 flex-1">
      <View className="min-h-0 flex-1">
        {children}
        {hovering ? <DropOverlay {...copy} /> : null}
      </View>
      <PlaceStrip place={place} name={where} online={online} />
    </View>
  );
}
