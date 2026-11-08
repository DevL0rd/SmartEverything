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
import type { HeaderAction } from '../../../components/page-header';
import { Skeleton } from '../../../components/skeleton';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { useLoaded, useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { deleteAlbum, loadedItems, usePhotoAlbum, usePhotoAlbumItems } from './album-data';
import { AlbumFeed } from './album-feed';
import { AlbumSheet, type AlbumSheetRequest } from './album-sheet';
import { AlbumStatsCard, RuleLine } from './album-stats';
import { draftOfAlbum } from './rule-draft';

const ALBUM_ID = z.uuid();

export function albumIdOf(raw: unknown): string | null {
  const parsed = ALBUM_ID.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

const CRUMBS = [{ label: 'Albums', href: href.photosPage('albums') }] as const;

function AlbumBody({
  album,
  onEdit,
}: {
  readonly album: DriveAlbum;
  readonly onEdit: () => void;
}): ReactNode {
  const pages = usePhotoAlbumItems(album.id);
  const live = useSyncStatus().status === 'live';
  const loaded = loadedItems(pages);
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
      {album.kind === 'smart' ? <RuleLine rule={album.rule} onEdit={onEdit} /> : null}
    </View>
  );
  return <AlbumFeed album={album} pages={pages} items={loaded.items} header={header} />;
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

export function actionsOf(
  album: DriveAlbum | null,
  edit: () => void,
  remove: () => void,
): readonly HeaderAction[] {
  if (album === null) return [];
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

export function AlbumScreen(): ReactNode {
  const albumId = albumIdOf(useLocalSearchParams()['albumId']);
  const album = usePhotoAlbum(albumId);
  const loaded = useLoaded();
  const mutation = useMutationState();
  const [request, setRequest] = useState<AlbumSheetRequest | null>(null);
  const edit = (): void => {
    if (album !== null) setRequest({ draft: draftOfAlbum(album), album });
  };
  const close = (): void => {
    setRequest(null);
  };
  return (
    <PhotosFrame
      active="albums"
      title={album?.title ?? 'Album'}
      breadcrumbs={CRUMBS}
      scroll={false}
      actions={actionsOf(album, edit, () => {
        if (album !== null) removeAlbum(album, mutation);
      })}
    >
      {album !== null ? <AlbumBody album={album} onEdit={edit} /> : null}
      {album === null && !loaded ? <Skeleton shape="block" className="h-45 w-full" /> : null}
      {album === null && loaded ? <Missing known={albumId !== null} /> : null}
      <AlbumSheet request={request} onClose={close} onSaved={close} />
    </PhotosFrame>
  );
}
