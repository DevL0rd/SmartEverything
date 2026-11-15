import { router } from 'expo-router';
import { background } from '@smarteverything/logging';
import type { MediaInfo, PhotoPlace } from '@smarteverything/domain';
import type { AppHref } from '../../../components/app-href';
import type { MediaTile } from '../../../components/media-grid/tiles';
import type { MenuItem } from '../../../components/menu';
import { usePref, PREFS } from '../../../store/prefs';
import { openHrefOf, useDriveAlbums, useDriveRoots } from '../../drive';
import { useViewerActions, type ViewerActions } from './actions';
import { useAddedBy } from './added-by';
import { useAskAbout } from './ask';
import type { HeaderControls } from './header';
import type { InfoContent } from './info-rows';
import type { MediaItem } from './info-model';
import { albumMenuItems, moreMenuItems } from './menus';
import { openNewAlbum } from '../albums/new-album-host';
import { useEditEntry } from '../editor/edit-entry';
import { saveToDevice } from '../library/save-to-device';
import { placeLine } from './info-model';
import { organiseMenuItems, useOrganiseActions } from '../organise/actions';
import { usePhotoArchived } from '../organise/queries';
import type { MetaCurrent } from '../organise/meta/meta-request';
import type { ViewerSequence } from './sequence';

export interface ViewerControlsInput {
  readonly item: MediaItem;
  readonly media: MediaInfo | null;
  readonly place: PhotoPlace | null;
  readonly library: string | null;
  readonly sequence: ViewerSequence;
  readonly infoOpen: boolean;
  readonly onInfo: () => void;
  readonly onOpen: (itemId: string) => void;
  readonly onClose: () => void;
}

export interface ViewerControls {
  readonly actions: ViewerActions;
  readonly header: HeaderControls;
  readonly info: InfoContent;
}

function afterTrash(input: ViewerControlsInput): void {
  const landing: MediaTile | null = input.sequence.next ?? input.sequence.previous;
  if (landing === null) input.onClose();
  else input.onOpen(landing.id);
}

export function metaCurrentOf(
  input: Pick<ViewerControlsInput, 'item' | 'media' | 'place'>,
): MetaCurrent {
  return {
    takenAt: input.item.takenAt,
    offsetMin: input.media?.tzOffsetMin ?? null,
    place: input.item.place,
    placeLabel: input.place === null ? null : placeLine(input.place),
  };
}

function useInfoContent(
  input: ViewerControlsInput,
  albums: readonly MenuItem[],
  driveHref: AppHref,
  archived: boolean,
): InfoContent {
  const photos = usePref(PREFS.photos);
  const addedBy = useAddedBy(input.item.addedByProfileId);
  const ask = useAskAbout(input.item);
  return {
    item: input.item,
    media: input.media,
    place: input.place,
    library: input.library,
    archived,
    addedBy,
    removeLocation: (photos.status === 'ready' ? photos.value : PREFS.photos.defaultValue)
      .removeLocationOutside,
    albums,
    driveHref,
    ask,
    onOpenItem: input.onOpen,
  };
}

export function useViewerControls(input: ViewerControlsInput): ViewerControls {
  const { item } = input;
  const actions = useViewerActions(item, () => {
    afterTrash(input);
  });
  const organise = useOrganiseActions();
  const edit = useEditEntry(item);
  const albums = albumMenuItems(useDriveAlbums('photos'), actions.addToAlbum, () => {
    openNewAlbum([item.id]);
  });
  const driveHref = openHrefOf(item, useDriveRoots());
  const archived = usePhotoArchived(item.id).data?.archived ?? null;
  const info = useInfoContent(input, albums, driveHref, archived === true);
  const more = moreMenuItems({
    onSave: () => {
      background(saveToDevice([item.id]), 'photos.save_to_device_failed');
    },
    onShowInDrive: () => {
      router.navigate(driveHref);
    },
    onTrash: actions.trash,
    onRevert: edit.onRevert,
    organise: organiseMenuItems({
      actions: organise,
      itemIds: [item.id],
      current: metaCurrentOf(input),
      archived,
      onGone: () => {
        afterTrash(input);
      },
    }),
  });
  return {
    actions,
    header: {
      starred: item.starred,
      infoOpen: input.infoOpen,
      busy: actions.busy,
      albums,
      more,
      onClose: input.onClose,
      onFavourite: actions.favourite,
      onShare: actions.shareLink,
      onInfo: input.onInfo,
      onTrash: actions.trash,
      edit,
    },
    info,
  };
}
