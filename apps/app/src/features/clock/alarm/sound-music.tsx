import type { DriveItem } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { SearchField } from '../../../components/search-field';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import {
  flattenPages,
  useDriveAlbumItems,
  useDriveAlbums,
  useDriveFolderPages,
  useDriveSearch,
  useMyDrive,
  useSharedDrive,
  type DrivePages,
} from '../../drive';
import type { SoundTabProps } from './sound-radio';
import {
  crumbKeyOf,
  fileSound,
  isChosen,
  musicItemsOf,
  openedCrumbs,
  playlistIdOf,
  playlistSound,
  radioQueryOf,
  SOUND_COPY,
  type MusicCrumb,
  type SoundUse,
} from './sound-model';

const BY_NAME = { field: 'name', direction: 'asc' } as const;

const MUSIC_KINDS = ['audio', 'folder'] as const;

interface Browse extends SoundTabProps {
  readonly onOpen: (item: DriveItem) => void;
}

function ItemRow({
  item,
  sound,
  onPick,
  onOpen,
}: Browse & { readonly item: DriveItem }): ReactNode {
  if (item.kind === 'folder') {
    return (
      <ListRow
        title={item.name}
        subtitle={`${String(item.childCount)} inside`}
        icon="folder"
        chevron
        selected={isChosen(sound, playlistSound(item.id, false))}
        onPress={() => {
          onOpen(item);
        }}
      />
    );
  }
  const candidate = fileSound(item.id);
  return (
    <ListRow
      title={item.name}
      icon="music"
      selected={isChosen(sound, candidate)}
      onPress={() => {
        onPick(candidate);
      }}
    />
  );
}

function Pages<P extends { readonly next: string | null }>({
  pages,
  itemsOf,
  browse,
  empty,
}: {
  readonly pages: DrivePages<P>;
  readonly itemsOf: (page: P) => readonly DriveItem[];
  readonly browse: Browse;
  readonly empty: ReactNode;
}): ReactNode {
  if (pages.data === undefined) {
    return pages.isError ? (
      <EmptyState
        icon="warning"
        title="Drive did not answer"
        body="Try again in a moment."
        compact
      />
    ) : (
      <ActivityIndicator
        accessibilityLabel="Loading"
        className="py-8"
        colorClassName="accent-primary"
      />
    );
  }
  const items = musicItemsOf(flattenPages(pages.data, itemsOf));
  if (items.length === 0) return empty;
  return (
    <View className="gap-2">
      <List>
        {items.map((item) => (
          <ItemRow key={item.id} {...browse} item={item} />
        ))}
      </List>
      {pages.hasNextPage ? (
        <Button
          label="Show more"
          variant="outlined"
          loading={pages.isFetchingNextPage}
          onPress={() => {
            background(pages.fetchNextPage(), 'clock.music_page_failed');
          }}
        />
      ) : null}
    </View>
  );
}

function PlaylistCard({
  crumb,
  playlistId,
  sound,
  use,
  onPick,
}: SoundTabProps & { readonly crumb: MusicCrumb; readonly playlistId: string }): ReactNode {
  const [shuffle, setShuffle] = useState(sound?.kind === 'playlist' ? sound.shuffle : true);
  const active =
    sound?.kind === 'playlist' && sound.item_id === playlistId && sound.shuffle === shuffle;
  const copy = SOUND_COPY[use];
  const album = crumb.kind === 'album';
  const pick = album ? copy.albumPick : copy.folderPick;
  return (
    <View className="gap-2 rounded-md bg-surface-2 p-3">
      <SwitchRow title="Shuffle" icon="shuffle" compact value={shuffle} onChange={setShuffle} />
      <Button
        label={active ? (album ? copy.albumActive : copy.folderActive) : pick}
        icon="music"
        variant="tonal"
        disabled={active}
        onPress={() => {
          onPick(playlistSound(playlistId, shuffle));
        }}
      />
      <Text variant="caption" tone="variant">
        {album ? copy.albumNote : copy.folderNote}
      </Text>
    </View>
  );
}

const NO_SONGS = {
  folder: 'Add audio files to this folder in Drive.',
  album: 'Add audio files to this album in Drive.',
} as const;

function CrumbPages({
  crumb,
  browse,
}: {
  readonly crumb: MusicCrumb;
  readonly browse: Browse;
}): ReactNode {
  const empty = (
    <EmptyState icon="music" title="No songs here" body={NO_SONGS[crumb.kind]} compact />
  );
  return crumb.kind === 'album' ? (
    <AlbumPages albumId={crumb.albumId} browse={browse} empty={empty} />
  ) : (
    <FolderPages rootId={crumb.rootId} folderId={crumb.folderId} browse={browse} empty={empty} />
  );
}

function AlbumPages({
  albumId,
  browse,
  empty,
}: {
  readonly albumId: string;
  readonly browse: Browse;
  readonly empty: ReactNode;
}): ReactNode {
  const pages = useDriveAlbumItems(albumId);
  return <Pages pages={pages} itemsOf={(page) => page.items} browse={browse} empty={empty} />;
}

function FolderPages({
  rootId,
  folderId,
  browse,
  empty,
}: {
  readonly rootId: string;
  readonly folderId: string | null;
  readonly browse: Browse;
  readonly empty: ReactNode;
}): ReactNode {
  const pages = useDriveFolderPages(rootId, folderId, BY_NAME);
  return <Pages pages={pages} itemsOf={(page) => page.items} browse={browse} empty={empty} />;
}

function Folder({
  crumb,
  browse,
}: {
  readonly crumb: MusicCrumb;
  readonly browse: Browse;
}): ReactNode {
  const playlistId = playlistIdOf(crumb);
  return (
    <View className="gap-3">
      {playlistId === null ? null : (
        <PlaylistCard
          crumb={crumb}
          playlistId={playlistId}
          sound={browse.sound}
          use={browse.use}
          onPick={browse.onPick}
        />
      )}
      <CrumbPages crumb={crumb} browse={browse} />
    </View>
  );
}

function Search({ text, browse }: { readonly text: string; readonly browse: Browse }): ReactNode {
  const pages = useDriveSearch(
    {
      text,
      match: 'names',
      rootId: null,
      folderId: null,
      kinds: MUSIC_KINDS,
      starred: null,
      duration: null,
      taken: null,
      sort: BY_NAME,
    },
    true,
  );
  return (
    <Pages
      pages={pages}
      itemsOf={(page) => page.items}
      browse={browse}
      empty={
        <EmptyState
          icon="search"
          title={`Nothing called ${text}`}
          body="Try another name."
          compact
        />
      }
    />
  );
}

function Albums({ onOpen }: { readonly onOpen: (crumb: MusicCrumb) => void }): ReactNode {
  const albums = useDriveAlbums('drive');
  if (albums.length === 0) return null;
  return (
    <List title="Albums">
      {albums.map((album) => (
        <ListRow
          key={album.id}
          title={album.title}
          subtitle={`${String(album.itemCount)} inside`}
          icon="layers"
          chevron
          onPress={() => {
            onOpen({ kind: 'album', albumId: album.id, name: album.title });
          }}
        />
      ))}
    </List>
  );
}

function Roots({
  use,
  onOpen,
}: {
  readonly use: SoundUse;
  readonly onOpen: (crumb: MusicCrumb) => void;
}): ReactNode {
  const mine = useMyDrive();
  const shared = useSharedDrive();
  const roots = [
    ...(mine === null ? [] : [{ root: mine, name: 'My Drive' }]),
    ...(shared === null ? [] : [{ root: shared, name: 'Shared drive' }]),
  ];
  if (roots.length === 0) {
    return <EmptyState icon="folder" title="No drive yet" body={SOUND_COPY[use].noDrive} compact />;
  }
  return (
    <View className="gap-3">
      <List>
        {roots.map(({ root, name }) => (
          <ListRow
            key={root.id}
            title={name}
            icon="folder"
            chevron
            onPress={() => {
              onOpen({ kind: 'folder', rootId: root.id, folderId: null, name });
            }}
          />
        ))}
      </List>
      <Albums onOpen={onOpen} />
    </View>
  );
}

function Trail({
  crumbs,
  onBack,
}: {
  readonly crumbs: readonly MusicCrumb[];
  readonly onBack: () => void;
}): ReactNode {
  const last = crumbs.at(-1);
  if (last === undefined) return null;
  return (
    <View className="flex-row items-center gap-2">
      <Button label="Back" icon="chevronLeft" variant="text" onPress={onBack} />
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {last.name}
      </Text>
    </View>
  );
}

export function MusicTab(props: SoundTabProps): ReactNode {
  const [text, setText] = useState('');
  const [crumbs, setCrumbs] = useState<readonly MusicCrumb[]>([]);
  const query = radioQueryOf(text);
  const browse: Browse = {
    ...props,
    onOpen: (item) => {
      setText('');
      setCrumbs(openedCrumbs(crumbs, item));
    },
  };
  const last = crumbs.at(-1);
  return (
    <View className="gap-3">
      <SearchField
        value={text}
        onChange={setText}
        placeholder="Search songs and folders"
        icon="music"
        variant="field"
      />
      {query === null ? (
        <Trail
          crumbs={crumbs}
          onBack={() => {
            setCrumbs(crumbs.slice(0, -1));
          }}
        />
      ) : null}
      {query !== null ? (
        <Search text={query} browse={browse} />
      ) : last === undefined ? (
        <Roots
          use={props.use}
          onOpen={(crumb) => {
            setCrumbs([crumb]);
          }}
        />
      ) : (
        <Folder key={crumbKeyOf(last)} crumb={last} browse={browse} />
      )}
    </View>
  );
}
