import { LIVE_TABLES } from '@smarteverything/domain';
import { z } from 'zod';
import type { LiveDialect, LiveNotice, Subscription } from './live-dialect';

const LEGACY_SUBSCRIBE = z.strictObject({
  type: z.literal('subscribe'),
  tables: z.array(z.enum(LIVE_TABLES)),
});

const LEGACY_NOTICES: ReadonlySet<LiveNotice['type']> = new Set(['presence', 'refused']);

const LEGACY_DIALECT: LiveDialect = {
  name: 'legacy',
  ready: (greeting) => greeting,
  subscribed: (tables) => ({ type: 'subscribed', tables: [...tables] }),
  hears: (notice) => LEGACY_NOTICES.has(notice.type),
};

export function readLegacySubscribe(raw: unknown): Subscription | null {
  const parsed = LEGACY_SUBSCRIBE.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return { dialect: LEGACY_DIALECT, message: { ...parsed.data, streams: [] } };
}
