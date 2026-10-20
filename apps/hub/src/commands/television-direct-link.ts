import type { StoredAccount } from '../adapters/contract';
import { directLinksOf } from '../adapters/samsung-tv/link';
import type { Inventory } from '../state/inventory';
import type { Store } from '../store/store';

export async function applyDirectLinks(
  store: Store,
  inventory: Pick<Inventory, 'remove'>,
  account: StoredAccount | null | undefined,
): Promise<void> {
  const links = directLinksOf(account);
  store.televisionSettings.setDirectLinks(links);
  await inventory.remove(
    'samsung_tv',
    links.map((link) => link.macAddress),
  );
}
