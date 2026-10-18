import {
  LIVE_CLIENT_MESSAGE,
  type LiveClientMessage,
  type LiveStream,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { Connection } from './live-visibility';

type LiveAudience = 'everyone' | 'owners' | LiveStream;

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
