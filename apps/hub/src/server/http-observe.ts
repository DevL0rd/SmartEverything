import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  ASSISTANT_VOICE_PATH,
  BEARER_PROTOCOL_PREFIX,
  EMBEDDED_BROWSER_PATH,
  MEDIA_PATHS,
  NODE_AI_PATH,
  NODE_HARNESS_PATH,
  TALK_PATH,
  matchPath,
} from '@smarteverything/domain';
import { Logger, passesThreshold, type LogLevel } from '@smarteverything/logging';
import { InvalidResponseError, type HttpFailure } from './errors';
import { HttpTally, SLOW_REQUEST_MS } from './http-tally';
import { RepeatGate } from './repeat-gate';
import { noteFailure, remoteKind, type RequestTrace } from './request-trace';

export const log = new Logger('hub.server');
export const refusals = new RepeatGate(30_000);

const SUMMARY_MS = 30_000;

const NATIVE_SOCKETS: ReadonlyMap<string, string> = new Map([
  [EMBEDDED_BROWSER_PATH, 'embedded-browser'],
  [NODE_HARNESS_PATH, 'node-harness'],
  [NODE_AI_PATH, 'node-ai'],
  [MEDIA_PATHS.live, 'live'],
  [TALK_PATH, 'talk'],
  [ASSISTANT_VOICE_PATH, 'assistant-voice'],
]);

function levelOf(status: number, aborted: boolean, durationMs: number): LogLevel {
  if (aborted) return 'debug';
  if (status >= 500) return 'error';
  if (status === 401 || status === 403 || status === 429 || durationMs >= SLOW_REQUEST_MS) {
    return 'info';
  }
  return 'debug';
}

function numberHeader(value: number | string | string[] | undefined): number | null {
  if (value === undefined || Array.isArray(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function upgradeRoute(request: IncomingMessage): string {
  const pathname = new URL(request.url ?? '/', 'http://server').pathname;
  const camera = matchPath(MEDIA_PATHS.cameraStream, pathname);
  return camera === null ? (NATIVE_SOCKETS.get(pathname) ?? 'unmatched') : 'camera-stream';
}

function describeUpgrade(request: IncomingMessage): Record<string, unknown> {
  const protocols = (request.headers['sec-websocket-protocol'] ?? '').split(',');
  return {
    route: upgradeRoute(request),
    remote: remoteKind(request.socket.remoteAddress),
    protocolsOffered: protocols.filter((value) => value.trim() !== '').length,
    hasOrigin: request.headers.origin !== undefined,
    hasBearer: protocols.some((value) => value.trim().startsWith(BEARER_PROTOCOL_PREFIX)),
  };
}

function requestPayload(
  listener: string,
  request: IncomingMessage,
  response: ServerResponse,
  trace: RequestTrace,
): Record<string, unknown> {
  const length = response.getHeader('content-length');
  return {
    requestId: trace.id,
    listener,
    method: request.method ?? null,
    route: trace.route ?? 'unmatched',
    access: trace.access,
    status: response.statusCode,
    durationMs: Math.round(performance.now() - trace.startedAt),
    clientId: trace.clientId,
    remote: remoteKind(request.socket.remoteAddress),
    bytesIn: numberHeader(request.headers['content-length']) ?? 0,
    bytesOut: length === undefined ? null : numberHeader(length),
    errorCode: trace.errorCode,
    aborted: !response.writableFinished,
  };
}

export class ServerObserver {
  private readonly tally = new HttpTally();

  constructor(private readonly listener: string) {}

  failed(
    request: IncomingMessage,
    response: ServerResponse,
    trace: RequestTrace,
    { error, unexpected }: HttpFailure,
  ): void {
    const shouldLog = error.status >= 500 && !trace.faultLogged;
    noteFailure(response, error.code, shouldLog);
    if (!shouldLog) return;
    const payload = {
      ...requestPayload(this.listener, request, response, trace),
      status: error.status,
      aborted: response.destroyed && !response.writableFinished,
    };
    if (unexpected !== null) {
      log.exception('request.crashed', unexpected.cause, payload);
    } else if (error.code === 'camera_unavailable' || error.code === 'claude_not_ready') {
      log.info('request.unavailable', payload);
    } else if (error instanceof InvalidResponseError) {
      log.error('response.invalid', undefined, { ...payload, issueCodes: error.issueCodes });
    } else {
      log.error('request.failed', undefined, payload);
    }
  }

  finished(request: IncomingMessage, response: ServerResponse, trace: RequestTrace): void {
    const durationMs = performance.now() - trace.startedAt;
    const aborted = !response.writableFinished;
    const length = response.getHeader('content-length');
    this.tally.record({
      status: response.statusCode,
      durationMs,
      aborted,
      route: trace.route ?? 'unmatched',
      bytesIn: numberHeader(request.headers['content-length']) ?? 0,
      bytesOut: length === undefined ? 0 : (numberHeader(length) ?? 0),
    });
    if (trace.faultLogged) return;
    const level = levelOf(response.statusCode, aborted, durationMs);
    if (!passesThreshold(level, Logger.level)) return;
    const payload = requestPayload(this.listener, request, response, trace);
    if (level === 'error') {
      noteFailure(response, null, true);
      log.error('request.failed', undefined, payload);
    } else if (level === 'info') log.info('request.completed', payload);
    else log.debug(aborted ? 'request.aborted' : 'request.completed', payload);
  }

  connected(socket: Duplex): void {
    this.tally.connected();
    socket.once('close', () => {
      this.tally.disconnected();
    });
  }

  upgrading(request: IncomingMessage, socket: Duplex): void {
    const startedAt = performance.now();
    log.debug('upgrade.received', () => ({ listener: this.listener, ...describeUpgrade(request) }));
    socket.once('close', () => {
      log.debug('upgrade.socket_closed', () => ({
        listener: this.listener,
        route: upgradeRoute(request),
        openMs: Math.round(performance.now() - startedAt),
      }));
    });
    this.tally.upgraded(false);
  }

  upgradeRefused(request: IncomingMessage, { error, unexpected }: HttpFailure): void {
    this.tally.upgraded(true);
    const suppressed = refusals.pass(`upgrade:${upgradeRoute(request)}:${error.code}`);
    if (suppressed === null) return;
    const payload = {
      listener: this.listener,
      ...describeUpgrade(request),
      status: error.status,
      errorCode: error.code,
      suppressedSince: suppressed,
    };
    if (unexpected !== null) log.exception('upgrade.crashed', unexpected.cause, payload);
    else if (error.status >= 500) log.error('upgrade.refused', undefined, payload);
    else log.warn('upgrade.refused', payload);
  }

  tlsRejected(cause: NodeJS.ErrnoException): void {
    const suppressed = refusals.pass(`tls:${cause.code ?? 'unknown'}`);
    if (suppressed === null) return;
    log.warn('tls.rejected', {
      errorCode: cause.code ?? null,
      suppressedSince: suppressed,
    });
  }

  summarise(server: Server): void {
    const timer = setInterval(() => {
      const taken = this.tally.take();
      if (taken !== null && passesThreshold('debug', Logger.level)) {
        log.debug('http.summary', () => ({
          listener: this.listener,
          windowMs: SUMMARY_MS,
          ...taken,
        }));
      }
    }, SUMMARY_MS);
    timer.unref();
    server.once('close', () => {
      clearInterval(timer);
    });
  }
}
