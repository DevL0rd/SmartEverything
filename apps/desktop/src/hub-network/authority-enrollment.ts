import { z } from 'zod';
import {
  CLIENT_TOKEN,
  HUB_CONNECTION_METADATA,
  hashClientToken,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  type NativeHubRouteConfiguration,
  type HubConnectionMetadata,
} from '@smarteverything/domain';
import { readPrivateServiceFile } from './authority-view.js';
import { HubTransportError } from './policy.js';
import {
  readRouteDocument,
  ROUTE_DOCUMENT_BYTES,
  ROUTE_PROBE_TIMEOUT_MS,
} from '../../../hub/src/client-network/route-probes';
const WINDOW = z.strictObject({ hub_url: z.url({ protocol: /^https?$/ }), token: CLIENT_TOKEN });
export interface DesktopClientEnrollment {
  readonly configuration: NativeHubRouteConfiguration;
  readonly token: string;
  readonly metadata: HubConnectionMetadata;
}
export async function enrollDesktopClient(
  directory: string,
  value: unknown,
  signal: AbortSignal,
): Promise<DesktopClientEnrollment> {
  const configuration = NATIVE_HUB_ROUTE_CONFIGURATION.parse(value);
  const window = WINDOW.parse(
    JSON.parse(await readPrivateServiceFile(directory, 'node-window.json')),
  );
  if (
    new URL(window.hub_url).origin !== configuration.canonicalOrigin ||
    configuration.bindings.length !== 1
  )
    throw new HubTransportError('Window pairing differs from the requested canonical authority');
  const binding = configuration.bindings[0];
  if (binding?.credentialKind !== 'client' || binding.principalId !== hashClientToken(window.token))
    throw new HubTransportError('Window credential principal is not independently paired');
  const canonical = new URL(configuration.canonicalOrigin);
  if (
    canonical.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(canonical.hostname)
  )
    throw new HubTransportError(
      'Client enrollment requires independently verified canonical HTTPS',
    );
  const response = await fetch(new URL('/api/connection', canonical), {
    headers: { authorization: `Bearer ${window.token}` },
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(ROUTE_PROBE_TIMEOUT_MS)]),
  });
  if (!response.ok)
    throw new HubTransportError(
      `Canonical client enrollment refused (HTTP ${String(response.status)})`,
    );
  const metadata = HUB_CONNECTION_METADATA.parse(
    JSON.parse((await readRouteDocument(response, ROUTE_DOCUMENT_BYTES * 4)).body),
  );
  if (JSON.stringify(metadata.identity) !== JSON.stringify(configuration.trust.identity))
    throw new HubTransportError(
      'Renderer trust differs from independently authenticated client identity',
    );
  return { configuration, token: window.token, metadata };
}
