import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createSecureServer, type ServerOptions as TlsOptions } from 'node:https';
import type { Duplex } from 'node:stream';
import {
  ASSISTANT_VOICE_PATH,
  ApiError,
  EMBEDDED_BROWSER_PATH,
  HUB_IDENTITY_PATH,
  LIVE_SEQUENCE_HEADER,
  MEDIA_PATHS,
  TALK_PATH,
  NODE_AI_PATH,
  NODE_HARNESS_PATH,
  matchPath,
  type HttpMethod,
} from '@smarteverything/domain';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { Go2rtcClient } from '../cameras/go2rtc-client';
import { sendAssistantAttachment } from './attachment-files';
import { Thumbnails } from '../cameras/thumbnails';
import type { CameraSockets } from './camera-socket';
import type { ServerContext } from './context';
import { httpFailureOf } from './errors';
import { sendError } from './http';
import { ServerObserver, log, refusals } from './http-observe';
import { beginTrace, noteRoute } from './request-trace';
import { recordingFile, sendRecording } from './recording-files';
import type { Router } from './router';
import type { CLASS2_METHODS } from './dav';

export interface RawRoute {
  readonly method: HttpMethod | 'HEAD' | (typeof CLASS2_METHODS)[number];
  readonly path: string;
  readonly handle: (
    request: IncomingMessage,
    response: ServerResponse,
    params: Readonly<Record<string, string>>,
  ) => Promise<void>;
  readonly upgrade?: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    params: Readonly<Record<string, string>>,
  ) => Promise<void>;
}

export interface HttpServerOptions {
  readonly context: ServerContext;
  readonly router: Router;
  readonly rawRoutes: readonly RawRoute[];
  readonly allowedOrigins: ReadonlySet<string>;
  readonly cameraSockets: CameraSockets;
  readonly assistantVoice: AssistantVoice;
  readonly go2rtc: Go2rtcClient;
}

const ALLOWED_HEADERS = 'accept, authorization, content-type, range';
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE';
const DISCONNECT_CODES = new Set([
  'ABORT_ERR',
  'ECONNRESET',
  'ERR_STREAM_PREMATURE_CLOSE',
  'EPIPE',
]);

function urlOf(request: IncomingMessage): URL {
  return new URL(request.url ?? '/', 'http://server');
}

function isPublicOrigin(options: HttpServerOptions, origin: string): boolean {
  const publicUrl = options.context.store.settings.read().public_url;
  return publicUrl !== null && new URL(publicUrl).origin === origin;
}

function corsAllowed(
  options: HttpServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  response.setHeader('access-control-expose-headers', LIVE_SEQUENCE_HEADER);
  const origin = request.headers.origin;
  if (origin === undefined || isPublicOrigin(options, origin)) {
    return true;
  }
  if (!options.allowedOrigins.has(origin)) {
    const suppressed = refusals.pass(`origin:${origin}`);
    if (suppressed !== null) {
      log.warn('origin.refused', {
        method: request.method ?? null,
        suppressedSince: suppressed,
        decision: 'forbidden',
      });
    }
    sendError(response, new ApiError('forbidden', 'Requests from this origin are not allowed.'));
    return false;
  }
  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('vary', 'origin');
  if (request.method === 'OPTIONS') {
    log.debug('cors.preflight', { decision: 'allowed' });
    response.writeHead(204, {
      'access-control-allow-methods': ALLOWED_METHODS,
      'access-control-allow-headers': ALLOWED_HEADERS,
      'access-control-max-age': '600',
    });
    response.end();
    return false;
  }
  return true;
}

interface Serving extends HttpServerOptions {
  readonly thumbnails: Thumbnails;
}

type PublicPath = (
  options: Serving,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) => Promise<boolean>;

const answerProbe: PublicPath = (options, _request, response, url) => {
  if (url.pathname === HUB_IDENTITY_PATH) return Promise.resolve(false);
  const probe = matchPath(MEDIA_PATHS.publicUrlProbe, url.pathname);
  if (probe === null) {
    return Promise.resolve(false);
  }
  noteRoute(response, `GET ${MEDIA_PATHS.publicUrlProbe}`, 'public');
  const nonce = probe['nonce'] ?? '';
  if (!options.context.publicUrl.answers(nonce)) {
    throw new ApiError('not_found', 'This server is not waiting for that nonce.');
  }
  response.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(nonce);
  return Promise.resolve(true);
};

const serveRecordingFile: PublicPath = async (options, request, response, url) => {
  const recording = matchPath(MEDIA_PATHS.recording, url.pathname);
  if (recording === null) {
    return false;
  }
  noteRoute(response, `GET ${MEDIA_PATHS.recording}`, 'signed');
  const size = options.context.links.verifyImage(url);
  const row = options.context.store.cameras.recording(recording['recordingId'] ?? '');
  const path = options.context.recordingPath(row.storage_path);
  await sendRecording(await recordingFile(row, path, size, options.thumbnails), request, response);
  return true;
};

const serveSnapshot: PublicPath = async (options, _request, response, url) => {
  const camera = matchPath(MEDIA_PATHS.cameraSnapshot, url.pathname);
  if (camera === null) {
    return false;
  }
  noteRoute(response, `GET ${MEDIA_PATHS.cameraSnapshot}`, 'signed');
  const size = options.context.links.verifyImage(url);
  const deviceId = camera['deviceId'] ?? '';
  const frame = await options.context.hub.snapshot(deviceId, size);
  response.writeHead(200, {
    'content-type': 'image/jpeg',
    'content-length': frame.byteLength,
    'cache-control': 'no-store',
  });
  response.end(frame);
  return true;
};

const serveTalkMessage: PublicPath = async (options, request, response, url) => {
  const message = matchPath(MEDIA_PATHS.talkMessage, url.pathname);
  if (message === null) {
    return false;
  }
  noteRoute(response, `GET ${MEDIA_PATHS.talkMessage}`, 'signed');
  options.context.links.verify(url);
  const row = options.context.store.talk.message(message['messageId'] ?? '');
  if (row.storage_path === null) {
    throw new ApiError('not_found', 'This walkie-talkie message has no saved audio.');
  }
  const path = options.context.talk.recorder.pathOf(row.storage_path);
  await sendRecording({ path, contentType: 'audio/ogg' }, request, response);
  return true;
};

const serveAssistantAttachment: PublicPath = async (options, request, response, url) => {
  const found = matchPath(MEDIA_PATHS.assistantAttachment, url.pathname);
  if (found === null) {
    return false;
  }
  noteRoute(response, `GET ${MEDIA_PATHS.assistantAttachment}`, 'signed');
  options.context.links.verify(url);
  const file = options.context.store.assistantChat.attachment(found['attachmentId'] ?? '');
  const path = options.context.assistant.files.pathOf(file);
  await sendAssistantAttachment(file, path, request, response);
  return true;
};

const PUBLIC_PATHS: readonly PublicPath[] = [
  answerProbe,
  serveRecordingFile,
  serveSnapshot,
  serveTalkMessage,
  serveAssistantAttachment,
];

async function servePublicPaths(
  options: Serving,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  if (request.method !== 'GET') {
    return false;
  }
  const url = urlOf(request);
  for (const serve of PUBLIC_PATHS) {
    if (await serve(options, request, response, url)) {
      return true;
    }
  }
  return false;
}

async function serveRawRoutes(
  options: HttpServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const pathname = urlOf(request).pathname;
  for (const route of options.rawRoutes) {
    const params = matchPath(route.path, pathname);
    if (params !== null && route.method === request.method) {
      noteRoute(response, `${route.method} ${route.path}`, 'raw');
      await route.handle(request, response, params);
      return true;
    }
  }
  return false;
}

async function serve(
  options: Serving,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (!corsAllowed(options, request, response)) {
    return;
  }
  if (await servePublicPaths(options, request, response)) {
    return;
  }
  const matched = options.router.match(request.method ?? 'GET', urlOf(request).pathname);
  if (matched !== null && matched !== 'wrong_method') {
    await options.router.dispatch(matched, request, response);
    return;
  }
  if (await serveRawRoutes(options, request, response)) {
    return;
  }
  throw matched === 'wrong_method'
    ? new ApiError('method_not_allowed', 'This HTTP method is not allowed on the requested route.')
    : new ApiError('not_found', 'There is no route at this address.');
}

function disconnected(response: ServerResponse, cause: unknown): boolean {
  if (!response.destroyed || response.writableFinished || !(cause instanceof Error)) return false;
  return (
    cause.name === 'AbortError' ||
    ('code' in cause && typeof cause.code === 'string' && DISCONNECT_CODES.has(cause.code))
  );
}

function refuseUpgrade(socket: Duplex, error: ApiError): void {
  const body = JSON.stringify(error.body());
  socket.end(
    `HTTP/1.1 ${String(error.status)} ${error.code}\r\ncontent-type: application/json\r\ncontent-length: ${String(Buffer.byteLength(body))}\r\nconnection: close\r\n\r\n${body}`,
  );
}

interface UpgradePort {
  readonly upgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

function nativeSocketOf(context: ServerContext, pathname: string): UpgradePort | undefined {
  switch (pathname) {
    case EMBEDDED_BROWSER_PATH:
      return context.browser.sockets;
    case NODE_HARNESS_PATH:
      return context.harnessSockets;
    case NODE_AI_PATH:
      return context.nodeSockets;
    default:
      return undefined;
  }
}

function rawUpgradeOf(
  routes: readonly RawRoute[],
  pathname: string,
): {
  readonly handle: NonNullable<RawRoute['upgrade']>;
  readonly params: Readonly<Record<string, string>>;
} | null {
  for (const { path, upgrade } of routes) {
    if (upgrade === undefined) continue;
    const params = matchPath(path, pathname);
    if (params !== null) return { handle: upgrade, params };
  }
  return null;
}

async function upgrade(
  options: HttpServerOptions,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  const url = urlOf(request);
  const native = nativeSocketOf(options.context, url.pathname);
  if (native !== undefined) {
    native.upgrade(request, socket, head);
    return;
  }
  if (url.pathname === MEDIA_PATHS.live) {
    options.context.live.upgrade(request, socket, head);
    return;
  }
  if (url.pathname === TALK_PATH) {
    options.context.talk.upgrade(request, socket, head);
    return;
  }
  if (url.pathname === ASSISTANT_VOICE_PATH) {
    options.assistantVoice.upgrade(request, socket, head);
    return;
  }
  const raw = rawUpgradeOf(options.rawRoutes, url.pathname);
  if (raw !== null) {
    await raw.handle(request, socket, head, raw.params);
    return;
  }
  const camera = matchPath(MEDIA_PATHS.cameraStream, url.pathname);
  if (camera === null) {
    throw new ApiError('not_found', 'There is no WebSocket at this address.');
  }
  options.context.links.verify(url);
  const deviceId = camera['deviceId'] ?? '';
  await options.context.hub.streamReady(deviceId);
  options.cameraSockets.relay(request, socket, head, options.go2rtc.socketOf(deviceId));
}

export function createHttpServer(options: HttpServerOptions, tls?: TlsOptions): Server {
  const serving: Serving = { ...options, thumbnails: new Thumbnails() };
  const observer = new ServerObserver(tls === undefined ? 'http' : 'https');
  const handler = (request: IncomingMessage, response: ServerResponse): void => {
    const trace = beginTrace(response);
    response.once('close', () => {
      observer.finished(request, response, trace);
    });
    serve(serving, request, response).catch((cause: unknown) => {
      if (disconnected(response, cause)) return;
      const failure = httpFailureOf(cause);
      observer.failed(request, response, trace, failure);
      if (response.destroyed) return;
      sendError(response, failure.error);
    });
  };
  const server = tls === undefined ? createServer(handler) : createSecureServer(tls, handler);
  server.on('connection', (socket) => {
    observer.connected(socket);
  });
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    observer.upgrading(request, socket);
    upgrade(options, request, socket, head).catch((cause: unknown) => {
      const failure = httpFailureOf(cause);
      observer.upgradeRefused(request, failure);
      refuseUpgrade(socket, failure.error);
    });
  });
  if (tls !== undefined) {
    server.on('tlsClientError', (cause: NodeJS.ErrnoException) => {
      observer.tlsRejected(cause);
    });
  }
  observer.summarise(server);
  return server;
}
