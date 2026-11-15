import { useState, type ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { usePausable, ValueStore } from '../../../design/external-store';
import { addToAlbum } from '../library/actions';
import { AlbumSheet, type AlbumSheetRequest } from './album-sheet';
import { newDraft } from './rule-draft';

interface NewAlbumRequest {
  readonly sheet: AlbumSheetRequest;
  readonly itemIds: readonly string[];
}

const request = new ValueStore<NewAlbumRequest | null>(null);

export function openNewAlbum(itemIds: readonly string[]): void {
  request.set({ sheet: { draft: newDraft('manual', 'person'), album: null }, itemIds });
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
        background(addToAlbum(current.itemIds, album), 'photos.album_add_failed');
      }}
    />
  );
}
