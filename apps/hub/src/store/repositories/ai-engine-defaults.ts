import { ENGINE, ENGINE_WRITE, type Engine } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';
import { assertEngineStorageCompatible } from './engine-compatibility';

const DEFAULT = z.strictObject({ engine: SQL_JSON.pipe(ENGINE).nullable() });
export class AiEngineDefaultsRepository {
  constructor(private readonly context: StoreContext) {}

  read(): Engine | null {
    return (
      this.context.sql.get(DEFAULT, 'select engine from ai_engine_defaults where singleton = 1')
        ?.engine ?? null
    );
  }

  update(engine: Engine | null): Engine | null {
    const parsed = engine === null ? null : ENGINE_WRITE.parse(engine);
    if (parsed !== null) assertEngineStorageCompatible(parsed);
    this.context.sql.run(
      'set the chat engine default',
      `insert into ai_engine_defaults(singleton, engine, updated_at) values(1, $engine, $now)
       on conflict(singleton) do update set engine = excluded.engine, updated_at = excluded.updated_at`,
      { engine: parsed === null ? null : jsonText(parsed), now: this.context.now() },
    );
    return parsed;
  }
}
