import { createServer, type Server } from 'node:http';
import { API_ERROR_STATUS, ApiError } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

const RETRY_AFTER_SECONDS = 2;

const STARTING = new ApiError(
  'hub_starting',
  'The hub is starting up. Try again in a few seconds.',
);

export interface StartingListener {
  readonly close: () => Promise<void>;
}

const NONE: StartingListener = { close: () => Promise.resolve() };

export async function listenWhileStarting(
  port: number,
  host: string,
  log: Logger,
): Promise<StartingListener> {
  if (port === 0) return NONE;
  const server = createServer((_request, response) => {
    const text = JSON.stringify(STARTING.body());
    response.writeHead(API_ERROR_STATUS.hub_starting, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(text),
      'cache-control': 'no-store',
      'retry-after': String(RETRY_AFTER_SECONDS),
      connection: 'close',
    });
    response.end(text);
  });
  server.on('error', (cause) => {
    log.warn('server.starting_listener_error', { reason: cause.message });
  });
  const bound = await new Promise<boolean>((resolve) => {
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, host, () => {
      resolve(true);
    });
  });
  if (!bound) return NONE;
  log.info('server.starting_listener_open', { port });
  return { close: () => closed(server) };
}

function closed(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
    server.closeAllConnections();
  });
}
