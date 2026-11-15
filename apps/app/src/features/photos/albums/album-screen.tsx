import { useState, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import type { DriveAlbum } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import type { MenuItem } from '../../../components/menu';
import { notify } from '../../../components/toast-store';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import {
  useMediaSelection,
  type MediaSelectionControls,
} from '../../../components/media-grid/selection';
import type { MediaTile } from '../../../components/media-grid/tiles';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Skeleton } from '../../../components/skeleton';
import { useAreaWidth } from '../../../design/size-class';
import { count } from '../../../format/number';
import { DRIVE_PREFIX } from '../../../queries/keys';
import { useMutationState, type MutationState } from '../../../store/mutation';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { useLoaded, useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { selectionFrameOf, type SelectionExtra } from '../library/library-selection';
import { useMediaActions, type MediaActions } from '../library/use-media-actions';
import {
  AlbumSharingBar,
  AlbumSheets,
  albumMenuOf,
  canAddToAlbum,
  useAlbumShare,
  useLeaveAlbum,
  type AlbumOpened,
  type AlbumShare,
} from '../sharing/album-bar';
import { nameOf } from '../sharing/model';
import { usePhotoSharing } from '../sharing/queries';
import {
  deleteAlbum,
  loadedItems,
  removableIds,
  removeFromAlbum,
  usePhotoAlbum,
  usePhotoAlbumItems,
} from './album-data';
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
  readonly media: MediaActions;
  readonly share: AlbumShare;
  readonly compact: boolean;
  readonly onOpen: (opened: AlbumOpened) => void;
}

function AlbumWaiting({ pages }: { readonly pages: AlbumView['pages'] }): ReactNode {
  const live = useSyncStatus().status === 'live';
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

function AlbumBody({
  album,
  view,
  onEdit,
}: {
  readonly album: DriveAlbum;
  readonly view: AlbumView;
  readonly onEdit: () => void;
}): ReactNode {
  const { pages, loaded, share } = view;
  if (loaded === null) return <AlbumWaiting pages={pages} />;
  const header = (
    <View className="gap-3 px-gutter pb-2">
      {album.itemCount === 0 ? null : <AlbumStatsCard album={album} loaded={loaded} />}
      <AlbumSharingBar
        album={album}
        items={loaded.items}
        complete={loaded.complete}
        share={share}
        compact={view.compact}
        onOpen={view.onOpen}
      />
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
      media={view.media}
      header={header}
      onAdd={
        canAddToAlbum(album, share)
          ? (): void => {
              view.onOpen('add');
            }
          : null
      }
    />
  );
}

function namesText(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}

export function deleteBody(memberNames: readonly string[]): string {
  if (memberNames.length === 0) {
    return 'Only the album goes. Its photos and videos stay in your library.';
  }
  return `${namesText(memberNames)} can no longer open it. The photos they added stay in their own libraries, and yours stay in your library.`;
}

function removeAlbum(
  album: DriveAlbum,
  mutation: MutationState,
  memberNames: readonly string[],
): void {
  background(
    confirm({
      title: `Delete ${album.title}?`,
      body: deleteBody(memberNames),
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
): readonly ShellAction[] {
  if (album === null || !ownsAlbum(album, me)) return [];
  const removeAction: ShellAction = {
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
      action={<Button label="Open albums" variant="tonal" href={href.photosPage('albums')} />}
    />
  );
}

function selectAction(controls: MediaSelectionControls): readonly ShellAction[] {
  return [{ icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin }];
}

function invalidateAlbumItems(client: QueryClient): void {
  background(
    client.invalidateQueries({ queryKey: [...DRIVE_PREFIX, 'album-items'] }),
    'photos.album_items.invalidate_failed',
  );
}

function photosText(total: number): string {
  return total === 1 ? '1 item' : `${count(total)} items`;
}

function joinedContributor(share: AlbumShare): boolean {
  return share.role === 'contributor' && !share.invited;
}

function useRemoveExtra(
  album: DriveAlbum,
  share: AlbumShare,
  loaded: ReturnType<typeof loadedItems>,
  controls: MediaSelectionControls,
): readonly SelectionExtra[] {
  const me = useActiveProfile()?.id ?? null;
  const mutation = useMutationState();
  const client = useQueryClient();
  const owner = ownsAlbum(album, me);
  if (album.kind === 'smart' || (!owner && !joinedContributor(share))) return [];
  const ids = removableIds(album, { owner, me, items: loaded?.items ?? [] }, [
    ...controls.selection.ids,
  ]);
  const usable = ids !== null && ids.length > 0;
  return [
    {
      id: 'album-remove',
      label: 'Remove from album',
      short: 'Remove',
      icon: 'minus',
      disabled: !usable || mutation.busy,
      onPress: (chosen): void => {
        mutation.run(() => removeFromAlbum(album, chosen), {
          failure: `Not everything left ${album.title}`,
          label: 'photos.album_remove',
          onDone: () => {
            invalidateAlbumItems(client);
            controls.clear();
            notify({ message: `Removed ${photosText(chosen.length)} from ${album.title}` });
          },
        });
      },
    },
  ];
}

function useOverflow(
  album: DriveAlbum,
  share: AlbumShare,
  compact: boolean,
  onOpen: (opened: AlbumOpened) => void,
): readonly MenuItem[] {
  const leaving = useLeaveAlbum(album);
  return compact ? albumMenuOf(album, share, onOpen, leaving.leave) : [];
}

function useAlbumView(album: DriveAlbum): AlbumView & { readonly opened: AlbumOpened } {
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const pages = usePhotoAlbumItems(album.id);
  const loaded = loadedItems(pages);
  const tiles = loaded === null ? [] : tilesOfItems(loaded.items);
  const controls = useMediaSelection(tiles.map((tile) => tile.id));
  const media = useMediaActions();
  const share = useAlbumShare(album);
  const [opened, setOpened] = useState<AlbumOpened>(null);
  return { pages, loaded, tiles, controls, media, share, compact, opened, onOpen: setOpened };
}

function AlbumPage({
  album,
  actions,
  onEdit,
  children,
}: {
  readonly album: DriveAlbum;
  readonly actions: readonly ShellAction[];
  readonly onEdit: () => void;
  readonly children: ReactNode;
}): ReactNode {
  const view = useAlbumView(album);
  const { compact, tiles, controls, media, share } = view;
  const extras = useRemoveExtra(album, share, view.loaded, controls);
  const frame = selectionFrameOf(compact, { controls, tiles, media, extras });
  const overflow = useOverflow(album, share, compact, view.onOpen);
  const active = controls.selection.active;
  return (
    <PhotosFrame
      active="albums"
      title={album.title}
      breadcrumbs={CRUMBS}
      scroll={false}
      actions={active ? [] : [...actions, ...(tiles.length === 0 ? [] : selectAction(controls))]}
      overflow={active ? [] : overflow}
      selection={frame.selection}
      footer={frame.footer}
    >
      <AlbumBody album={album} view={view} onEdit={onEdit} />
      <AlbumSheets
        album={album}
        share={share}
        opened={view.opened}
        onClose={() => {
          view.onOpen(null);
        }}
      />
      {children}
    </PhotosFrame>
  );
}

function useMemberNames(albumId: string | null): readonly string[] {
  const people = useProfiles();
  const shared = usePhotoSharing().data?.albums.find((entry) => entry.albumId === albumId);
  return (shared?.members ?? []).map((member) => nameOf(member.profileId, people, null));
}

export function AlbumScreen(): ReactNode {
  const albumId = albumIdOf(useLocalSearchParams()['albumId']);
  const album = usePhotoAlbum(albumId);
  const loaded = useLoaded();
  const mutation = useMutationState();
  const me = useActiveProfile()?.id ?? null;
  const [request, setRequest] = useState<AlbumSheetRequest | null>(null);
  const memberNames = useMemberNames(albumId);
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
          removeAlbum(album, mutation, memberNames);
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
