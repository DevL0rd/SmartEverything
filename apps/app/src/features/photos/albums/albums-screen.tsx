import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { DriveAlbum } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { CardGrid } from '../../../components/card-grid';
import { ChoiceChip } from '../../../components/choice-chip';
import { EmptyState } from '../../../components/empty-state';
import { FlatChoice } from '../../../components/flat-choice';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { useLoaded, useSyncStatus } from '../../../store/selectors';
import { ChipRow } from '../../../components/chip-row';
import { shellLayoutOf } from '../../../components/page-shell/layout';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoInsights, usePhotoTrips } from '../data';
import { OfflineBanner } from '../sharing/offline-banner';
import { usePhotoAlbums } from './album-data';
import { AlbumSheet, type AlbumSheetRequest } from './album-sheet';
import { AlbumTile } from './album-tile';
import { ALBUM_SORTS, albumGroups, albumsLine, type AlbumSort } from './model';
import { newDraft } from './rule-draft';
import { startersOf, type Starter } from './starters';

const WIDE_COLUMNS_FROM = 1200;

type Open = (request: AlbumSheetRequest) => void;

function columnsOf(area: number): number {
  if (shellLayoutOf(area) === 'compact') return 1;
  return area >= WIDE_COLUMNS_FROM ? 3 : 2;
}

function useStarterMenu(starter: Starter, onOpen: Open): ReturnType<typeof useAnchoredMenu> {
  const items: readonly MenuItem[] = starter.choices.map((choice) => ({
    id: choice.key,
    label: choice.label,
    description: choice.description,
    icon: starter.icon,
    onPress: (): void => {
      onOpen({ draft: choice.draft, album: null });
    },
  }));
  return useAnchoredMenu(items, `Start a smart album from ${starter.title.toLowerCase()}`);
}

function StarterCard({
  starter,
  onOpen,
}: {
  readonly starter: Starter;
  readonly onOpen: Open;
}): ReactNode {
  const { ref, open, menu } = useStarterMenu(starter, onOpen);
  return (
    <View ref={ref} collapsable={false} className="min-w-60 flex-1">
      <Interactive
        label={`Start a smart album from ${starter.title.toLowerCase()}, ${starter.line}`}
        onPress={open}
        className="min-h-14 flex-row items-center gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 px-3 py-2"
        layerClassName="rounded-lg"
      >
        <View className="size-10 items-center justify-center rounded-md bg-primary-container">
          <Icon name={starter.icon} size={20} tone="primary" />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="label">{starter.title}</Text>
          <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
            {starter.line}
          </Text>
        </View>
        <Icon name="chevronDown" size={16} tone="variant" />
      </Interactive>
      {menu}
    </View>
  );
}

function StarterChip({
  starter,
  onOpen,
}: {
  readonly starter: Starter;
  readonly onOpen: Open;
}): ReactNode {
  const { ref, open, menu } = useStarterMenu(starter, onOpen);
  return (
    <View ref={ref} collapsable={false}>
      <FlatChoice
        label={starter.title}
        spoken={`${starter.title}, ${starter.line}`}
        icon={starter.icon}
        trailing="chevronDown"
        active={false}
        menu
        role="button"
        onPress={open}
      />
      {menu}
    </View>
  );
}

function Starters({
  compact,
  onOpen,
}: {
  readonly compact: boolean;
  readonly onOpen: Open;
}): ReactNode {
  const starters = startersOf(usePhotoTrips().data, usePhotoInsights('all_time').data?.cameras);
  if (starters.length === 0) return null;
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="title-3">Start a smart album from</Text>
        {compact ? null : (
          <Text variant="footnote" tone="variant">
            It keeps adding new photos that match
          </Text>
        )}
      </View>
      {compact ? (
        <ChipRow label="Smart album starters">
          {starters.map((starter) => (
            <StarterChip key={starter.id} starter={starter} onOpen={onOpen} />
          ))}
        </ChipRow>
      ) : (
        <View className="flex-row flex-wrap gap-3">
          {starters.map((starter) => (
            <StarterCard key={starter.id} starter={starter} onOpen={onOpen} />
          ))}
        </View>
      )}
    </View>
  );
}

function AlbumSection({
  title,
  albums,
  note,
  columns,
  trailing,
}: {
  readonly title: string;
  readonly note: string | null;
  readonly albums: readonly DriveAlbum[];
  readonly columns: number;
  readonly trailing: ReactNode;
}): ReactNode {
  if (albums.length === 0) return null;
  return (
    <View className="gap-2">
      <View className="min-h-10 flex-row items-center gap-3">
        <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
          <Text variant="title-3">{title}</Text>
          {note === null ? null : (
            <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 shrink">
              {note}
            </Text>
          )}
        </View>
        {trailing}
      </View>
      <CardGrid
        items={albums}
        columns={columns}
        keyOf={(album) => album.id}
        render={(album) => <AlbumTile album={album} look={columns > 1 ? 'card' : 'row'} />}
      />
    </View>
  );
}

function AlbumLists({ albums }: { readonly albums: readonly DriveAlbum[] }): ReactNode {
  const [sort, setSort] = useState<AlbumSort>('recent');
  const columns = columnsOf(useAreaWidth());
  const groups = albumGroups(albums, sort);
  const sortChip = (
    <ChoiceChip
      label="Sort albums"
      options={ALBUM_SORTS}
      value={sort}
      all="recent"
      onChange={setSort}
    />
  );
  return (
    <>
      <AlbumSection
        title="Smart albums"
        note={null}
        albums={groups.smart}
        columns={columns}
        trailing={groups.manual.length === 0 ? sortChip : null}
      />
      <AlbumSection
        title="Albums"
        note={null}
        albums={groups.manual}
        columns={columns}
        trailing={sortChip}
      />
    </>
  );
}

const LOADING_TILES = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

function LoadingTile({ card }: { readonly card: boolean }): ReactNode {
  return (
    <View
      className={
        card
          ? 'overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1'
          : 'flex-row items-center gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 p-3'
      }
    >
      <Skeleton
        shape="block"
        className={card ? 'h-30 w-full rounded-none' : 'h-16 w-27.5 rounded-sm'}
      />
      <View className={card ? 'gap-1.5 px-3 py-2.5' : 'min-w-0 flex-1 gap-1.5'}>
        <Skeleton className="w-3/5" />
        <Skeleton className="w-2/5" />
      </View>
    </View>
  );
}

function AlbumsLoading(): ReactNode {
  const columns = columnsOf(useAreaWidth());
  return (
    <View aria-busy className="gap-2">
      <View className="min-h-10 justify-center">
        <Skeleton className="w-32" />
      </View>
      <CardGrid
        items={LOADING_TILES.slice(0, columns > 1 ? 6 : 4)}
        columns={columns}
        keyOf={(key) => key}
        render={() => <LoadingTile card={columns > 1} />}
      />
    </View>
  );
}

function AlbumsBody({
  albums,
  loaded,
  live,
  onNew,
}: {
  readonly albums: readonly DriveAlbum[];
  readonly loaded: boolean;
  readonly live: boolean;
  readonly onNew: () => void;
}): ReactNode {
  if (!loaded) return <AlbumsLoading />;
  if (albums.length > 0) return <AlbumLists albums={albums} />;
  return (
    <EmptyState
      icon="layers"
      title="No albums yet"
      body="Albums gather photos you pick. Smart albums keep adding new photos that match their rules."
      action={
        <Button label="New album" icon="plus" variant="tonal" disabled={!live} onPress={onNew} />
      }
    />
  );
}

export function albumsActions(
  openSmart: () => void,
  openNew: () => void,
  live: boolean,
): readonly ShellAction[] {
  return [
    { icon: 'sparkles', label: 'New smart album', disabled: !live, onPress: openSmart },
    { icon: 'plus', label: 'New album', primary: true, disabled: !live, onPress: openNew },
  ];
}

export function AlbumsScreen(): ReactNode {
  const albums = usePhotoAlbums();
  const loaded = useLoaded();
  const live = useSyncStatus().status === 'live';
  const compact = shellLayoutOf(useAreaWidth()) === 'compact';
  const [request, setRequest] = useState<AlbumSheetRequest | null>(null);
  const openNew = (): void => {
    setRequest({ draft: newDraft('manual', 'person'), album: null });
  };
  const openSmart = (): void => {
    setRequest({ draft: newDraft('smart', 'person'), album: null });
  };
  return (
    <PhotosFrame
      active="albums"
      {...(loaded && albums.length > 0 ? { subtitle: albumsLine(albums) } : {})}
      actions={albumsActions(openSmart, openNew, live)}
      banner={live ? null : <OfflineBanner />}
    >
      <View className="gap-section-gap">
        {live ? <Starters compact={compact} onOpen={setRequest} /> : null}
        <AlbumsBody albums={albums} loaded={loaded} live={live} onNew={openNew} />
      </View>
      <AlbumSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
        onSaved={(album, created) => {
          setRequest(null);
          if (created) router.push(href.photosAlbum(album.id));
        }}
      />
    </PhotosFrame>
  );
}
