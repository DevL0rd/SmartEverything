import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import type { DriveAlbum } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { libraryLayoutOf } from '../../../components/library-frame/sections';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import type { MediaTile } from '../../../components/media-grid/tiles';
import type { HeaderAction } from '../../../components/page-header';
import { Skeleton } from '../../../components/skeleton';
import { useAreaWidth } from '../../../design/size-class';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { useActiveProfile } from '../../../store/people';
import { useLoaded, useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { selectionFrameOf } from '../library/library-selection';
import { useMediaActions } from '../library/use-media-actions';
import { AlbumSharingBar } from '../sharing/album-bar';
import { deleteAlbum, loadedItems, usePhotoAlbum, usePhotoAlbumItems } from './album-data';
import { AlbumFeed } from './album-feed';
import { tilesOfItems } from './album-items';
import { AlbumSheet, type AlbumSheetRequest } from './album-sheet';
import { AlbumStatsCard, RuleLine } from './album-stats';
import { draftOfAlbum } from './rule-draft';

const ALBUM_ID = z.uuid();

export function albumIdOf(raw: unknown): string | null {
  const parsed = ALBUM_ID.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const CRUMBS = [{ label: 'Albums', href: href.photosPage('albums') }] as const;

interface AlbumView {
  readonly pages: ReturnType<typeof usePhotoAlbumItems>;
  readonly loaded: ReturnType<typeof loadedItems>;
  readonly tiles: readonly MediaTile[];
  readonly controls: MediaSelectionControls;
}

function AlbumBody({
  album,
  view,
  onEdit,
}: {
  readonly album: DriveAlbum;
  readonly view: AlbumView;
  readonly onEdit: () => void;
}): ReactNode {
  const { pages, loaded } = view;
  const live = useSyncStatus().status === 'live';
  if (loaded === null) {
    if (!pages.isError) return <Skeleton shape="block" className="h-45 w-full" />;
    return live ? (
      <ErrorState
        error={pages.error}
        page
        retry={() => {
          background(pages.refetch(), 'photos.album_refetch_failed');
        }}
      />
    ) : (
      <EmptyState
        icon="wifiOff"
        title="The hub is offline"
        body="This album opens when the hub reconnects. Its photos stay on the hub as they are."
      />
    );
  }
  const header = (
    <View className="gap-3 px-gutter pb-2">
      <AlbumStatsCard album={album} loaded={loaded} />
      <AlbumSharingBar album={album} items={loaded.items} complete={loaded.complete} />
      {album.kind === 'smart' ? <RuleLine rule={album.rule} onEdit={onEdit} /> : null}
    </View>
  );
  return (
    <AlbumFeed
      album={album}
      pages={pages}
      items={loaded.items}
      tiles={view.tiles}
      controls={view.controls}
      header={header}
    />
  );
}

function removeAlbum(album: DriveAlbum, mutation: MutationState): void {
  background(
    confirm({
      title: `Delete ${album.title}?`,
      body: 'Only the album goes. Its photos and videos stay in your library.',
      confirmLabel: 'Delete album',
      tone: 'destructive',
    }).then((accepted) => {
      if (!accepted) return;
      mutation.run(() => deleteAlbum(album), {
        failure: 'The album was not deleted',
        label: 'photos.album_delete',
        onDone: () => {
          router.replace(href.photosPage('albums'));
        },
      });
    }),
    'photos.album_delete_confirm_failed',
  );
}

export function ownsAlbum(album: DriveAlbum, me: string | null): boolean {
  return album.scope === 'home' || album.ownerProfileId === me;
}

export function actionsOf(
  album: DriveAlbum | null,
  me: string | null,
  edit: () => void,
  remove: () => void,
): readonly HeaderAction[] {
  if (album === null || !ownsAlbum(album, me)) return [];
  const removeAction: HeaderAction = {
    icon: 'trash',
    label: 'Delete album',
    iconOnly: true,
    onPress: remove,
  };
  if (album.kind === 'smart') return [removeAction];
  return [{ icon: 'pencil', label: 'Rename', onPress: edit }, removeAction];
}

function Missing({ known }: { readonly known: boolean }): ReactNode {
  return (
    <EmptyState
      icon="layers"
      title={known ? 'This album is gone' : 'This album is not known'}
      body={
        known ? 'It was deleted or is no longer shared with you.' : 'Open an album from Albums.'
      }
      action={<Button label="Open Albums" variant="tonal" href={href.photosPage('albums')} />}
    />
  );
}

function selectAction(controls: MediaSelectionControls): readonly HeaderAction[] {
  return [{ icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin }];
}

function AlbumPage({
  album,
  actions,
  onEdit,
  children,
}: {
  readonly album: DriveAlbum;
  readonly actions: readonly HeaderAction[];
  readonly onEdit: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const compact = libraryLayoutOf(useAreaWidth()) === 'compact';
  const pages = usePhotoAlbumItems(album.id);
  const loaded = loadedItems(pages);
  const tiles = loaded === null ? [] : tilesOfItems(loaded.items);
  const controls = useMediaSelection(tiles.map((tile) => tile.id));
  const media = useMediaActions();
  const frame = selectionFrameOf(compact, { controls, tiles, media });
  const active = controls.selection.active;
  return (
    <PhotosFrame
      active="albums"
      title={album.title}
      breadcrumbs={CRUMBS}
      scroll={false}
      actions={active ? [] : [...actions, ...(tiles.length === 0 ? [] : selectAction(controls))]}
      selection={frame.selection}
      footer={frame.footer}
    >
      <AlbumBody album={album} view={{ pages, loaded, tiles, controls }} onEdit={onEdit} />
      {children}
    </PhotosFrame>
  );
}

export function AlbumScreen(): ReactNode {
  const albumId = albumIdOf(useLocalSearchParams()['albumId']);
  const album = usePhotoAlbum(albumId);
  const loaded = useLoaded();
  const mutation = useMutationState();
  const me = useActiveProfile()?.id ?? null;
  const [request, setRequest] = useState<AlbumSheetRequest | null>(null);
  const edit = (): void => {
    if (album !== null) setRequest({ draft: draftOfAlbum(album), album });
  };
  const close = (): void => {
    setRequest(null);
  };
  const sheet = <AlbumSheet request={request} onClose={close} onSaved={close} />;
  if (album !== null) {
    return (
      <AlbumPage
        album={album}
        actions={actionsOf(album, me, edit, () => {
          removeAlbum(album, mutation);
        })}
        onEdit={edit}
      >
        {sheet}
      </AlbumPage>
    );
  }
  return (
    <PhotosFrame active="albums" title="Album" breadcrumbs={CRUMBS} scroll={false}>
      {loaded ? (
        <Missing known={albumId !== null} />
      ) : (
        <Skeleton shape="block" className="h-45 w-full" />
      )}
      {sheet}
    </PhotosFrame>
  );
}
