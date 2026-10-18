import { openMdns } from '../../../network/mdns';

export function watchAibiAddress(
  changed: () => void,
  failed: (cause: unknown) => void,
): Promise<() => Promise<void>> {
  const mdns = openMdns(failed);
  const unwatch = mdns.onNetworkChange(changed);
  return Promise.resolve(async (): Promise<void> => {
    unwatch();
    await mdns.close();
  });
}
