import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { PhotosPref } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { Sheet } from '../../../components/sheet';
import { PREFS, usePref } from '../../../store/prefs';
import { useDriveAlbums } from '../../nas/data/tables';
import { excludedText } from './model';

export function toggled(excluded: readonly string[], albumId: string, out: boolean): string[] {
  const rest = excluded.filter((id) => id !== albumId);
  return out ? [...rest, albumId] : rest;
}

function AlbumChoices({
  pref,
  onSave,
}: {
  readonly pref: PhotosPref;
  readonly onSave: (next: PhotosPref) => void;
}): ReactNode {
  const albums = useDriveAlbums('photos');
  if (albums.length === 0) {
    return (
      <EmptyState
        compact
        icon="layers"
        title="No albums yet"
        body="Albums you make in Photos show up here."
      />
    );
  }
  return (
    <View className="gap-1">
      {albums.map((album) => (
        <Checkbox
          key={album.id}
          label={album.title}
          checked={pref.excludedAlbumIds.includes(album.id)}
          onChange={(out) => {
            onSave({ ...pref, excludedAlbumIds: toggled(pref.excludedAlbumIds, album.id, out) });
          }}
        />
      ))}
    </View>
  );
}

export function ExcludedAlbumsRow(): ReactNode {
  const pref = usePref(PREFS.photos);
  const albums = useDriveAlbums('photos');
  const [open, setOpen] = useState(false);
  const opener = useRef<View>(null);
  if (pref.status !== 'ready') {
    return <ListRow title="Leave out of memories" icon="ban" disabled />;
  }
  const close = (): void => {
    setOpen(false);
  };
  return (
    <>
      <ListRow
        title="Leave out of memories"
        icon="ban"
        pressRef={opener}
        value={excludedText(pref.value.excludedAlbumIds, albums)}
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
          title="Leave out of memories"
          detents={['half', 'full']}
          footer={<Button label="Done" onPress={close} />}
        >
          <AlbumChoices pref={pref.value} onSave={pref.set} />
        </Sheet>
      ) : null}
    </>
  );
}
