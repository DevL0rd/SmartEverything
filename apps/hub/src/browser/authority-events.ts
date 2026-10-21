import type { Store } from '../store/store';

export function onBrowserAuthorityChange(store: Store, listener: () => void): () => void {
  return store.feed.subscribe((change) => {
    if (
      change.table === 'clients' ||
      (change.table === 'ai_chats' &&
        (change.operation === 'DELETE' || change.record?.deletion_state !== null))
    )
      listener();
  });
}
