import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  ASSISTANT_VOICE_PATH,
  ApiError,
  MEDIA_PATHS,
  TALK_PATH,
  matchPath,
  type HttpMethod,
} from '@smarteverything/domain';
import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { Go2rtcClient } from '../cameras/go2rtc-client';
import { Thumbnails } from '../cameras/thumbnails';
import type { CameraSockets } from './camera-socket';
import type { ServerContext } from './context';
import { apiErrorFor } from './errors';
import { sendError } from './http';
import { recordingFile, sendRecording } from './recording-files';
import type { Router } from './router';

export interface RawRoute {
  readonly method: HttpMethod;
  readonly path: string;
  readonly handle: (
    request: IncomingMessage,
    response: ServerResponse,
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

const ALLOWED_HEADERS = 'authorization, content-type, range';
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE';

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
  const origin = request.headers.origin;
  if (origin === undefined || isPublicOrigin(options, origin)) {
    return true;
  }
  if (!options.allowedOrigins.has(origin)) {
    sendError(response, new ApiError('forbidden', `Requests from ${origin} are not allowed.`));
    return false;
  }
  response.setHeader('access-control-allow-origin', origin);
  response.setHeader('vary', 'origin');
  if (request.method === 'OPTIONS') {
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
  const probe = matchPath(MEDIA_PATHS.publicUrlProbe, url.pathname);
  if (probe === null) {
    return Promise.resolve(false);
  }
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
  options.context.links.verify(url);
  const file = options.context.store.assistantChat.attachment(found['attachmentId'] ?? '');
  const path = options.context.assistant.files.pathOf(file);
  await sendRecording({ path, contentType: file.mime }, request, response);
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
    ? new ApiError(
        'method_not_allowed',
        `${request.method ?? 'GET'} is not allowed on ${urlOf(request).pathname}.`,
      )
    : new ApiError('not_found', `There is nothing at ${urlOf(request).pathname}.`);
}

function failed(options: HttpServerOptions, cause: unknown): ApiError {
  const known = apiErrorFor(cause);
  if (known !== null) {
    return known;
  }
  options.context.log.exception('request.crashed', cause);
  return new ApiError('internal', 'The server failed while handling this request; see its log.');
}

function refuseUpgrade(socket: Duplex, error: ApiError): void {
  const body = JSON.stringify(error.body());
  socket.end(
    `HTTP/1.1 ${String(error.status)} ${error.code}\r\ncontent-type: application/json\r\ncontent-length: ${String(Buffer.byteLength(body))}\r\nconnection: close\r\n\r\n${body}`,
  );
}

async function upgrade(
  options: HttpServerOptions,
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  const url = urlOf(request);
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
  const camera = matchPath(MEDIA_PATHS.cameraStream, url.pathname);
  if (camera === null) {
    throw new ApiError('not_found', `There is no WebSocket at ${url.pathname}.`);
  }
  options.context.links.verify(url);
  const deviceId = camera['deviceId'] ?? '';
  await options.context.hub.streamReady(deviceId);
  options.cameraSockets.relay(request, socket, head, options.go2rtc.socketOf(deviceId));
}

export function createHttpServer(options: HttpServerOptions): Server {
  const serving: Serving = { ...options, thumbnails: new Thumbnails() };
  const server = createServer((request, response) => {
    serve(serving, request, response).catch((cause: unknown) => {
      sendError(response, failed(options, cause));
    });
  });
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    upgrade(options, request, socket, head).catch((cause: unknown) => {
      refuseUpgrade(socket, failed(options, cause));
    });
  });
  return server;
}
