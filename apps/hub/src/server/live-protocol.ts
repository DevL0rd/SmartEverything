import type { IncomingMessage } from 'node:http';
import { LIVE_PROTOCOL, LIVE_PROTOCOL_PREFIX } from '@smarteverything/domain';

function offeredProtocols(request: IncomingMessage): readonly string[] {
  return (request.headers['sec-websocket-protocol'] ?? '')
    .split(',')
    .map((protocol) => protocol.trim())
    .filter((protocol) => protocol !== '');
}

function otherLiveProtocol(protocols: Iterable<string>): string | null {
  const offered = [...protocols];
  if (offered.includes(LIVE_PROTOCOL)) return null;
  return offered.find((protocol) => protocol.startsWith(LIVE_PROTOCOL_PREFIX)) ?? null;
}

export function mismatchedLiveProtocol(request: IncomingMessage): string | null {
  return otherLiveProtocol(offeredProtocols(request));
}

export function chosenLiveProtocol(protocols: ReadonlySet<string>): string | false {
  if (protocols.has(LIVE_PROTOCOL)) return LIVE_PROTOCOL;
  return otherLiveProtocol(protocols) ?? false;
}
