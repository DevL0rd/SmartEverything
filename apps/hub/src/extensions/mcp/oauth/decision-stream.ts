import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventStream } from '../event-stream';
import { single } from '../respond';
import type { PendingConsents, Settlement } from './consents';

const GONE =
  'This approval page expired or was already used. Start connecting again from your assistant.';

const REPLACED =
  'A newer request from this assistant replaced this page. Continue on the newest page.';

function deliver(stream: EventStream, settlement: Settlement | undefined): void {
  const location = settlement?.location ?? null;
  if (location === null) {
    stream.send('closed', settlement?.outcome === 'cancelled' ? REPLACED : GONE);
  } else {
    stream.send('redirect', location);
  }
  stream.close();
}

export function streamDecision(
  consents: PendingConsents,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const query = new URL(request.url ?? '/', 'http://server').searchParams;
  const pageId = single(query, 'request') ?? '';
  const stream = new EventStream(response);
  const settlement = consents.settlementOf(pageId);
  if (settlement === null) {
    stream.onClose(
      consents.wait(pageId, (settled) => {
        deliver(stream, settled);
      }),
    );
  } else {
    deliver(stream, settlement);
  }
  return Promise.resolve();
}
