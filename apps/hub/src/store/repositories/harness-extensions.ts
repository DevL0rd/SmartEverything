import { z } from 'zod';
import { HARNESS_EXTENSION_SOURCE, JSON_VALUE } from '@smarteverything/domain';
import type { HarnessBuiltinSelection } from '@smarteverything/harness';
import type { StoreContext } from '../context';
import { flag, jsonText, SQL_FLAG, SQL_JSON } from '../sql';

const BUILTIN_ROW = z.strictObject({
  id: z.string(),
  enabled: SQL_FLAG,
  config: SQL_JSON.pipe(z.record(z.string(), JSON_VALUE)),
});
const EXTENSION_ROW = z.strictObject({
  id: z.string(),
  kind: z.enum(['skill', 'plugin']),
  enabled: SQL_FLAG,
  source: SQL_JSON.pipe(HARNESS_EXTENSION_SOURCE),
  version: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  publisher: z.string(),
  license: z.string().nullable(),
  executes: SQL_FLAG,
  confirmed: SQL_FLAG,
  installed_at: z.string(),
});
export type StoredExtension = z.infer<typeof EXTENSION_ROW>;
const COLUMNS =
  'id,kind,enabled,source,version,name,description,publisher,license,executes,confirmed,installed_at';

export class HarnessExtensionsRepository {
  constructor(private readonly context: StoreContext) {}

  builtins(): Readonly<Record<string, HarnessBuiltinSelection>> {
    const rows = this.context.sql.all(
      BUILTIN_ROW,
      'select id,enabled,config from harness_builtins',
    );
    return Object.fromEntries(
      rows.map((row) => [row.id, { enabled: row.enabled, config: row.config }]),
    );
  }

  keepBuiltin(id: string, selection: HarnessBuiltinSelection): void {
    this.context.write(() => {
      this.context.sql.run(
        'save a built-in extension choice',
        'insert into harness_builtins(id,enabled,config) values($id,$enabled,$config) on conflict(id) do update set enabled=excluded.enabled,config=excluded.config',
        { id, enabled: flag(selection.enabled), config: jsonText(selection.config) },
      );
    });
  }

  list(): StoredExtension[] {
    return this.context.sql.all(
      EXTENSION_ROW,
      `select ${COLUMNS} from harness_extensions order by kind,name`,
    );
  }

  find(id: string): StoredExtension | undefined {
    return this.context.sql.get(
      EXTENSION_ROW,
      `select ${COLUMNS} from harness_extensions where id=$id`,
      { id },
    );
  }

  keep(row: StoredExtension): void {
    this.context.write(() => {
      this.context.sql.run(
        'save an installed skill or plugin',
        `insert into harness_extensions(${COLUMNS}) values($id,$kind,$enabled,$source,$version,$name,$description,$publisher,$license,$executes,$confirmed,$installed_at)
         on conflict(id) do update set enabled=excluded.enabled,source=excluded.source,version=excluded.version,name=excluded.name,description=excluded.description,publisher=excluded.publisher,license=excluded.license,executes=excluded.executes,confirmed=excluded.confirmed`,
        {
          ...row,
          enabled: flag(row.enabled),
          source: jsonText(row.source),
          executes: flag(row.executes),
          confirmed: flag(row.confirmed),
        },
      );
    });
  }

  remove(id: string): boolean {
    return (
      this.context.write(() =>
        this.context.sql.run(
          'remove an installed skill or plugin',
          'delete from harness_extensions where id=$id',
          { id },
        ),
      ) > 0
    );
  }
}
