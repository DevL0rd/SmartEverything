import type { StoredAccount } from '../adapters/contract';
import { attachedDeviceOf } from '../adapters/samsung-tv/link';
import type { Store } from '../store/store';

export function mirrorDirectLink(store: Store, account: StoredAccount | null | undefined): void {
  store.televisionSettings.setDirectLink(attachedDeviceOf(account));
}
