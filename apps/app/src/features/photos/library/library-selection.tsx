import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
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
import { allFavourite, pickedText } from './library-model';
import type { MediaActions } from './use-media-actions';
import { PHOTOS_BACKUP_SETTINGS_HREF } from '../components/photos-frame';
import { organiseMenuItems, useOrganiseActions } from '../organise/actions';

export const NOTHING_PICKED = 'Select items';

export interface SelectionExtra {
  readonly id: string;
  readonly label: string;
  readonly short: string;
  readonly icon: IconName;
  readonly disabled: boolean;
  readonly onPress: (ids: readonly string[]) => void;
}

export interface LibrarySelectionProps {
  readonly controls: MediaSelectionControls;
  readonly tiles: readonly MediaTile[];
  readonly media: MediaActions;
  readonly extras?: readonly SelectionExtra[];
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

const NO_EXTRAS: readonly SelectionExtra[] = [];

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

function useOrganiseMenu(picked: Picked, onDone: () => void): ReturnType<typeof useAnchoredMenu> {
  const actions = useOrganiseActions();
  return useAnchoredMenu(
    organiseMenuItems({
      actions,
      itemIds: picked.ids,
      current: null,
      archived: false,
      onGone: onDone,
      onSaved: onDone,
    }),
    'Organise',
  );
}

function OrganiseButton({ picked, onTrashed }: PickedProps): ReactNode {
  const { ref, open, menu } = useOrganiseMenu(picked, onTrashed);
  return (
    <View ref={ref} collapsable={false}>
      <Button
        label="Organise"
        icon="archive"
        variant="outlined"
        disabled={picked.none}
        onPress={open}
      />
      {menu}
    </View>
  );
}

function Summary({ controls, tiles }: LibrarySelectionProps): ReactNode {
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
          {ids.size === 0 ? NOTHING_PICKED : pickedText(ids, tiles)}
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
      <Button label="Back up" icon="upload" variant="tonal" href={PHOTOS_BACKUP_SETTINGS_HREF} />
    </View>
  );
}

function DeskActions({
  media,
  picked,
  onTrashed,
  extras,
}: PickedProps & { readonly extras: readonly SelectionExtra[] }): ReactNode {
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
      <OrganiseButton media={media} picked={picked} onTrashed={onTrashed} />
      {extras.map((extra) => (
        <Button
          key={extra.id}
          label={extra.label}
          icon={extra.icon}
          variant="outlined"
          disabled={picked.none || extra.disabled}
          onPress={() => {
            extra.onPress(picked.ids);
          }}
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

export function LibrarySelection({
  controls,
  tiles,
  media,
  extras = NO_EXTRAS,
}: LibrarySelectionProps): ReactNode {
  useEscape(controls.selection.active, controls.clear);
  return (
    <View className="min-h-15 flex-row flex-wrap items-center gap-2 bg-primary-container px-gutter py-2">
      <Summary controls={controls} tiles={tiles} media={media} />
      <DeskActions
        media={media}
        picked={selectedItems(controls.selection.ids, tiles)}
        onTrashed={controls.clear}
        extras={extras}
      />
    </View>
  );
}

export function LibrarySelectionHead({ controls, tiles, media }: LibrarySelectionProps): ReactNode {
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

function BarOrganise({ picked, onTrashed }: PickedProps): ReactNode {
  const { ref, open, menu } = useOrganiseMenu(picked, onTrashed);
  return (
    <View ref={ref} collapsable={false} className="flex-1">
      <BarAction icon="more" label="More" disabled={picked.none} onPress={open} />
      {menu}
    </View>
  );
}

export function LibraryActionRow({
  controls,
  tiles,
  media,
  extras = NO_EXTRAS,
}: LibrarySelectionProps): ReactNode {
  const picked = selectedItems(controls.selection.ids, tiles);
  const input: PickedProps = { media, picked, onTrashed: controls.clear };
  return (
    <View className="gap-2">
      <LocalSelection picked={picked} />
      <View className="flex-row">
        <BarAction {...shareAction(input)} />
        <BarAlbum media={media} picked={picked} onTrashed={controls.clear} />
        <BarAction {...chatAction(input)} />
        <BarOrganise media={media} picked={picked} onTrashed={controls.clear} />
        {extras.map((extra) => (
          <BarAction
            key={extra.id}
            icon={extra.icon}
            label={extra.short}
            disabled={picked.none || extra.disabled}
            onPress={() => {
              extra.onPress(picked.ids);
            }}
          />
        ))}
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

export interface SelectionFrame {
  readonly selection: ReactElement | null;
  readonly footer: ReactElement | null;
}

export function selectionFrameOf(compact: boolean, props: LibrarySelectionProps): SelectionFrame {
  const { selection } = props.controls;
  const head = compact ? <LibrarySelectionHead {...props} /> : <LibrarySelection {...props} />;
  return {
    selection: selection.active ? head : null,
    footer: compact && selection.ids.size > 0 ? <LibraryActionRow {...props} /> : null,
  };
}
