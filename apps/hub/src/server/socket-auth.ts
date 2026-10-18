import type { IncomingMessage } from 'node:http';
import { ApiError, BEARER_PROTOCOL_PREFIX, type ClientRow } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { clientForToken } from './auth';
import { accessEntryOf } from './person-access';

function protocolsOf(request: IncomingMessage): readonly string[] {
  return (request.headers['sec-websocket-protocol'] ?? '')
    .split(',')
    .map((protocol) => protocol.trim())
    .filter((protocol) => protocol !== '');
}

function tokenOf(protocols: readonly string[]): string | null {
  const bearer = protocols.find((protocol) => protocol.startsWith(BEARER_PROTOCOL_PREFIX));
  return bearer === undefined ? null : bearer.slice(BEARER_PROTOCOL_PREFIX.length);
}

export function socketClient(
  store: Store,
  request: IncomingMessage,
  protocol: string,
  path: string,
): ClientRow {
  const protocols = protocolsOf(request);
  if (!protocols.includes(protocol)) {
    throw new ApiError('invalid_request', `Open ${path} with the ${protocol} subprotocol.`);
  }
  return clientForToken(store, tokenOf(protocols), accessEntryOf(request, false));
}
