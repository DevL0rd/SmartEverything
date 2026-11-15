import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import type { IconName } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import type { MediaSelectionControls } from '../../../components/media-grid/selection';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { useAnchoredMenu } from '../../../components/menu';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { offersSelectAll, pickedText, type SelectionScope } from './library-model';
import type { MediaActions } from './use-media-actions';
import { organiseMenuItems, useOrganiseActions } from '../organise/actions';
import {
  SelectionActions,
  SelectionDivider,
  SelectionGroup,
  SelectionSummary,
  SelectionSurface,
} from '../components/selection-surface';
import { LibraryActionRow } from './library-action-row';
import {
  keepActions,
  LocalSelection,
  NO_EXTRAS,
  pickedOf,
  sendActions,
  shown,
  type Picked,
  type PickedProps,
  type SelectionAction,
} from './selection-model';

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
  readonly scope?: SelectionScope;
}

function ActionButtons({ actions }: { readonly actions: readonly SelectionAction[] }): ReactNode {
  return shown(actions).map((action) => (
    <Button
      key={action.id}
      label={action.label}
      icon={action.icon}
      variant="outlined"
      onPress={action.onPress}
    />
  ));
}

function AlbumButton({ media, picked }: PickedProps): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(media.albums(picked.ids), 'Add to album');
  return (
    <View ref={ref} collapsable={false}>
      <Button label="Add to album" icon="layers" variant="tonal" onPress={open} />
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
      <Button label="Organise" icon="archive" variant="outlined" onPress={open} />
      {menu}
    </View>
  );
}

function summaryText(props: LibrarySelectionProps): string {
  const { controls, tiles, scope } = props;
  const ids = controls.selection.ids;
  if (controls.everything && scope !== undefined) return pickedText(ids, tiles, scope.total);
  return ids.size === 0 ? NOTHING_PICKED : pickedText(ids, tiles, null);
}

function Summary(props: LibrarySelectionProps): ReactNode {
  const { controls, tiles, scope } = props;
  const ids = controls.selection.ids;
  return (
    <SelectionSummary>
      <IconButton
        icon="close"
        label="Clear the selection"
        tone="onPrimaryContainer"
        onPress={controls.clear}
      />
      <Text
        variant="title-3"
        tone="onPrimaryContainer"
        className="min-w-0 shrink tabular-nums"
        numberOfLines={1}
      >
        {summaryText(props)}
      </Text>
      {offersSelectAll(ids.size, tiles.length, controls.everything, scope) ? (
        <Button
          label="Select all"
          variant="text"
          onPress={scope === undefined ? controls.all : scope.onAll}
        />
      ) : null}
    </SelectionSummary>
  );
}

function ManageGroup({
  media,
  picked,
  onTrashed,
  extras,
}: PickedProps & { readonly extras: readonly SelectionExtra[] }): ReactNode {
  return (
    <SelectionGroup>
      <OrganiseButton media={media} picked={picked} onTrashed={onTrashed} />
      {extras
        .filter((extra) => !extra.disabled)
        .map((extra) => (
          <Button
            key={extra.id}
            label={extra.label}
            icon={extra.icon}
            variant="outlined"
            onPress={() => {
              extra.onPress(picked.ids);
            }}
          />
        ))}
      <Button
        label="Move to trash"
        icon="trash"
        variant="destructive"
        onPress={() => {
          media.trash(picked.ids, onTrashed);
        }}
      />
    </SelectionGroup>
  );
}

function KeepGroup({ media, picked, onTrashed }: PickedProps): ReactNode {
  return (
    <SelectionGroup>
      <AlbumButton media={media} picked={picked} onTrashed={onTrashed} />
      <ActionButtons actions={keepActions({ media, picked, onTrashed })} />
    </SelectionGroup>
  );
}

function SendGroup(input: PickedProps): ReactNode {
  const send = shown(sendActions(input));
  if (send.length === 0) return null;
  return (
    <>
      <SelectionDivider />
      <SelectionGroup>
        <ActionButtons actions={send} />
      </SelectionGroup>
    </>
  );
}

function DeskActions({
  media,
  picked,
  onTrashed,
  extras,
}: PickedProps & { readonly extras: readonly SelectionExtra[] }): ReactNode {
  if (picked.none) return <LocalSelection picked={picked} />;
  return (
    <SelectionActions>
      <LocalSelection picked={picked} />
      <KeepGroup media={media} picked={picked} onTrashed={onTrashed} />
      <SendGroup media={media} picked={picked} onTrashed={onTrashed} />
      <SelectionDivider />
      <ManageGroup media={media} picked={picked} onTrashed={onTrashed} extras={extras} />
    </SelectionActions>
  );
}

export function LibrarySelection(props: LibrarySelectionProps): ReactNode {
  const { controls, media, extras = NO_EXTRAS } = props;
  useEscape(controls.selection.active, controls.clear);
  return (
    <SelectionSurface>
      <Summary {...props} />
      <DeskActions
        media={media}
        picked={pickedOf(props)}
        onTrashed={controls.clear}
        extras={extras}
      />
    </SelectionSurface>
  );
}

export function LibrarySelectionHead(props: LibrarySelectionProps): ReactNode {
  const { controls } = props;
  useEscape(controls.selection.active, controls.clear);
  return (
    <SelectionSurface>
      <Summary {...props} />
    </SelectionSurface>
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

