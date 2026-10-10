import type { Rect } from '../components/anchor';
import { ValueStore } from '../design/external-store';

interface SearchOverlay {
  readonly open: boolean;
  readonly query: string;
  readonly anchor: Rect | null;
  readonly field: boolean;
}

const CLOSED: SearchOverlay = { open: false, query: '', anchor: null, field: false };

export const searchOverlay = new ValueStore<SearchOverlay>(CLOSED);

export function closeSearchOverlay(): void {
  searchOverlay.set(CLOSED);
}

export function setOverlayQuery(query: string): void {
  searchOverlay.set({ ...searchOverlay.get(), query });
}
