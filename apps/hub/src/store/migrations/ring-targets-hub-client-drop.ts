import type { Migration } from './migration';

const HUB_CLIENT_TARGET = `json_extract(value, '$.kind') = 'client'
  and json_extract(value, '$.clientId') in (select id from clients where built_in = 1)`;

const KEPT = (targets: string): string =>
  `(select json_group_array(json(value)) from json_each(${targets}) where not (${HUB_CLIENT_TARGET}))`;

const HAS_HUB_CLIENT = (targets: string): string =>
  `exists (select 1 from json_each(${targets}) where ${HUB_CLIENT_TARGET})`;

export const RING_TARGETS_HUB_CLIENT_DROP_MIGRATION: Migration = {
  version: 205,
  name: 'ring-targets-hub-client-drop',
  statements: [
    `update planner_alarms set targets = ${KEPT('targets')} where ${HAS_HUB_CLIENT('targets')}`,
    `update planner_timers set targets = ${KEPT('targets')} where ${HAS_HUB_CLIENT('targets')}`,
    `update planner_preferences set preferences = json_set(
      preferences, '$.clock.targets', json(${KEPT("json_extract(preferences, '$.clock.targets')")})
    ) where ${HAS_HUB_CLIENT("json_extract(preferences, '$.clock.targets')")}`,
  ],
};
