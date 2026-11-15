import type { LogPayload } from '@smarteverything/logging';
import type { Migration } from './migration';
import type { Sql } from '../sql';

function giveDriveArea(sql: Sql): LogPayload {
  const granted = sql.run(
    'give every stored member access the drive area',
    `update person_access
     set scopes = json_set(scopes, '$.areas', json_insert(json_extract(scopes, '$.areas'), '$[#]', 'drive'))
     where role <> 'owner'
       and json_type(scopes, '$.areas') = 'array'
       and not exists (
         select 1 from json_each(scopes, '$.areas') where value = 'drive'
       )`,
  );
  return { granted };
}

export const DRIVE_MEMBER_AREA_MIGRATION: Migration = {
  version: 222,
  name: 'drive-member-area',
  statements: [],
  backfill: giveDriveArea,
};
