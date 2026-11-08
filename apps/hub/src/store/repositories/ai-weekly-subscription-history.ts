import {
  AI_CHAT_SUBSCRIPTION_SAMPLE,
  SUBSCRIPTION_WEEK_MINUTES,
  USAGE_SERIES_POINTS_MAX,
  harnessTargetKey,
  weeklySubscriptionWindow,
  type AiModelRoute,
  type AiSubscriptionUsage,
  type ComputerAiRuntime,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { moment, type StoreContext } from '../context';

const WEEK_MS = SUBSCRIPTION_WEEK_MINUTES * 60_000;
const SCOPE_SQL = 'profile_id = $profileId and route = $route and host = $host';

type Sample = z.infer<typeof AI_CHAT_SUBSCRIPTION_SAMPLE>;

interface SubscriptionScope {
  readonly profileId: string;
  readonly route: string;
  readonly host: string;
  readonly source: 'native' | 'route';
}

export function nativeSubscriptionScope(
  profileId: string,
  runtime: ComputerAiRuntime,
  deviceId: string,
): SubscriptionScope {
  return { profileId, route: runtime, host: deviceId, source: 'native' };
}

export function modelSubscriptionScope(route: AiModelRoute): SubscriptionScope | undefined {
  if (route.billing !== 'subscription-only' || route.credential_generation === undefined)
    return undefined;
  return {
    profileId: route.profile_id,
    route: `${route.id}:${route.credential_generation}`,
    host: harnessTargetKey(route.supplier),
    source: 'route',
  };
}

function observedSample(usage: AiSubscriptionUsage): Sample | undefined {
  const window = weeklySubscriptionWindow(usage);
  if (
    usage.status !== 'reported' ||
    typeof window?.used_percent !== 'number' ||
    window.resets_at === null
  )
    return undefined;
  const at = Date.parse(usage.reported_at);
  const reset = Date.parse(window.resets_at);
  if (at >= reset || at < reset - WEEK_MS) return undefined;
  return {
    kind: 'subscription',
    at: moment(usage.reported_at),
    resets_at: moment(window.resets_at),
    percent: Math.min(window.used_percent, 100),
  };
}

export class AiWeeklySubscriptionHistory {
  constructor(private readonly context: StoreContext) {}

  read(scope: SubscriptionScope): Sample[] {
    const { profileId, route, host } = scope;
    return this.context.sql.all(
      AI_CHAT_SUBSCRIPTION_SAMPLE,
      `with latest as (
         select resets_at from ai_weekly_subscription_history
         where ${SCOPE_SQL} and at <= $now order by at desc limit 1
       )
       select at, 'subscription' as kind, percent, resets_at
       from ai_weekly_subscription_history
       where ${SCOPE_SQL} and at <= $now and resets_at > $now
       and resets_at = (select resets_at from latest)
       order by at`,
      { profileId, route, host, now: this.context.now() },
    );
  }

  observe(scope: SubscriptionScope, usage: AiSubscriptionUsage): boolean {
    const sample = observedSample(usage);
    if (sample === undefined) return false;
    return this.context.write(() => this.keep(scope, sample));
  }

  changed(profileId: string, source: SubscriptionScope['source']): void {
    this.context.notice({ type: 'ai_subscription_usage_changed', profile_id: profileId, source });
  }

  private keep({ profileId, route, host, source }: SubscriptionScope, sample: Sample): boolean {
    const { at, percent, resets_at: reset } = sample;
    const now = this.context.now();
    if (reset <= now) return false;
    const scope = { profileId, route, host };
    const inserted = this.context.sql.run(
      'retain the observed weekly subscription allowance',
      `insert into ai_weekly_subscription_history
       (profile_id, route, host, at, resets_at, percent)
       values ($profileId, $route, $host, $at, $reset, $percent)
       on conflict (profile_id, route, host, at) do nothing`,
      { ...scope, at, reset, percent },
    );
    if (inserted === 0) return false;
    this.context.sql.run(
      'expire completed subscription cycles',
      'delete from ai_weekly_subscription_history where resets_at <= $now',
      { now },
    );
    this.context.sql.run(
      'retain the newest weekly subscription readings within the chart limit',
      `delete from ai_weekly_subscription_history where ${SCOPE_SQL} and at in (
         select at from ai_weekly_subscription_history where ${SCOPE_SQL}
         order by at desc limit -1 offset $limit
       )`,
      { ...scope, limit: USAGE_SERIES_POINTS_MAX },
    );
    this.changed(profileId, source);
    return true;
  }
}
