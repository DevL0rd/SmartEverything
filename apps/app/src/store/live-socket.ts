import {
  LIVE_MESSAGE,
  MEDIA_PATHS,
  liveProtocols,
  type LiveClientMessageInput,
  type LiveMessage,
} from '@smarteverything/domain';
import { z } from 'zod';
import { traceSocket } from './live-socket-log';
import { readLeniently } from '../api/connection/readable';
import { jsonText } from '../format/json-text';
import { openHubSocket } from '../api/connection/hub-socket';
import { markJsonParsed, timedRead } from '../dev/wire-probe';

export const TOKEN_WITHDRAWN = 4001;

const BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 16_000, 30_000];

export function backoffOf(attempt: number): number {
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 30_000;
}

export type Received =
  | { readonly kind: 'message'; readonly message: LiveMessage }
  | { readonly kind: 'unreadable'; readonly reason: string; readonly table: string | null };

const CHANGED_TABLE = z.looseObject({ type: z.literal('change'), table: z.string() });

function tableOf(value: unknown): string | null {
  const change = CHANGED_TABLE.safeParse(value);
  return change.success ? change.data.table : null;
}

function labelOf(received: Received): string {
  if (received.kind === 'unreadable') {
    return 'unreadable';
  }
  const message = received.message;
  return message.type === 'change' ? `change.${message.table}` : message.type;
}

function readLiveMessage(data: unknown): Received {
  if (typeof data !== 'string') {
    return { kind: 'unreadable', reason: 'the server sent a binary frame', table: null };
  }
  const read = jsonText(data);
  markJsonParsed();
  if (!read.ok) {
    return {
      kind: 'unreadable',
      reason: `the server sent text that is not JSON: ${read.reason}`,
      table: null,
    };
  }
  const parsed = readLeniently(LIVE_MESSAGE, read.value);
  if (!parsed.ok) {
    return {
      kind: 'unreadable',
      table: tableOf(read.value),
      reason: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || 'message'} ${issue.message}`)
        .join('; '),
    };
  }
  return { kind: 'message', message: parsed.data };
}

export type SendLive = (message: LiveClientMessageInput) => void;

export interface SocketHandlers {
  readonly onOpen: (send: SendLive) => void;
  readonly onMessage: (received: Received) => void;
  readonly onClose: (code: number, reason: string) => void;
}

export interface SocketTarget {
  readonly url: string;
  readonly token: string;
  readonly subscribe: Extract<LiveClientMessageInput, { readonly type: 'subscribe' }>;
}

export function openLiveSocket(target: SocketTarget, handlers: SocketHandlers): () => void {
  const trace = traceSocket(MEDIA_PATHS.live);
  trace.opening();
  let socket: ReturnType<typeof openHubSocket>;
  try {
    socket = openHubSocket(target, MEDIA_PATHS.live, liveProtocols(target.token));
  } catch (error) {
    trace.openFailed(error);
    throw error;
  }
  let closedByUs = false;
  socket.onopen = (): void => {
    trace.opened(target.subscribe.tables.length);
    try {
      socket.send(JSON.stringify(target.subscribe));
    } catch (error) {
      trace.subscribeFailed(error);
      throw error;
    }
    handlers.onOpen((message) => {
      socket.send(JSON.stringify(message));
    });
  };
  socket.onmessage = (event: { readonly data: unknown }): void => {
    const read = timedRead(event.data, readLiveMessage, labelOf);
    trace.frame(labelOf(read), typeof event.data === 'string' ? event.data.length : 0);
    handlers.onMessage(read);
  };
  socket.onerror = (): void => {
    trace.errored(closedByUs);
  };
  socket.onclose = (event): void => {
    trace.closed(event.code, event.reason.length, closedByUs);
    if (!closedByUs) {
      handlers.onClose(event.code, event.reason);
    }
  };
  return (): void => {
    trace.closing(closedByUs);
    closedByUs = true;
    try {
      socket.close();
    } catch (error) {
      trace.closeFailed(error);
      throw error;
    }
  };
}
