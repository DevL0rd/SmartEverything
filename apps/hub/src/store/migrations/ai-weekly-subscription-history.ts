import type { Migration } from './migration';

export const AI_WEEKLY_SUBSCRIPTION_HISTORY_MIGRATION: Migration = {
  version: 176,
  name: 'ai-weekly-subscription-history',
  statements: [
    `create table ai_weekly_subscription_history (
      profile_id text not null references profiles (id) on delete cascade,
      route text not null,
      host text not null,
      at text not null,
      resets_at text not null,
      percent real not null check (percent between 0 and 100),
      primary key (profile_id, route, host, at)
    ) strict`,
    'create index ai_weekly_subscription_history_by_reset on ai_weekly_subscription_history (resets_at)',
  ],
};
