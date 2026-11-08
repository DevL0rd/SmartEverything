import type { DriveAlbum } from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';

export interface MoreMenuInput {
  readonly onDownload: () => void;
  readonly onShowInDrive: () => void;
  readonly onTrash: () => void;
}

export function albumMenuItems(
  albums: readonly DriveAlbum[],
  onAdd: (albumId: string, title: string) => void,
): readonly MenuItem[] {
  const manual = albums.filter((album) => album.kind === 'manual');
  if (manual.length === 0) {
    return [
      { label: 'No albums yet', icon: 'layers', disabled: true, onPress: (): void => undefined },
    ];
  }
  return manual.map((album) => ({
    id: album.id,
    label: album.title,
    icon: 'layers',
    onPress: (): void => {
      onAdd(album.id, album.title);
    },
  }));
}

export function moreMenuItems(input: MoreMenuInput): readonly MenuItem[] {
  return [
    { label: 'Download original', icon: 'download', onPress: input.onDownload },
    { label: 'Show in Drive', icon: 'folder', onPress: input.onShowInDrive },
    { label: 'Move to trash', icon: 'trash', destructive: true, onPress: input.onTrash },
  ];
}
