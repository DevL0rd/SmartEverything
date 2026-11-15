import type { Migration } from './migration';

const OLD_SMART_LISTS =
  '["today","upcoming","overdue","device_tasks","habits","someday","completed"]';

const NEW_SMART_LISTS =
  '["today","upcoming","overdue","assigned","device_tasks","habits","someday","completed"]';

const BEDTIME =
  '{"enabled":false,"schedule":[],"reminder_minutes":30,"wind_down_minutes":30,"wind_down_scene_id":null,"do_not_disturb":true,"sleep_sound":null}';

const SLEEP_SOUNDS = '{"sound":null,"timer_minutes":60,"fade_seconds":30}';

export const PLANNER_CLOCK_WAVE2_MIGRATION: Migration = {
  version: 207,
  name: 'planner-clock-wave2',
  statements: [
    'alter table planner_alarms add column snooze_limit integer check (snooze_limit > 0)',
    `alter table planner_alarms add column challenge text not null default '{"kind":"none"}'
      check (json_valid(challenge) and json_type(challenge) = 'object')`,
    `alter table planner_alarms add column sunrise text
      check (sunrise is null or (json_valid(sunrise) and json_type(sunrise) = 'object'))`,
    "update planner_alarms set sound = json_object('kind', 'tone', 'id', sound)",
    `update planner_preferences set preferences = json_set(
      preferences,
      '$.clock.sound', json_object('kind', 'tone', 'id', json_extract(preferences, '$.clock.sound')),
      '$.clock.snooze_limit', null,
      '$.bedtime', json('${BEDTIME}'),
      '$.sleep_sounds', json('${SLEEP_SOUNDS}'),
      '$.tasks.smart_lists', case
        when json_extract(preferences, '$.tasks.smart_lists') = '${OLD_SMART_LISTS}'
        then json('${NEW_SMART_LISTS}')
        else json(json_extract(preferences, '$.tasks.smart_lists'))
      end
    )`,
  ],
};
