import { useState, type ReactNode } from 'react';
import { usePausable, ValueStore } from '../../../design/external-store';
import { notify } from '../../../components/toast-store';
import { photosText } from '../library/actions';
import { AlbumSheet, type AlbumSheetRequest } from './album-sheet';
import { newDraft } from './rule-draft';

interface NewAlbumRequest {
  readonly sheet: AlbumSheetRequest;
}

const request = new ValueStore<NewAlbumRequest | null>(null);

export function openNewAlbum(itemIds: readonly string[]): void {
  request.set({ sheet: { draft: newDraft('manual', 'person'), album: null, itemIds } });
}

function closeNewAlbum(): void {
  request.set(null);
}

export function useNewAlbumRequest(): NewAlbumRequest | null {
  return usePausable(request.subscribe, request.get);
}

export function NewAlbumHost(): ReactNode {
  const current = useNewAlbumRequest();
  const [used, setUsed] = useState(false);
  if (current !== null && !used) setUsed(true);
  if (!used) return null;
  return (
    <AlbumSheet
      request={current === null ? null : current.sheet}
      onClose={closeNewAlbum}
      onSaved={(album) => {
        if (current === null) throw new Error('An album was made with no new-album request open');
        closeNewAlbum();
        notify({ message: `Added ${photosText(current.sheet.itemIds.length)} to ${album.title}` });
      }}
    />
  );
}
