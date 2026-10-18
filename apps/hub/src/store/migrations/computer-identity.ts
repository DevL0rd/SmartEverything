import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import type { Sql } from '../sql';

const ROLE_SUFFIX = ':pc';

const DUPLICATE = z.object({ id: z.string(), external_id: z.string() });
const REFERENCE = z.object({ table_name: z.string(), column_name: z.string() });
const SURVIVOR = z.object({ id: z.string() });

function quoted(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function repoint(sql: Sql, duplicate: string, survivor: string): void {
  sql.database.exec('pragma defer_foreign_keys = on');
  const references = sql.all(
    REFERENCE,
    `select m.name as table_name, f."from" as column_name
     from sqlite_master m, pragma_foreign_key_list(m.name) f
     where m.type = 'table'
       and (f."table" = 'devices' or (f."table" = 'computer_nodes' and f."to" = 'device_id'))`,
  );
  for (const { table_name: table, column_name: column } of references) {
    sql.run(
      'point the duplicate computer rows at the surviving computer',
      `update or ignore ${quoted(table)} set ${quoted(column)} = $survivor where ${quoted(column)} = $duplicate`,
      { survivor, duplicate },
    );
    sql.run(
      'drop the duplicate computer rows the surviving computer already has',
      `delete from ${quoted(table)} where ${quoted(column)} = $duplicate`,
      { duplicate },
    );
  }
  sql.run('remove the duplicate computer', 'delete from devices where id = $duplicate', {
    duplicate,
  });
}

export function mergeComputerRoleRows(sql: Sql): LogPayload {
  const duplicates = sql.all(
    DUPLICATE,
    `select id, external_id from devices
     where provider = 'local' and kind = 'computer' and external_id like 'computer:%${ROLE_SUFFIX}'`,
  );
  let merged = 0;
  let renamed = 0;
  for (const duplicate of duplicates) {
    const externalId = duplicate.external_id.slice(0, -ROLE_SUFFIX.length);
    const survivor = sql.get(
      SURVIVOR,
      "select id from devices where provider = 'local' and external_id = $externalId",
      { externalId },
    );
    if (survivor === undefined) {
      sql.run(
        'give the computer its machine-only id',
        'update devices set external_id = $externalId where id = $id',
        { externalId, id: duplicate.id },
      );
      renamed += 1;
    } else {
      repoint(sql, duplicate.id, survivor.id);
      merged += 1;
    }
  }
  return { duplicates: duplicates.length, merged, renamed };
}
