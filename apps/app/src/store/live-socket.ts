import {
  LIVE_MESSAGE,
  MEDIA_PATHS,
  liveProtocols,
  type LiveClientMessageInput,
  type LiveMessage,
} from '@smarteverything/domain';
import { z } from 'zod';
import { readLeniently } from '../api/connection/readable';
import { jsonText } from '../format/json-text';

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

function readLiveMessage(data: unknown): Received {
  if (typeof data !== 'string') {
    return { kind: 'unreadable', reason: 'the server sent a binary frame', table: null };
  }
  const read = jsonText(data);
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

export interface SocketHandlers {
  readonly onOpen: () => void;
  readonly onMessage: (received: Received) => void;
  readonly onClose: (code: number, reason: string) => void;
}

export interface SocketTarget {
  readonly url: string;
  readonly token: string;
  readonly subscribe: LiveClientMessageInput;
}

export function openLiveSocket(target: SocketTarget, handlers: SocketHandlers): () => void {
  const url = `${target.url.replace(/^http/, 'ws')}${MEDIA_PATHS.live}`;
  const socket = new WebSocket(url, [...liveProtocols(target.token)]);
  let closedByUs = false;
  socket.onopen = (): void => {
    socket.send(JSON.stringify(target.subscribe));
    handlers.onOpen();
  };
  socket.onmessage = (event: { readonly data: unknown }): void => {
    handlers.onMessage(readLiveMessage(event.data));
  };
  socket.onclose = (event): void => {
    if (!closedByUs) {
      handlers.onClose(event.code, event.reason);
    }
  };
  return (): void => {
    closedByUs = true;
    socket.close();
  };
}
