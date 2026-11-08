import { ENGINE, ENGINE_WRITE, type Engine } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { jsonText, SQL_JSON } from '../sql';

const DEFAULT = z.strictObject({ engine: SQL_JSON.pipe(ENGINE).nullable() });
export class AiEngineDefaultsRepository {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly context: StoreContext) {}

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  read(): Engine | null {
    return (
      this.context.sql.get(DEFAULT, 'select engine from ai_engine_defaults where singleton = 1')
        ?.engine ?? null
    );
  }

  update(engine: Engine | null): Engine | null {
    const parsed = engine === null ? null : ENGINE_WRITE.parse(engine);
    return this.context.write(() => {
      const previous = this.read();
      this.context.sql.run(
        'set the chat engine default',
        `insert into ai_engine_defaults(singleton, engine, updated_at) values(1, $engine, $now)
         on conflict(singleton) do update set engine = excluded.engine, updated_at = excluded.updated_at`,
        { engine: parsed === null ? null : jsonText(parsed), now: this.context.now() },
      );
      if (JSON.stringify(previous) !== JSON.stringify(parsed)) {
        const listeners = [...this.listeners];
        this.context.afterCommit(() => {
          for (const listener of listeners) if (this.listeners.has(listener)) listener();
        });
      }
      return parsed;
    });
  }
}
