import {
  openNodeHubSocket,
  retireNodeHubSocket,
  type NodeHubTransport,
} from '../client-network/node-transport';
import { randomUUID } from 'node:crypto';
import { connect as tcpConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { realpath } from 'node:fs/promises';
import type { Duplex } from 'node:stream';
import { createWebSocketStream, type WebSocket } from 'ws';
import {
  ApiError,
  AI_PREVIEW_ORIGIN,
  NODE_PREVIEW_CONNECT,
  NODE_PREVIEW_PATH,
  NODE_PREVIEW_PROTOCOL,
  PREVIEW_CHUNK_BYTES,
} from '@smarteverything/domain';
import type { AiPreviewServiceWrite, HubPreviewOpen } from '@smarteverything/domain';
import type { NativePreviewAdapter } from '@smarteverything/harness/process';
import type { Logger } from '@smarteverything/logging';
interface ServiceGrant {
  readonly session: string;
  readonly origin: string;
  readonly workspace: string;
}
function effectivePort(url: URL): number {
  if (url.port !== '') return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}
export class NativePreviewRelay implements NativePreviewAdapter {
  private stopped = false;
  private readonly grants = new Map<string, ServiceGrant>();
  private readonly files = new Map<
    string,
    { readonly session: string; readonly stop: () => void }
  >();
  private readonly streams = new Set<Duplex>();
  private readonly pendingGrants = new Map<string, string>();
  private readonly pendingStreams = new Map<
    string,
    { readonly handle: string; readonly abort: AbortController }
  >();
  constructor(
    private readonly hubUrl: string,
    private readonly token: string,
    private readonly log: Logger,
    private readonly transport?: NodeHubTransport,
  ) {}
  async publish(
    session: string,
    workspace: string,
    service: AiPreviewServiceWrite,
  ): Promise<string> {
    if (this.stopped) throw new ApiError('conflict', 'The native preview runtime stopped.');
    const origin = this.publicationOrigin(service);
    const handle = randomUUID();
    this.pendingGrants.set(handle, session);
    try {
      const canonical = await realpath(workspace);
      if (canonical !== workspace)
        throw new ApiError('forbidden', 'Publication requires the admitted canonical workspace.');
      if (this.pendingGrants.get(handle) !== session)
        throw new ApiError(
          'conflict',
          'The native session lost its publication authority during admission.',
        );
      this.grants.set(handle, { session, origin, workspace: canonical });
      return handle;
    } finally {
      this.pendingGrants.delete(handle);
    }
  }
  private publicationOrigin(service: AiPreviewServiceWrite): string {
    const origin = AI_PREVIEW_ORIGIN.parse(service.origin);
    const hub = new URL(this.hubUrl);
    if (
      ['127.0.0.1', '[::1]', 'localhost'].includes(hub.hostname) &&
      effectivePort(hub) === effectivePort(new URL(origin))
    )
      throw new ApiError(
        'forbidden',
        'The node cannot publish its hub API as a development service.',
      );
    return origin;
  }
  registerFile(handle: string, session: string, stop: () => void): void {
    if (this.stopped)
      throw new ApiError('conflict', 'The native preview runtime cannot admit another file watch.');
    if (this.files.has(handle) || this.grants.has(handle) || this.pendingGrants.has(handle))
      throw new ApiError('conflict', 'The preview handle is already admitted.');
    this.files.set(handle, { session, stop });
  }
  reportFileFailure(cause: unknown): void {
    this.log.warn('file.preview_failed', {
      error_name: cause instanceof Error ? cause.name : 'unknown',
    });
  }
  forget(handle: string): void {
    const file = this.files.get(handle);
    this.files.delete(handle);
    file?.stop();
    this.grants.delete(handle);
    for (const pending of this.pendingStreams.values())
      if (pending.handle === handle)
        pending.abort.abort(new ApiError('forbidden', 'The native service grant was revoked.'));
  }
  lose(session: string): void {
    for (const [id, file] of this.files) if (file.session === session) this.forget(id);
    for (const [id, grant] of this.grants) if (grant.session === session) this.forget(id);
    for (const [id, owner] of this.pendingGrants)
      if (owner === session) this.pendingGrants.delete(id);
  }
  async open(frame: HubPreviewOpen): Promise<void> {
    const grant = this.grants.get(frame.service_handle);
    if (grant === undefined || Date.parse(frame.expires_at) <= Date.now())
      throw new ApiError('forbidden', 'The host-side literal service grant is absent or expired.');
    const abort = this.reserveStream(frame);
    let upstream: Duplex | undefined;
    try {
      upstream = await this.connect(grant.origin, abort.signal);
      this.assertStream(frame, upstream, abort.signal);
      this.relay(frame, upstream);
    } catch (cause) {
      upstream?.destroy();
      throw cause;
    } finally {
      this.pendingStreams.delete(frame.stream_id);
    }
  }
  private assertStream(frame: HubPreviewOpen, upstream: Duplex, signal: AbortSignal): void {
    signal.throwIfAborted();
    if (this.stopped || !this.grants.has(frame.service_handle))
      throw new ApiError('conflict', 'The native preview runtime or service grant stopped.');
    if (upstream.destroyed)
      throw new ApiError('upstream_failed', 'The service connection closed during admission.');
  }
  private reserveStream(frame: HubPreviewOpen): AbortController {
    if (this.stopped || this.pendingStreams.has(frame.stream_id))
      throw new ApiError(
        'conflict',
        'The native preview runtime stopped or this stream is already being admitted.',
      );
    const abort = new AbortController();
    this.pendingStreams.set(frame.stream_id, { handle: frame.service_handle, abort });
    return abort;
  }
  private connect(origin: string, signal: AbortSignal): Promise<Duplex> {
    signal.throwIfAborted();
    const url = new URL(origin);
    const hostname = url.hostname === '[::1]' ? '::1' : url.hostname;
    const port = effectivePort(url);
    return new Promise((resolve, reject) => {
      let connected = false;
      const socket =
        url.protocol === 'https:'
          ? tlsConnect({ host: hostname, port, rejectUnauthorized: true })
          : tcpConnect({ host: hostname, port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new ApiError('upstream_failed', 'The exact service connection timed out.'));
      }, 10_000);
      const cancelled = (): void => {
        socket.destroy(new ApiError('conflict', 'The native preview admission was cancelled.'));
      };
      signal.addEventListener('abort', cancelled, { once: true });
      socket.once('close', () => {
        signal.removeEventListener('abort', cancelled);
        clearTimeout(timer);
        if (!connected)
          reject(
            new ApiError('upstream_failed', 'The service connection closed before admission.'),
          );
      });
      if (signal.aborted) cancelled();
      socket.setTimeout(120_000, () => {
        socket.destroy();
      });
      socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', () => {
        connected = true;
        clearTimeout(timer);
        resolve(socket);
      });
      socket.once('error', () => {
        clearTimeout(timer);
        reject(new ApiError('upstream_failed', 'The shared service is offline.'));
      });
    });
  }
  private relay(frame: HubPreviewOpen, upstream: Duplex): void {
    const url = new URL(NODE_PREVIEW_PATH, this.hubUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = openNodeHubSocket(this.transport, url, NODE_PREVIEW_PROTOCOL, {
      headers: { authorization: `Bearer ${this.token}` },
      maxPayload: PREVIEW_CHUNK_BYTES,
      perMessageDeflate: false,
      handshakeTimeout: 10_000,
    });
    const close = (): void => {
      upstream.destroy();
      retireNodeHubSocket(ws);
      this.streams.delete(upstream);
    };
    this.streams.add(upstream);
    const expiry = this.expiry(frame, close);
    ws.once('open', () => {
      ws.send(this.handshake(frame), (error: Error | null | undefined) => {
        if (error !== undefined && error !== null) {
          close();
          return;
        }
        this.pipe(ws, upstream, close);
      });
    });
    ws.on('message', (_raw, binary) => {
      if (!binary) close();
    });
    upstream.on('error', close);
    upstream.once('close', close);
    ws.once('error', (cause) => {
      this.log.warn('preview.relay_failed', { error_name: cause.name });
      close();
    });
    ws.once('close', () => {
      clearTimeout(expiry);
      close();
    });
  }
  private handshake(frame: HubPreviewOpen): string {
    return JSON.stringify(
      NODE_PREVIEW_CONNECT.parse({
        type: 'preview_connect',
        device_id: frame.device_id,
        generation: frame.generation,
        runtime_instance: frame.runtime_instance,
        stream_id: frame.stream_id,
        ticket: frame.ticket,
      }),
    );
  }
  private expiry(frame: HubPreviewOpen, close: () => void): NodeJS.Timeout {
    const timer = setTimeout(close, Math.max(0, Date.parse(frame.expires_at) - Date.now()));
    timer.unref();
    return timer;
  }
  private pipe(ws: WebSocket, upstream: Duplex, close: () => void): void {
    const stream = createWebSocketStream(ws, { highWaterMark: PREVIEW_CHUNK_BYTES });
    stream.on('error', close);
    upstream.pipe(stream).pipe(upstream);
  }
  stop(): void {
    this.stopped = true;
    this.pendingGrants.clear();
    for (const pending of this.pendingStreams.values())
      pending.abort.abort(new ApiError('conflict', 'The native preview runtime stopped.'));
    this.pendingStreams.clear();
    for (const handle of this.grants.keys()) this.forget(handle);
    for (const handle of this.files.keys()) this.forget(handle);
    for (const stream of this.streams) stream.destroy();
    this.streams.clear();
  }
}
