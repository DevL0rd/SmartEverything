import { request as httpsRequest } from 'node:https';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { NATIVE_HUB_REQUEST, type NativeHubResponse } from '@smarteverything/domain';
import { HubTransportError } from './policy.js';
import type { HubLeasePort } from './lease.js';
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
function readResponse(response: IncomingMessage): Promise<NativeHubResponse> {
  return new Promise((resolve, reject) => {
    const status = response.statusCode;
    if (status === undefined || (status >= 300 && status < 400)) {
      response.destroy();
      reject(new HubTransportError('Hub redirects are forbidden'));
      return;
    }
    const chunks: Buffer[] = [];
    let bytes = 0;
    response.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BYTES)
        response.destroy(new HubTransportError('Hub response exceeds size limit'));
      else chunks.push(chunk);
    });
    response.on('error', reject);
    response.on('aborted', () => {
      reject(new HubTransportError('Hub response was interrupted'));
    });
    response.on('end', () => {
      const headers = Object.fromEntries(
        Object.entries(response.headers).flatMap(([name, entry]) =>
          entry === undefined ? [] : [[name, Array.isArray(entry) ? entry.join(', ') : entry]],
        ),
      );
      resolve({ status, headers, body: Buffer.concat(chunks).toString('utf8') });
    });
  });
}
export function requestHub(policies: HubLeasePort, value: unknown): Promise<NativeHubResponse> {
  const input = NATIVE_HUB_REQUEST.parse(value);
  const lease = policies.lease(input.scopeId, input.url, input.binding, input.routeGeneration);
  if (input.body !== null && Buffer.byteLength(input.body) > MAX_BYTES)
    throw new HubTransportError('Hub request exceeds size limit');
  for (const header of Object.keys(input.headers)) {
    if (
      ['host', 'connection', 'content-length', 'transfer-encoding'].includes(header.toLowerCase())
    )
      throw new HubTransportError('Hub request contains a reserved transport header');
  }
  return new Promise((resolve, reject) => {
    const create = lease.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = create(
      lease.url,
      {
        method: input.method,
        headers: input.headers,
        agent: lease.agent,
        ...(lease.signal === undefined
          ? {}
          : { signal: lease.signal, hubAbortSignal: lease.signal }),
      },
      (response) => {
        void readResponse(response).then(resolve, (cause: unknown): void => {
          if (lease.signal?.aborted !== true)
            policies.failed?.(input.scopeId, input.routeGeneration);
          reject(cause instanceof Error ? cause : new HubTransportError('Hub response failed'));
        });
      },
    );
    const timer = setTimeout(() => {
      request.destroy(new HubTransportError('Hub request timed out'));
    }, TIMEOUT_MS);
    timer.unref();
    request.on('close', () => {
      clearTimeout(timer);
    });
    request.on('error', (cause: Error): void => {
      if (lease.signal?.aborted !== true) policies.failed?.(input.scopeId, input.routeGeneration);
      reject(cause instanceof Error ? cause : new HubTransportError('Hub response failed'));
    });
    request.end(input.body);
  });
}
