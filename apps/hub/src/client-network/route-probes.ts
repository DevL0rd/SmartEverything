import { z } from 'zod';
import {
  HUB_IDENTITY_PATH,
  HUB_PUBLIC_IDENTITY,
  type HubEndpoint,
  type NativeHubTrust,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { streamHubFetch } from './stream-fetch';
import { HubTransportError, type HubPolicies } from './policy';

export const ROUTE_PROBE_TIMEOUT_MS = 4000;
export const MAX_ROUTE_PROBES = 4;
export const ROUTE_DOCUMENT_BYTES = 16_384;

export async function probeNodeRoute(
  options: { readonly policies: HubPolicies; readonly trust: NativeHubTrust; readonly log: Logger },
  endpoint: HubEndpoint,
  signal: AbortSignal,
): Promise<boolean> {
  const { policies, trust, log } = options;
  try {
    const url = new URL(HUB_IDENTITY_PATH, endpoint.url).href;
    const lease = policies.lease(trust.scopeId, url);
    const response = await readRouteDocument(
      await streamHubFetch(new Request(url), { ...lease, signal }),
    );
    if (signal.aborted || response.status !== 200) return false;
    const answer = HUB_PUBLIC_IDENTITY.parse(JSON.parse(response.body));
    return (
      answer.identity.id === trust.identity.id &&
      JSON.stringify(answer.identity.tls) === JSON.stringify(trust.identity.tls)
    );
  } catch (cause) {
    log.debug('route.probe_failed', {
      kind: endpoint.kind,
      error_name: cause instanceof Error ? cause.name : 'unknown',
    });
    return false;
  }
}
export async function readRouteDocument(
  response: Response,
  maximumBytes = ROUTE_DOCUMENT_BYTES,
): Promise<{ readonly status: number; readonly body: string }> {
  const reader = response.body?.getReader();
  if (reader === undefined) return { status: response.status, body: '' };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const bytes = z.instanceof(Uint8Array).parse(chunk.value);
      size += bytes.byteLength;
      if (size > maximumBytes)
        throw new HubTransportError('Hub route document exceeds the probe limit');
      chunks.push(bytes);
    }
    return { status: response.status, body: Buffer.concat(chunks).toString('utf8') };
  } finally {
    await reader.cancel();
  }
}
