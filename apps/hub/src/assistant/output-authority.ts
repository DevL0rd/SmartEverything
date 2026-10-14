import { providerHubOsBan } from './engines/computer/tool-authority';
import { currentExecutionAuthorities, validateExecutionAuthority } from './execution-authority';
import { currentRequestSignal } from '../server/request-signal';
import type { Store } from '../store/store';
export function outputAuthority(store: Store, chatId: string): () => void {
  const authorities = [...currentExecutionAuthorities()];
  const signal = currentRequestSignal();
  return (): void => {
    signal?.throwIfAborted();
    store.aiChats.assertWorkAllowed(chatId);
    for (const authority of authorities) validateExecutionAuthority(store, authority);
  };
}
export function hubFileImportForbidden(): boolean {
  return (
    providerHubOsBan() || currentExecutionAuthorities().some((authority) => authority.hub_os_ban)
  );
}
