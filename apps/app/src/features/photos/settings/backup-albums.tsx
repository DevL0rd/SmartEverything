import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { PhotosBackupPref } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { PREFS, usePref } from '../../../store/prefs';
import { ALL_PHONE_MEDIA, albumsText } from './model';
import { PHONE_ALBUMS_KEY, listPhoneAlbums, type PhoneAlbum } from './phone-albums';

export function toggled(chosen: readonly string[], albumId: string, on: boolean): string[] {
  const rest = chosen.filter((id) => id !== albumId);
  return on ? [...rest, albumId] : rest;
}

function AlbumList({
  albums,
  pref,
  onSave,
}: {
  readonly albums: readonly PhoneAlbum[];
  readonly pref: PhotosBackupPref;
  readonly onSave: (next: PhotosBackupPref) => void;
}): ReactNode {
  if (albums.length === 0) {
    return (
      <EmptyState
        compact
        icon="layers"
        title="No albums on this phone"
        body="Backup includes everything on this phone."
      />
    );
  }
  return albums.map((album) => (
    <Checkbox
      key={album.id}
      label={album.title}
      checked={pref.albumIds.includes(album.id)}
      onChange={(on) => {
        onSave({ ...pref, albumIds: toggled(pref.albumIds, album.id, on) });
      }}
    />
  ));
}

function AlbumChoices({
  pref,
  onSave,
}: {
  readonly pref: PhotosBackupPref;
  readonly onSave: (next: PhotosBackupPref) => void;
}): ReactNode {
  const albums = useScreenQuery({ queryKey: PHONE_ALBUMS_KEY, queryFn: listPhoneAlbums });
  return (
    <View className="gap-1">
      <Checkbox
        label={ALL_PHONE_MEDIA}
        description="New albums are backed up too."
        checked={pref.albumIds.length === 0}
        onChange={(on) => {
          if (on) onSave({ ...pref, albumIds: [] });
        }}
      />
      {albums.data === undefined ? null : (
        <AlbumList albums={albums.data} pref={pref} onSave={onSave} />
      )}
      {albums.isPending ? <Skeleton shape="line" className="h-10" /> : null}
      {albums.isError ? (
        <ErrorState
          error={albums.error}
          retry={() => {
            background(albums.refetch(), 'photos_settings.phone_albums_refetch_failed');
          }}
        />
      ) : null}
    </View>
  );
}

export function BackupAlbumsRow(): ReactNode {
  const pref = usePref(PREFS.photosBackup);
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  if (pref.status !== 'ready') {
    return <ListRow title="Albums and folders" icon="layers" disabled />;
  }
  const close = (): void => {
    setOpen(false);
  };
  return (
    <>
      <ListRow
        title="Albums and folders"
        icon="layers"
        pressRef={opener}
        value={albumsText(pref.value.albumIds)}
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <Sheet
          subpage={{ opener }}
          open
          onClose={close}
          title="Albums and folders"
          detents={['half', 'full']}
          footer={<Button label="Done" onPress={close} />}
        >
          <AlbumChoices pref={pref.value} onSave={pref.set} />
        </Sheet>
      ) : null}
    </>
  );
}
