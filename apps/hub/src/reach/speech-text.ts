import type { Store } from '../store/store';

export function speechTextShown(store: Pick<Store, 'host'>, clientId: string): Promise<boolean> {
  return store.host.read('reachSpeechText', clientId);
}
