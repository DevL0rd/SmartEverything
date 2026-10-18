import type { ServerResponse } from 'node:http';
import { Logger } from '@smarteverything/logging';
import { HubRefusalError, HubTransportError } from './policy';

const log = new Logger('hub.client-network');
export function refuseLoopbackRequest(
  response: ServerResponse,
  cause: unknown,
  event: 'guest.refused' | 'resource.refused',
): void {
  if (cause instanceof Error && cause.name === 'AbortError') {
    response.destroy();
    return;
  }
  const status = cause instanceof HubRefusalError ? cause.status : 502;
  const reason = cause instanceof HubTransportError ? cause.detail : 'The hub did not answer.';
  log.warn(event, {
    status,
    error_name: cause instanceof Error ? cause.name : 'unknown',
    reason,
  });
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ error: reason }));
}
