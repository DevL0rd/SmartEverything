import type { LogPayload } from '@smarteverything/logging';
import type { Migration } from './migration';
import type { Sql } from '../sql';

function givePlannerArea(sql: Sql): LogPayload {
  const granted = sql.run(
    'give every stored member access the planner area',
    `update person_access
     set scopes = json_set(scopes, '$.areas', json_insert(json_extract(scopes, '$.areas'), '$[#]', 'planner'))
     where role <> 'owner'
       and json_type(scopes, '$.areas') = 'array'
       and not exists (
         select 1 from json_each(scopes, '$.areas') where value = 'planner'
       )`,
  );
  return { granted };
}

export const PLANNER_MEMBER_AREA_MIGRATION: Migration = {
  version: 185,
  name: 'planner-member-area',
  statements: [],
  backfill: givePlannerArea,
};
