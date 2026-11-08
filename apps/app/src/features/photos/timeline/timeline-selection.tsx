import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import type { MediaSelectionControls } from '../../../components/media-grid/selection';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { useAnchoredMenu } from '../../../components/menu';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { useEscape } from '../../../components/use-escape';
import { allFavourite, pickedText } from './timeline-model';
import type { MediaActions } from './use-media-actions';

export interface TimelineSelectionProps {
  readonly controls: MediaSelectionControls;
  readonly tiles: readonly MediaTile[];
  readonly media: MediaActions;
}

interface Picked {
  readonly ids: readonly string[];
  readonly none: boolean;
  readonly favourite: boolean;
  readonly localCount: number;
}

interface PickedProps {
  readonly media: MediaActions;
  readonly picked: Picked;
  readonly onTrashed: () => void;
}

interface SelectionAction {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

export function selectedItems(selection: ReadonlySet<string>, tiles: readonly MediaTile[]): Picked {
  const selected = tiles.filter((tile) => selection.has(tile.id));
  const ids = selected.filter((tile) => !tile.local).map((tile) => tile.id);
  return {
    ids,
    none: ids.length === 0,
    favourite: allFavourite(new Set(ids), tiles),
    localCount: selected.filter((tile) => tile.local).length,
  };
}

function shareAction({ media, picked }: PickedProps): SelectionAction {
  const single = picked.ids.length === 1 ? picked.ids[0] : undefined;
  return {
    id: 'share',
    label: 'Share',
    icon: 'share',
    disabled: single === undefined,
    onPress: (): void => {
      if (single !== undefined) media.share(single);
    },
  };
}

function chatAction({ media, picked }: PickedProps): SelectionAction {
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

function deskActions(input: PickedProps): readonly SelectionAction[] {
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
    chatAction(input),
    shareAction(input),
    {
      id: 'download',
      label: 'Download',
      icon: 'download',
      disabled: picked.none,
      onPress: (): void => {
        media.download(picked.ids);
      },
    },
  ];
}

function AlbumButton({ media, picked }: PickedProps): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(media.albums(picked.ids), 'Add to album');
  return (
    <View ref={ref} collapsable={false}>
      <Button
        label="Add to album"
        icon="layers"
        variant="tonal"
        disabled={picked.none}
        onPress={open}
      />
      {menu}
    </View>
  );
}

function Summary({ controls, tiles }: TimelineSelectionProps): ReactNode {
  const ids = controls.selection.ids;
  return (
    <>
      <IconButton
        icon="close"
        label="Clear the selection"
        tone="onPrimaryContainer"
        onPress={controls.clear}
      />
      <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
        <Text
          variant="title-3"
          tone="onPrimaryContainer"
          className="tabular-nums"
          numberOfLines={1}
        >
          {pickedText(ids, tiles)}
        </Text>
        {ids.size < tiles.length ? (
          <Button label="Select all" variant="text" onPress={controls.all} />
        ) : null}
      </View>
    </>
  );
}

function LocalSelection({ picked }: { readonly picked: Picked }): ReactNode {
  if (picked.localCount === 0) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="caption" tone="variant">
        {picked.localCount} on this device · other actions apply to items in the hub library
      </Text>
      <Button label="Back up" icon="upload" variant="tonal" href={href.photosPage('backup')} />
    </View>
  );
}

function DeskActions({ media, picked, onTrashed }: PickedProps): ReactNode {
  return (
    <>
      <LocalSelection picked={picked} />
      <AlbumButton media={media} picked={picked} onTrashed={onTrashed} />
      {deskActions({ media, picked, onTrashed }).map((action) => (
        <Button
          key={action.id}
          label={action.label}
          icon={action.icon}
          variant="outlined"
          disabled={action.disabled}
          onPress={action.onPress}
        />
      ))}
      <View className="mx-1 h-5 w-px bg-on-primary-container/30" />
      <Button
        label="Move to trash"
        icon="trash"
        variant="destructive"
        disabled={picked.none}
        onPress={() => {
          media.trash(picked.ids, onTrashed);
        }}
      />
    </>
  );
}

export function TimelineSelection({ controls, tiles, media }: TimelineSelectionProps): ReactNode {
  useEscape(controls.selection.active, controls.clear);
  return (
    <View className="min-h-15 flex-row flex-wrap items-center gap-2 bg-primary-container px-gutter py-2">
      <Summary controls={controls} tiles={tiles} media={media} />
      <DeskActions
        media={media}
        picked={selectedItems(controls.selection.ids, tiles)}
        onTrashed={controls.clear}
      />
    </View>
  );
}

export function TimelineSelectionHead({
  controls,
  tiles,
  media,
}: TimelineSelectionProps): ReactNode {
  useEscape(controls.selection.active, controls.clear);
  return (
    <View className="min-h-15 flex-row items-center gap-2 bg-primary-container px-gutter py-2">
      <Summary controls={controls} tiles={tiles} media={media} />
    </View>
  );
}

interface BarProps {
  readonly icon: IconName;
  readonly label: string;
  readonly disabled: boolean;
  readonly tone?: Tone;
  readonly onPress: () => void;
}

function BarAction({ icon, label, disabled, tone = 'default', onPress }: BarProps): ReactNode {
  return (
    <Interactive
      label={label}
      disabled={disabled}
      onPress={onPress}
      className="min-h-touch-min flex-1 items-center justify-center gap-1 rounded-md py-1"
      layerClassName="rounded-md"
    >
      <Icon name={icon} size={24} tone={tone} />
      <Text variant="caption" tone={tone}>
        {label}
      </Text>
    </Interactive>
  );
}

function BarAlbum({ media, picked }: PickedProps): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(media.albums(picked.ids), 'Add to album');
  return (
    <View ref={ref} collapsable={false} className="flex-1">
      <BarAction icon="layers" label="Album" disabled={picked.none} onPress={open} />
      {menu}
    </View>
  );
}

export function TimelineActionRow({ controls, tiles, media }: TimelineSelectionProps): ReactNode {
  const picked = selectedItems(controls.selection.ids, tiles);
  const input: PickedProps = { media, picked, onTrashed: controls.clear };
  return (
    <View className="-mx-gutter border-t border-outline-variant bg-surface-2 px-2 pb-safe-offset-2 pt-2">
      <LocalSelection picked={picked} />
      <View className="flex-row">
        <BarAction {...shareAction(input)} />
        <BarAlbum media={media} picked={picked} onTrashed={controls.clear} />
        <BarAction {...chatAction(input)} />
        <BarAction
          icon="trash"
          label="Trash"
          tone="critical"
          disabled={picked.none}
          onPress={() => {
            media.trash(picked.ids, controls.clear);
          }}
        />
      </View>
    </View>
  );
}
