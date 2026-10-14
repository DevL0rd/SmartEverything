import { LIVE_CLIENT_MESSAGE, type LiveStream } from '@smarteverything/domain';
import type { z } from 'zod';
import {
  CURRENT_DIALECT,
  type Subscription,
  type LiveDialect,
  type LiveNotice,
} from './live-dialect';
import { readLegacySubscribe } from './live-legacy';
import type { Connection } from './live-visibility';

type LiveAudience = 'everyone' | 'owners' | LiveStream;

export function hears(
  connection: Connection,
  dialect: LiveDialect | undefined,
  notice: LiveNotice,
  audience: LiveAudience,
): boolean {
  if (dialect?.hears(notice) !== true) {
    return false;
  }
  if (audience === 'everyone') {
    return true;
  }
  if (audience === 'owners') {
    return connection.client.role === 'owner';
  }
  return connection.streams.has(audience);
}

export function readSubscribe(raw: unknown): Subscription | z.ZodError {
  const legacy = readLegacySubscribe(raw);
  if (legacy !== null) {
    return legacy;
  }
  const parsed = LIVE_CLIENT_MESSAGE.safeParse(raw);
  return parsed.success ? { dialect: CURRENT_DIALECT, message: parsed.data } : parsed.error;
}
