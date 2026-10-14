import { NATIVE_HUB_GUEST_PATH } from '@smarteverything/domain';
import { HubTransportError } from './policy';

export function nodeHarnessFetch(
  node: { readonly hub_url: string; readonly node_token: string },
  fetcher: typeof fetch = fetch,
): typeof fetch {
  const origin = new URL(node.hub_url).origin;
  return (input, init): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== origin) return fetcher(request);
    if (
      request.method !== 'POST' ||
      !NATIVE_HUB_GUEST_PATH.safeParse(url.pathname).success ||
      url.search !== '' ||
      url.hash !== '' ||
      request.headers.get('authorization') !== `Bearer ${node.node_token}`
    )
      throw new HubTransportError(
        'Own harness hub request differs from its admitted runtime transport',
      );
    return fetcher(request);
  };
}
