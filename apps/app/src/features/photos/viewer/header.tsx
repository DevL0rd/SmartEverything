import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { Interactive } from '../../../components/interactive';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { Arc } from '../../../components/charts/arc';
import type { EditEntry } from '../editor/edit-entry';
import type { EditJobView } from '../editor/job-view';

export interface HeaderText {
  readonly title: string;
  readonly detail: string | null;
}

export interface HeaderControls {
  readonly starred: boolean;
  readonly infoOpen: boolean;
  readonly busy: boolean;
  readonly albums: readonly MenuItem[];
  readonly more: readonly MenuItem[];
  readonly onClose: () => void;
  readonly onFavourite: () => void;
  readonly onShare: () => void;
  readonly onInfo: () => void;
  readonly onTrash: () => void;
  readonly edit: EditEntry;
}

function MenuIconButton({
  icon,
  label,
  items,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly items: readonly MenuItem[];
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, label);
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon={icon} label={label} onPress={open} />
      {menu}
    </View>
  );
}

function JobRing({ job }: { readonly job: EditJobView | null }): ReactNode {
  if (job === null) return null;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={job.label}>
      <Arc
        value={job.progress ?? 0}
        size={28}
        thickness={3}
        colour="primary"
        trackColour="surface-3"
      />
    </View>
  );
}

export function ViewerHeading({ text }: { readonly text: HeaderText }): ReactNode {
  return (
    <View className="min-w-0 flex-1">
      <Text variant="label" numberOfLines={1}>
        {text.title}
      </Text>
      {text.detail === null ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
          {text.detail}
        </Text>
      )}
    </View>
  );
}

function FavouriteButton({ controls }: { readonly controls: HeaderControls }): ReactNode {
  return (
    <IconButton
      icon="star"
      label={controls.starred ? 'Remove from favourites' : 'Favourite'}
      selected={controls.starred}
      disabled={controls.busy}
      onPress={controls.onFavourite}
      shortcut="F"
    />
  );
}

function InfoButton({ controls }: { readonly controls: HeaderControls }): ReactNode {
  return (
    <IconButton
      icon="info"
      label={controls.infoOpen ? 'Info, open' : 'Info'}
      selected={controls.infoOpen}
      onPress={controls.onInfo}
      shortcut="I"
    />
  );
}

export function DesktopControls({ controls }: { readonly controls: HeaderControls }): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      <FavouriteButton controls={controls} />
      <JobRing job={controls.edit.job} />
      {controls.edit.available ? (
        <IconButton
          icon="pencil"
          label={controls.edit.label}
          disabled={controls.busy || controls.edit.busy}
          onPress={controls.edit.onEdit}
          shortcut="E"
        />
      ) : null}
      <MenuIconButton icon="layers" label="Add to album" items={controls.albums} />
      <IconButton
        icon="share"
        label="Share link"
        disabled={controls.busy}
        onPress={controls.onShare}
      />
      <InfoButton controls={controls} />
      <MenuIconButton icon="ellipsis" label="More" items={controls.more} />
    </View>
  );
}

export function compactMoreItems(
  controls: HeaderControls,
  onAlbums: () => void,
): readonly MenuItem[] {
  const { edit } = controls;
  const editing: readonly MenuItem[] = edit.available
    ? [
        {
          label: edit.label,
          icon: 'pencil',
          shortcut: 'E',
          disabled: controls.busy || edit.busy,
          onPress: edit.onEdit,
        },
      ]
    : [];
  return [
    ...editing,
    { label: 'Add to album', icon: 'layers', onPress: onAlbums },
    { label: 'Share link', icon: 'share', disabled: controls.busy, onPress: controls.onShare },
    ...controls.more,
  ];
}

export function CompactControls({ controls }: { readonly controls: HeaderControls }): ReactNode {
  const {
    ref: albumsRef,
    open: openAlbums,
    menu: albumsMenu,
  } = useAnchoredMenu(controls.albums, 'Add to album');
  const {
    ref: moreRef,
    open: openMore,
    menu: moreMenu,
  } = useAnchoredMenu(compactMoreItems(controls, openAlbums), 'More');
  return (
    <View className="flex-row items-center gap-1">
      <FavouriteButton controls={controls} />
      <JobRing job={controls.edit.job} />
      <InfoButton controls={controls} />
      <View ref={albumsRef} collapsable={false}>
        <View ref={moreRef} collapsable={false}>
          <IconButton icon="ellipsis" label="More" onPress={openMore} />
        </View>
      </View>
      {moreMenu}
      {albumsMenu}
    </View>
  );
}

export function PhoneControls({ controls }: { readonly controls: HeaderControls }): ReactNode {
  return (
    <View className="flex-row items-center gap-1">
      <JobRing job={controls.edit.job} />
      <MenuIconButton icon="ellipsisVertical" label="More" items={controls.more} />
    </View>
  );
}

function BarAction({
  icon,
  label,
  tone = 'default',
  selected = false,
  disabled = false,
  onPress,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly tone?: Tone;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={label}
      selected={selected}
      disabled={disabled}
      onPress={onPress}
      className="min-h-touch-min flex-1 items-center justify-center gap-1 rounded-md py-1"
      layerClassName="rounded-md"
    >
      <Icon name={icon} size={24} tone={selected ? 'primary' : tone} />
      <Text variant="caption" tone={selected ? 'primary' : tone}>
        {label}
      </Text>
    </Interactive>
  );
}

function AlbumAction({ items }: { readonly items: readonly MenuItem[] }): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, 'Add to album');
  return (
    <View ref={ref} collapsable={false} className="flex-1">
      <BarAction icon="layers" label="Album" onPress={open} />
      {menu}
    </View>
  );
}

export function PhoneActions({ controls }: { readonly controls: HeaderControls }): ReactNode {
  return (
    <View className="flex-row px-2 pb-safe-offset-3 pt-2">
      <BarAction
        icon="star"
        label="Favourite"
        selected={controls.starred}
        disabled={controls.busy}
        onPress={controls.onFavourite}
      />
      <BarAction icon="share" label="Share" disabled={controls.busy} onPress={controls.onShare} />
      <AlbumAction items={controls.albums} />
      {controls.edit.available ? (
        <BarAction
          icon="pencil"
          label="Edit"
          disabled={controls.busy || controls.edit.busy}
          onPress={controls.edit.onEdit}
        />
      ) : null}
      <BarAction icon="info" label="Info" onPress={controls.onInfo} />
      <BarAction
        icon="trash"
        label="Trash"
        tone="critical"
        disabled={controls.busy}
        onPress={controls.onTrash}
      />
    </View>
  );
}
