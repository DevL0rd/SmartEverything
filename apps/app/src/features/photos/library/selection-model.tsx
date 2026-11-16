import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { Text } from '../../../components/text';
import { PHOTOS_BACKUP_SETTINGS_HREF } from '../components/photos-frame';
import { allFavourite } from './library-model';
import type { LibrarySelectionProps, SelectionExtra } from './library-selection';
import { SAVE_LABEL } from './save-target';
import type { MediaActions } from './use-media-actions';

export interface Picked {
  readonly ids: readonly string[];
  readonly none: boolean;
  readonly favourite: boolean;
  readonly localCount: number;
  readonly locked: boolean;
}

export interface PickedProps {
  readonly media: MediaActions;
  readonly picked: Picked;
  readonly onTrashed: () => void;
}

export const NO_EXTRAS: readonly SelectionExtra[] = [];

export interface SelectionAction {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

export const PENDING_ALL: Picked = {
  ids: [],
  none: false,
  favourite: false,
  localCount: 0,
  locked: true,
};

export function pendingAll(props: LibrarySelectionProps): boolean {
  return props.controls.everything && props.scope?.complete === false;
}

export function lockedWhile(picked: Picked, running: boolean): Picked {
  return running && !picked.locked ? { ...picked, locked: true } : picked;
}

export function pickedOf(props: LibrarySelectionProps): Picked {
  return pendingAll(props) ? PENDING_ALL : selectedItems(props.controls.selection.ids, props.tiles);
}

export function selectedItems(selection: ReadonlySet<string>, tiles: readonly MediaTile[]): Picked {
  const selected = tiles.filter((tile) => selection.has(tile.id));
  const ids = selected.filter((tile) => !tile.local).map((tile) => tile.id);
  return {
    ids,
    none: ids.length === 0,
    favourite: allFavourite(new Set(ids), tiles),
    localCount: selected.filter((tile) => tile.local).length,
    locked: false,
  };
}

export function shareAction({ media, picked }: PickedProps): SelectionAction {
  return {
    id: 'share',
    label: 'Share',
    icon: 'share',
    disabled: picked.none,
    onPress: (): void => {
      media.share(picked.ids);
    },
  };
}

export function chatAction({ media, picked }: PickedProps): SelectionAction {
  return {
    id: 'chat',
    label: 'To chat',
    icon: 'messageCircle',
    disabled: picked.none || media.chatHint !== null,
    onPress: (): void => {
      media.toChat(picked.ids);
    },
  };
}

export function keepActions(input: PickedProps): readonly SelectionAction[] {
  const { media, picked } = input;
  return [
    {
      id: 'favourite',
      label: picked.favourite ? 'Unfavourite' : 'Favourite',
      icon: 'star',
      disabled: picked.none,
      onPress: (): void => {
        media.favourite(picked.ids, !picked.favourite);
      },
    },
    {
      id: 'download',
      label: SAVE_LABEL,
      icon: 'download',
      disabled: picked.none,
      onPress: (): void => {
        media.download(picked.ids);
      },
    },
  ];
}

export function sendActions(input: PickedProps): readonly SelectionAction[] {
  return [shareAction(input), chatAction(input)];
}

export function shown(actions: readonly SelectionAction[]): readonly SelectionAction[] {
  return actions.filter((action) => !action.disabled);
}

export function LocalSelection({ picked }: { readonly picked: Picked }): ReactNode {
  if (picked.localCount === 0) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="caption" tone="variant">
        {picked.localCount} on this device · other actions apply to items in the hub library
      </Text>
      <Button label="Back up" icon="upload" variant="tonal" href={PHOTOS_BACKUP_SETTINGS_HREF} />
    </View>
  );
}
