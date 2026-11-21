import {
  LIVE_CLIENT_MESSAGE,
  type LiveClientMessage,
  type LiveMessage,
  type LiveStream,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { z } from 'zod';
import type { Connection } from './live-visibility';

type LiveAudience = 'everyone' | 'owners' | LiveStream;

const WATCH_MESSAGES = ['watch', 'watch_automations', 'voice_levels_watch'] as const;

export type WatchMessageType = (typeof WATCH_MESSAGES)[number];

export function hears(connection: Connection, audience: LiveAudience): boolean {
  if (audience === 'everyone') {
    return true;
  }
  if (audience === 'owners') {
    return connection.client.role === 'owner';
  }
  return connection.streams.has(audience);
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) return text;
    throw error;
  }
}

export function readSubscribe(text: string): LiveClientMessage | z.ZodError {
  const parsed = LIVE_CLIENT_MESSAGE.safeParse(parseJson(text));
  return parsed.success ? parsed.data : parsed.error;
}

export function watchMessageOf(text: string): WatchMessageType | null {
  const parsed = parseJson(text);
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return null;
  const { type } = parsed;
  for (const known of WATCH_MESSAGES) if (known === type) return known;
  return null;
}

export function liveRefused(
  log: Logger,
  connection: { readonly id: number; readonly client: { readonly id: string } },
  watch: WatchMessageType | null,
  issues: string,
): LiveMessage {
  if (watch === null) {
    return {
      type: 'refused',
      error: { code: 'invalid_request', message: `The live message is not valid: ${issues}.` },
    };
  }
  log.warn('live.watch_refused', {
    socketId: connection.id,
    clientId: connection.client.id,
    message: watch,
    issues,
  });
  return {
    type: 'refused',
    error: {
      code: 'invalid_request',
      reason: watch,
      message: `The live ${watch} message is not valid: ${issues}.`,
    },
  };
}
