import { router } from 'expo-router';
import type { MediaInfo, PhotoPlace } from '@smarteverything/domain';
import type { AppHref } from '../../../components/app-href';
import type { MediaTile } from '../../../components/media-grid/tiles';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { downloadFile } from '../../../platform/file-actions';
import { usePref, PREFS } from '../../../store/prefs';
import { driveLinks, openHrefOf, useDriveAlbums, useDriveRoots } from '../../drive';
import { useViewerActions, type ViewerActions } from './actions';
import { useAddedBy } from './added-by';
import { useAskAbout } from './ask';
import type { HeaderControls } from './header';
import type { InfoContent } from './info-rows';
import type { MediaItem } from './info-model';
import { albumMenuItems, moreMenuItems } from './menus';
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

function downloadFailed(item: MediaItem, error: unknown): void {
  notify({ message: `${item.name} could not be downloaded`, error, tone: 'critical' });
}

function download(item: MediaItem): void {
  driveLinks
    .resolve(item.id, item.rev, 'file')
    .then((url) => {
      if (url === null) downloadFailed(item, new Error('The hub gave no link for the original'));
      else downloadFile(url, item.name);
    })
    .catch((error: unknown) => {
      downloadFailed(item, error);
    });
}

function afterTrash(input: ViewerControlsInput): void {
  const landing: MediaTile | null = input.sequence.next ?? input.sequence.previous;
  if (landing === null) input.onClose();
  else input.onOpen(landing.id);
}

function useInfoContent(
  input: ViewerControlsInput,
  albums: readonly MenuItem[],
  driveHref: AppHref,
): InfoContent {
  const photos = usePref(PREFS.photos);
  const addedBy = useAddedBy(input.item.addedByProfileId);
  const ask = useAskAbout(input.item);
  return {
    item: input.item,
    media: input.media,
    place: input.place,
    library: input.library,
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
  const albums = albumMenuItems(useDriveAlbums('photos'), actions.addToAlbum);
  const driveHref = openHrefOf(item, useDriveRoots());
  const info = useInfoContent(input, albums, driveHref);
  const more = moreMenuItems({
    onDownload: () => {
      download(item);
    },
    onShowInDrive: () => {
      router.navigate(driveHref);
    },
    onTrash: actions.trash,
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
    },
    info,
  };
}
