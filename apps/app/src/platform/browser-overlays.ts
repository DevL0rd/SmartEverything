import { createContext } from 'react';
import { ValueStore } from '../design/external-store';
export const browserCovered = new ValueStore(false);
export const browserCoverOwners = new ValueStore<readonly (symbol | null)[]>([]);
export const BrowserOverlayOwner = createContext<symbol | null>(null);
const covers = new Map<symbol, symbol | null>();
export function coverBrowser(owner: symbol | null = null): () => void {
  const id = Symbol();
  covers.set(id, owner);
  publishCovers();
  return (): void => {
    covers.delete(id);
    publishCovers();
  };
}
function publishCovers(): void {
  browserCovered.set(covers.size > 0);
  browserCoverOwners.set([...covers.values()]);
}
