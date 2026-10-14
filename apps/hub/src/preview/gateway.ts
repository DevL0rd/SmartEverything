import { previewPath, previewRequester, upgradePreview } from './websocket';
import { servePreviewHtml } from './html-response';
import { isHtmlPreview } from './sources';
import { createServer, request as httpRequest } from 'node:http';
import type { Server, IncomingMessage, ServerResponse, ClientRequest } from 'node:http';
import type { Duplex } from 'node:stream';
import { randomBytes } from 'node:crypto';
import WebSocket, { WebSocketServer } from 'ws';
import { ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import type { Logger } from '@smarteverything/logging';
import type { PreviewLeases, ViewerLease } from './leases';
import { PREVIEW_COOKIE } from './leases';
import type { PreviewDataSockets } from './data-sockets';
import { mappedHeaders, responseHeaders } from './headers';
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
  private probe: { readonly host: string; readonly nonce: string } | null = null;
  constructor(
    readonly config: PreviewGatewayConfig | undefined,
    private readonly leases: PreviewLeases,
    private readonly data: PreviewDataSockets,
    private readonly log: Logger,
  ) {}
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
      void this.upgrade(req, socket, head).catch(() => socket.destroy());
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
        if (
          (Buffer.isBuffer(raw)
            ? raw
            : Array.isArray(raw)
              ? Buffer.concat(raw)
              : Buffer.from(raw)
          ).toString('utf8') === nonce
        )
          resolve();
        else reject(new ApiError('conflict', 'External WSS probe differs.'));
      });
      ws.once('error', (cause) => {
        clearTimeout(timer);
        reject(cause);
      });
    });
  }
  private host(req: IncomingMessage): string {
    const hosts = req.rawHeaders.filter(
      (name, index) => index % 2 === 0 && name.toLowerCase() === 'host',
    );
    if (hosts.length !== 1)
      throw new ApiError('invalid_request', 'Preview requests require exactly one raw Host field.');
    const host = req.headers.host;
    if (host === undefined || !/^[a-z0-9.-]+$/.test(host))
      throw new ApiError('forbidden', 'The preview Host is invalid.');
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
    const url = new URL(path, `https://${host}`);
    if (url.pathname === '/.se-preview/bootstrap') {
      this.bootstrap(req, res, host, url);
      return;
    }
    if (url.pathname.startsWith('/.se-preview/'))
      throw new ApiError('not_found', 'Reserved preview gateway path.');
    const lease = this.leases.authenticate(host, req.headers.cookie);
    this.requestOrigin(req, lease);
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method ?? ''))
      throw new ApiError('forbidden', 'This HTTP method cannot use a preview relay.');
    if (await servePreviewHtml(req, res, { path, lease, ancestors: this.ancestors() })) return;
    await this.relayHttp(req, res, path, lease);
  }
  private async relayHttp(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    lease: ViewerLease,
  ): Promise<void> {
    if (isHtmlPreview(lease.publication))
      throw new ApiError('forbidden', 'HTML documents cannot relay local network requests.');
    const signal = previewRequester(req, res, lease.abort.signal);
    const stream = await this.data.open(lease, signal);
    if (res.destroyed) {
      stream.destroy();
      return;
    }
    signal.throwIfAborted();
    if (stream.destroyed)
      throw new ApiError('upstream_failed', 'The preview relay closed during admission.');
    const upstream = httpRequest({
      method: req.method,
      path,
      createConnection: () => stream,
      headers: mappedHeaders(
        req.headers,
        `https://${lease.host}`,
        lease.publication.view.source_origin,
      ),
      maxHeaderSize: 32 * 1024,
      signal,
    });
    this.pipeHttp(req, res, upstream, lease);
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
      location: lease.publication.view.initial_path,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'set-cookie': `${PREVIEW_COOKIE}=${lease.credential}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned`,
      'content-security-policy': `default-src 'none'; frame-ancestors ${this.ancestors().join(' ')}`,
    });
    res.end();
  }
  private requestOrigin(req: IncomingMessage, lease: ViewerLease): void {
    this.leases.validate(lease);
    if (req.headers.origin !== undefined && req.headers.origin !== `https://${lease.host}`)
      throw new ApiError('forbidden', 'Preview requests require their exact isolated Origin.');
    if (req.headers['sec-fetch-site'] === 'cross-site')
      throw new ApiError('forbidden', 'Cross-site preview requests are refused.');
  }
  private pipeHttp(
    req: IncomingMessage,
    res: ServerResponse,
    upstream: ClientRequest,
    lease: ViewerLease,
  ): void {
    const publication = lease.publication;
    if (isHtmlPreview(publication))
      throw new ApiError('forbidden', 'HTML cannot relay a network response.');
    const close = (): void => {
      upstream.destroy();
    };
    res.once('close', close);
    req.once('aborted', close);
    upstream.once('error', (cause) => {
      this.failed(res, cause);
    });
    upstream.once('response', (source) => {
      try {
        this.leases.validate(lease);
        res.writeHead(
          source.statusCode ?? 502,
          responseHeaders(
            source.headers,
            publication.view.source_origin,
            `https://${lease.host}`,
            this.ancestors(),
          ),
        );
        source.on('error', (cause) => {
          this.failed(res, cause);
        });
        source.pipe(res);
      } catch (cause) {
        source.destroy();
        this.failed(res, cause);
      }
    });
    req.pipe(upstream);
  }
  private async upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
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
    if (isHtmlPreview(lease.publication))
      throw new ApiError('forbidden', 'HTML documents cannot open network streams.');
    await upgradePreview({ request: req, socket, head, lease }, this.data, this.leases);
  }

  private failed(res: ServerResponse, cause: unknown): void {
    if (res.destroyed) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const error =
      cause instanceof ApiError
        ? cause
        : new ApiError('upstream_failed', 'The shared service is offline or its relay failed.');
    res.writeHead(error.status, {
      'content-type': 'text/plain',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    });
    res.end(error.message);
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
    });
  }
}
