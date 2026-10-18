import { Logger } from '@smarteverything/logging';
import { LogTally } from '../design/log-tally';

const log = new Logger('app.live-socket');
const frames = new LogTally(log, 'frames.summarised', 5000);

let counter = 0;

export interface SocketTrace {
  readonly opening: () => void;
  readonly openFailed: (error: unknown) => void;
  readonly opened: (tables: number) => void;
  readonly subscribeFailed: (error: unknown) => void;
  readonly frame: (label: string, chars: number) => void;
  readonly errored: (closedByUs: boolean) => void;
  readonly closed: (code: number, reasonLength: number, closedByUs: boolean) => void;
  readonly closing: (closedByUs: boolean) => void;
  readonly closeFailed: (error: unknown) => void;
}

export function traceSocket(path: string): SocketTrace {
  counter += 1;
  const socketId = counter;
  const startedAt = Date.now();
  const lived = (): number => Date.now() - startedAt;
  return {
    opening: (): void => {
      log.info('socket.opening', { socketId, path });
    },
    openFailed: (error): void => {
      log.error('socket.open_failed', error, { socketId, path });
    },
    opened: (tables): void => {
      log.info('socket.opened', { socketId, afterMs: lived(), tables });
    },
    subscribeFailed: (error): void => {
      log.error('socket.subscribe_failed', error, { socketId });
    },
    frame: (label, chars): void => {
      frames.bump('frames');
      frames.bump(label);
      frames.bump('chars', chars);
    },
    errored: (closedByUs): void => {
      log.warn('socket.errored', { socketId, afterMs: lived(), closedByUs });
    },
    closed: (code, reasonLength, closedByUs): void => {
      log.info('socket.closed', { socketId, code, reasonLength, livedMs: lived(), closedByUs });
    },
    closing: (closedByUs): void => {
      log.debug('socket.closing', () => ({
        socketId,
        livedMs: lived(),
        alreadyClosed: closedByUs,
      }));
    },
    closeFailed: (error): void => {
      log.warn('socket.close_failed', {
        socketId,
        errorName: error instanceof Error ? error.name : 'unknown',
      });
    },
  };
}
