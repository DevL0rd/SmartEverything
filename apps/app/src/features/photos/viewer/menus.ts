import type { DriveAlbum } from '@smarteverything/domain';
import type { MenuItem } from '../../../components/menu';
import { SAVE_LABEL } from '../library/save-target';

export interface MoreMenuInput {
  readonly onSave: () => void;
  readonly onShowInDrive: () => void;
  readonly onTrash: () => void;
  readonly onRevert: (() => void) | null;
  readonly organise: readonly MenuItem[];
}

export function albumMenuItems(
  albums: readonly DriveAlbum[],
  onAdd: (albumId: string, title: string) => void,
  onNew?: () => void,
): readonly MenuItem[] {
  const manual = albums.filter((album) => album.kind === 'manual');
  const picks: readonly MenuItem[] = manual.map((album) => ({
    id: album.id,
    label: album.title,
    icon: 'layers',
    onPress: (): void => {
      onAdd(album.id, album.title);
    },
  }));
  if (onNew !== undefined) {
    return [...picks, { id: 'new-album', label: 'New album…', icon: 'plus', onPress: onNew }];
  }
  if (manual.length > 0) return picks;
  return [
    { label: 'No albums yet', icon: 'layers', disabled: true, onPress: (): void => undefined },
  ];
}

export function moreMenuItems(input: MoreMenuInput): readonly MenuItem[] {
  return [
    { label: SAVE_LABEL, icon: 'download', onPress: input.onSave },
    { label: 'Show in Drive', icon: 'folder', onPress: input.onShowInDrive },
    ...(input.onRevert === null
      ? []
      : [{ label: 'Revert to original', icon: 'undo' as const, onPress: input.onRevert }]),
    ...input.organise,
    { label: 'Move to trash', icon: 'trash', destructive: true, onPress: input.onTrash },
  ];
}
