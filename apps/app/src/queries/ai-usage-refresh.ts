import type { QueryClient } from '@tanstack/react-query';
import type { LiveWireChange } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { AI_USAGE_PREFIX } from './keys';

const QUIET_MS = 1500;
const LONGEST_WAIT_MS = 10_000;

interface Pending {
  readonly since: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

const pending = new WeakMap<QueryClient, Pending>();

function refresh(client: QueryClient): void {
  pending.delete(client);
  background(
    client.invalidateQueries(
      { queryKey: AI_USAGE_PREFIX, refetchType: 'active' },
      { cancelRefetch: false },
    ),
    'queries.invalidate_failed',
  );
}

export function refreshAiUsageSoon(client: QueryClient, frames: readonly LiveWireChange[]): void {
  if (!frames.some((frame) => frame.table === 'ai_usage')) return;
  const now = Date.now();
  const waiting = pending.get(client);
  const since = waiting?.since ?? now;
  if (waiting !== undefined) clearTimeout(waiting.timer);
  const delay = Math.min(QUIET_MS, since + LONGEST_WAIT_MS - now);
  const timer = setTimeout(refresh, Math.max(0, delay), client);
  pending.set(client, { since, timer });
}
