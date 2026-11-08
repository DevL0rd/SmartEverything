import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const log = new Logger('desktop.google-loopback');

export const LOOPBACK_HOST = '127.0.0.1';
export const LOOPBACK_PATH = '/google/callback';

const RETURN_HINT = 'You can close this tab and return to SmartEverything.';
const authUrlSchema = z.url({ protocol: /^https$/ });
const stateSchema = z.string().min(1);
const codeSchema = z.string().min(1);

export interface GoogleLoopbackResult {
  readonly code: string;
  readonly state: string;
  readonly redirectUri: string;
}

export class GoogleLoopbackCancelledError extends Error {
  constructor() {
    super('the Google link was cancelled before Google answered');
    this.name = 'GoogleLoopbackCancelledError';
  }
}

export class GoogleLoopbackDeniedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`Google did not grant access: ${reason}`);
    this.name = 'GoogleLoopbackDeniedError';
    this.reason = reason;
  }
}

export class GoogleLoopbackBusyError extends Error {
  constructor() {
    super('a Google authorization is already waiting on this loopback');
    this.name = 'GoogleLoopbackBusyError';
  }
}

export interface GoogleLoopbackSession {
  readonly redirectUri: string;
  readonly authorize: (authUrl: string, expectedState: string) => Promise<GoogleLoopbackResult>;
  readonly cancel: () => void;
}

export interface GoogleLoopbackDeps {
  readonly openExternal: (url: string) => Promise<void>;
}

interface Waiter {
  readonly expectedState: string;
  readonly resolve: (result: GoogleLoopbackResult) => void;
  readonly reject: (cause: Error) => void;
}

function page(res: ServerResponse, status: number, title: string, detail: string): void {
  const body = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0"><main style="text-align:center"><h1 style="font-size:1.25rem;font-weight:600">${title}</h1><p>${detail}</p></main></body></html>`;
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    connection: 'close',
  });
  res.end(body);
}

function listenOnLoopback(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK_HOST, () => {
      server.off('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('the loopback server has no TCP address'));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): void {
  server.close();
  server.closeAllConnections();
}

class LoopbackCatcher implements GoogleLoopbackSession {
  redirectUri = '';
  private waiter: Waiter | null = null;
  private closed = false;
  private readonly server: Server;

  constructor(private readonly deps: GoogleLoopbackDeps) {
    this.server = createServer((req, res) => {
      this.handle(req, res);
    });
  }

  async listen(): Promise<void> {
    const port = await listenOnLoopback(this.server);
    this.redirectUri = `http://${LOOPBACK_HOST}:${String(port)}${LOOPBACK_PATH}`;
    log.info('google_loopback.listening', { port });
  }

  authorize = async (authUrl: string, expectedState: string): Promise<GoogleLoopbackResult> => {
    if (this.closed) throw new GoogleLoopbackCancelledError();
    if (this.waiter !== null) throw new GoogleLoopbackBusyError();
    const target = authUrlSchema.parse(authUrl);
    const state = stateSchema.parse(expectedState);
    const answer = new Promise<GoogleLoopbackResult>((resolve, reject) => {
      this.waiter = { expectedState: state, resolve, reject };
    });
    try {
      await this.deps.openExternal(target);
    } catch (cause) {
      this.settle((w) => {
        w.reject(cause instanceof Error ? cause : new Error(String(cause)));
      });
    }
    return answer;
  };

  cancel = (): void => {
    if (this.closed) return;
    log.info('google_loopback.cancelled');
    this.settle((w) => {
      w.reject(new GoogleLoopbackCancelledError());
    });
  };

  private settle(finish: (current: Waiter) => void): void {
    const current = this.waiter;
    this.waiter = null;
    this.closed = true;
    closeServer(this.server);
    if (current !== null) finish(current);
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', this.redirectUri);
    const current = this.waiter;
    if (req.method !== 'GET' || url.pathname !== LOOPBACK_PATH || current === null) {
      page(res, 404, 'Not found', 'This address is not used.');
      return;
    }
    const state = stateSchema.safeParse(url.searchParams.get('state'));
    if (!state.success || state.data !== current.expectedState) {
      log.warn('google_loopback.state_mismatch');
      page(res, 400, 'Link refused', 'This answer does not belong to the link you started.');
      return;
    }
    const denied = url.searchParams.get('error');
    const code = codeSchema.safeParse(url.searchParams.get('code'));
    if (denied !== null || !code.success) {
      const reason = denied ?? 'no_code';
      log.info('google_loopback.denied', { reason });
      page(res, 200, 'Google was not linked', RETURN_HINT);
      this.settle((w) => {
        w.reject(new GoogleLoopbackDeniedError(reason));
      });
      return;
    }
    log.info('google_loopback.code_received');
    page(res, 200, 'Google linked', RETURN_HINT);
    this.settle((w) => {
      w.resolve({ code: code.data, state: state.data, redirectUri: this.redirectUri });
    });
  }
}

export async function listenGoogleLoopback(
  deps: GoogleLoopbackDeps,
): Promise<GoogleLoopbackSession> {
  const catcher = new LoopbackCatcher(deps);
  await catcher.listen();
  return catcher;
}
