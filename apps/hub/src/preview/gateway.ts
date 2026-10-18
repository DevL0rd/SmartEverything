import type { GatewayPages } from './gateway-pages';
import { servePreviewHtml } from './html-response';
import { createServer, ServerResponse } from 'node:http';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { randomBytes } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import type { Logger } from '@smarteverything/logging';
import type { PreviewLeases, ViewerLease } from './leases';
import { PREVIEW_COOKIE } from './leases';
import type { PreviewDataSockets } from './data-sockets';
import { pageHeaders } from './headers';
import { PreviewRelay } from './relay';
import { socketText } from './socket-text';
export const PREVIEW_GATEWAY_CONFIG = z.strictObject({
  base_domain: z
    .string()
    .min(1)
    .max(200)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
  port: z.int().min(1).max(65535),
  frame_origins: z
    .array(z.url().refine((v) => new URL(v).origin === v && new URL(v).protocol === 'https:'))
    .min(1)
    .max(10),
});
export type PreviewGatewayConfig = z.infer<typeof PREVIEW_GATEWAY_CONFIG>;
const DEADLINE_MS = 15_000;
export class PreviewGateway {
  private server: Server | null = null;
  private ready = false;
  private reason = 'No isolated HTTPS preview gateway is configured.';
  private pages: GatewayPages | undefined;
  configurePages(pages: GatewayPages): void {
    this.pages = pages;
  }
  private probe: { readonly host: string; readonly nonce: string } | null = null;
  private readonly relay: PreviewRelay;
  private readonly upgraded = new Set<Duplex>();
  constructor(
    readonly config: PreviewGatewayConfig | undefined,
    private readonly leases: PreviewLeases,
    private readonly data: PreviewDataSockets,
    private readonly log: Logger,
  ) {
    this.relay = new PreviewRelay(
      data,
      () => this.ancestors(),
      (target, cause) => {
        this.failed(target, cause);
      },
    );
  }
  status(): {
    readonly ready: boolean;
    readonly base_domain: string | null;
    readonly reason: string | null;
  } {
    return {
      ready: this.ready,
      base_domain: this.config?.base_domain ?? null,
      reason: this.ready ? null : this.reason,
    };
  }
  domain(): string {
    if (!this.ready || this.config === undefined) throw new ApiError('conflict', this.reason);
    return this.config.base_domain;
  }
  async start(): Promise<void> {
    if (this.config === undefined) return;
    const server = createServer((req, res) => {
      void this.handle(req, res).catch((cause: unknown) => {
        this.failed(res, cause);
      });
    });
    this.server = server;
    server.on('upgrade', (req, socket, head) => {
      try {
        this.upgrade(req, socket, head);
      } catch (cause) {
        this.failed(socket, cause);
      }
    });
    server.on('error', (cause) => {
      this.ready = false;
      this.reason = 'The isolated preview listener failed.';
      this.log.error('gateway.listener_failed', cause);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.config?.port, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });
    await this.verify();
  }
  private async verify(): Promise<void> {
    if (this.config === undefined) return;
    const nonce = randomBytes(32).toString('hex');
    const host = `${randomBytes(18).toString('hex')}.${this.config.base_domain}`;
    this.probe = { host, nonce };
    try {
      const response = await fetch(`https://${host}/.se-preview/probe`, {
        redirect: 'error',
        signal: AbortSignal.timeout(DEADLINE_MS),
      });
      if (!response.ok || (await response.text()) !== nonce)
        throw new ApiError(
          'conflict',
          'The external wildcard HTTPS route did not reach the isolated gateway.',
        );
      await this.verifySocket(host, nonce);
      this.ready = true;
    } catch (cause) {
      this.reason =
        'Configure valid wildcard HTTPS and WSS routing to the dedicated preview listener; external route verification failed.';
      this.log.warn('gateway.unavailable', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    } finally {
      this.probe = null;
    }
  }
  private verifySocket(host: string, nonce: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://${host}/.se-preview/probe`, {
        handshakeTimeout: DEADLINE_MS,
        maxPayload: 1024,
      });
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new ApiError('conflict', 'External WSS probe timed out.'));
      }, DEADLINE_MS);
      ws.once('open', () => {
        ws.send(nonce);
      });
      ws.once('message', (raw) => {
        clearTimeout(timer);
        ws.close();
        if (socketText(raw) === nonce) resolve();
        else reject(new ApiError('conflict', 'External WSS probe differs.'));
      });
      ws.once('error', (cause) => {
        clearTimeout(timer);
        reject(cause);
      });
    });
  }
  private host(req: IncomingMessage): string {
    const host = req.headers.host;
    if (host === undefined)
      throw new ApiError('invalid_request', 'Preview requests require a Host.');
    return host;
  }
  private ancestors(): readonly string[] {
    if (this.config === undefined)
      throw new ApiError('conflict', 'The preview gateway is unconfigured.');
    return this.config.frame_origins;
  }
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const host = this.host(req);
    const path = previewPath(req.url);
    if (host === this.probe?.host && path === '/.se-preview/probe' && req.method === 'GET') {
      res.end(this.probe.nonce);
      return;
    }
    if (await this.servePage(req, res, host, path)) return;
    const url = new URL(path, `https://${host}`);
    if (url.pathname === '/.se-preview/bootstrap') {
      this.bootstrap(req, res, host, url);
      return;
    }
    if (url.pathname.startsWith('/.se-preview/'))
      throw new ApiError('not_found', 'Reserved preview gateway path.');
    const lease = this.leases.authenticate(host, req.headers.cookie);
    this.requestOrigin(req, lease);
    if (await servePreviewHtml(req, res, { path, lease, ancestors: this.ancestors() })) return;
    this.relay.web(req, res, lease);
  }
  private servePage(
    req: IncomingMessage,
    res: ServerResponse,
    host: string,
    path: string,
  ): Promise<boolean> {
    if (this.config === undefined || this.pages === undefined) return Promise.resolve(false);
    return this.pages.handle(req, res, {
      host,
      path,
      domain: this.config.base_domain,
      ancestors: this.ancestors(),
    });
  }
  private bootstrap(req: IncomingMessage, res: ServerResponse, host: string, url: URL): void {
    if (
      req.method !== 'GET' ||
      req.headers['sec-fetch-site'] === 'cross-site' ||
      (req.headers.origin !== undefined && !this.ancestors().includes(req.headers.origin))
    )
      throw new ApiError(
        'forbidden',
        'The preview bootstrap must come from its authorized same-site app.',
      );
    const lease = this.leases.bootstrap(host, url.searchParams.get('code') ?? '');
    res.writeHead(303, {
      ...pageHeaders(this.ancestors()),
      location: lease.publication.view.initial_path,
      'set-cookie': `${PREVIEW_COOKIE}=${lease.credential}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`,
    });
    res.end();
  }
  private requestOrigin(req: IncomingMessage, lease: ViewerLease): void {
    if (req.headers.origin !== undefined && req.headers.origin !== `https://${lease.host}`)
      throw new ApiError('forbidden', 'Preview requests require their exact isolated Origin.');
    if (req.headers['sec-fetch-site'] === 'cross-site')
      throw new ApiError('forbidden', 'Cross-site preview requests are refused.');
  }
  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const host = this.host(req);
    if (host === this.probe?.host && req.url === '/.se-preview/probe') {
      const server = new WebSocketServer({ noServer: true, maxPayload: 1024 });
      server.handleUpgrade(req, socket, head, (ws) => {
        ws.once('message', (raw) => {
          ws.send(raw);
        });
        ws.once('close', () => {
          server.close();
        });
      });
      return;
    }
    const lease = this.leases.authenticate(host, req.headers.cookie);
    this.requestOrigin(req, lease);
    this.upgraded.add(socket);
    socket.once('close', () => {
      this.upgraded.delete(socket);
    });
    this.relay.ws(req, socket, head, lease);
  }

  private failed(target: ServerResponse | Duplex, cause: unknown): void {
    if (target.destroyed) return;
    if (!(target instanceof ServerResponse) || target.headersSent) {
      target.destroy();
      return;
    }
    const error =
      cause instanceof ApiError
        ? cause
        : new ApiError('upstream_failed', 'The shared service is offline or its relay failed.');
    target.writeHead(error.status, {
      'content-type': 'text/plain',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    });
    target.end(error.message);
  }
  async stop(): Promise<void> {
    this.ready = false;
    this.leases.stop();
    this.data.stop();
    const server = this.server;
    if (server === null) return;
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
      server.closeAllConnections();
      for (const socket of this.upgraded) socket.destroy();
    });
  }
}

function previewPath(value: string | undefined): string {
  if (value === undefined || !/^\/(?![/\\])/.test(value))
    throw new ApiError('invalid_request', 'Preview requires an origin-form path.');
  return value;
}
