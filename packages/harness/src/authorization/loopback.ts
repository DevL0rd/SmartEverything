import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { SubscriptionProviderError } from '../providers/errors';
import type { SiwcAuthorization } from './siwc';

const CALLBACK_TIMEOUT_MS = 10 * 60 * 1000;
const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PATH = '/auth/callback';

class SubscriptionLoopback {
  private readonly server: Server;
  private expected: string | undefined;
  private resolve: ((url: string) => void) | undefined;
  private reject: ((error: Error) => void) | undefined;

  constructor() {
    this.server = createServer((request, response) => {
      this.receive(request, response);
    });
  }

  start(signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      this.server.once('error', () => {
        const error = new SubscriptionProviderError(
          'PROVIDER_UNAVAILABLE',
          'Supplying host OAuth loopback listener failed.',
        );
        this.reject?.(error);
        reject(error);
      });
      this.server.listen(0, CALLBACK_HOST, () => {
        const address = this.server.address();
        if (address === null || typeof address === 'string') {
          reject(
            new SubscriptionProviderError(
              'PROVIDER_UNAVAILABLE',
              'OAuth listener has no TCP loopback address.',
            ),
          );
          return;
        }
        resolve(`http://${CALLBACK_HOST}:${String(address.port)}${CALLBACK_PATH}`);
      });
    });
  }

  wait(state: string, signal: AbortSignal): Promise<string> {
    this.expected = state;
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      const abort = (): void => {
        reject(
          new SubscriptionProviderError(
            'AUTH_DENIED',
            'Subscription authorization was cancelled or timed out.',
          ),
        );
      };
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
      this.server.once('close', () => {
        signal.removeEventListener('abort', abort);
      });
    });
  }

  close(): void {
    this.reject?.(new SubscriptionProviderError('AUTH_DENIED', 'OAuth loopback listener closed.'));
    this.server.close();
    this.server.closeAllConnections();
  }

  private receive(request: IncomingMessage, response: ServerResponse): void {
    const address = this.server.address();
    if (address === null || typeof address === 'string' || request.url === undefined) {
      response.writeHead(400).end();
      return;
    }
    const origin = `http://${CALLBACK_HOST}:${String(address.port)}`;
    const url = this.callbackUrl(request.url, origin);
    if (url === undefined) {
      response.writeHead(400).end('Invalid authorization callback URI.');
      return;
    }
    if (
      request.method !== 'GET' ||
      url.pathname !== CALLBACK_PATH ||
      this.expected === undefined ||
      url.searchParams.get('state') !== this.expected ||
      this.resolve === undefined
    ) {
      response.writeHead(400).end('Authorization callback rejected.');
      return;
    }
    this.expected = undefined;
    response
      .writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
      .end('Authorization callback received. Return to SmartEverything.');
    this.resolve(url.toString());
  }

  private callbackUrl(requestUrl: string, origin: string): URL | undefined {
    if (!URL.canParse(requestUrl, origin)) return undefined;
    const url = new URL(requestUrl, origin);
    return url.origin === origin ? url : undefined;
  }
}

export async function authorizeChatgptOnHost(input: {
  readonly authorization: SiwcAuthorization;
  readonly routeId: string;
  readonly subscriberProfileId?: string;
  readonly openSystemBrowser: (url: string) => Promise<void>;
  readonly signal: AbortSignal;
  readonly manualCallback?: (signal: AbortSignal) => Promise<string>;
}): Promise<void> {
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(CALLBACK_TIMEOUT_MS)]);
  const listener = new SubscriptionLoopback();
  let attemptId: string | undefined;
  try {
    const redirectUri = await listener.start(signal);
    const attempt = await input.authorization.begin(
      input.routeId,
      redirectUri,
      input.subscriberProfileId,
    );
    attemptId = attempt.attemptId;
    const state = new URL(attempt.url).searchParams.get('state');
    if (state === null)
      throw new SubscriptionProviderError('AUTH_INVALID', 'OAuth authorization URL has no state.');
    signal.throwIfAborted();
    const [callback] = await Promise.all([
      input.manualCallback === undefined
        ? listener.wait(state, signal)
        : Promise.race([listener.wait(state, signal), input.manualCallback(signal)]),
      input.openSystemBrowser(attempt.url),
    ]);
    await input.authorization.complete(attemptId, callback, signal);
  } finally {
    listener.close();
    if (attemptId !== undefined) input.authorization.cancel(attemptId);
  }
}
