import { ENGINE, ENGINE_WRITE, type Engine } from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import type { StoreHost } from '../host/host';
import { jsonText, SQL_JSON } from '../sql';

const DEFAULT = z.strictObject({ engine: SQL_JSON.pipe(ENGINE).nullable() });

export interface EngineDefaultUpdate {
  readonly engine: Engine | null;
  readonly changed: boolean;
}

export class AiEngineDefaultsRepository {
  constructor(private readonly context: StoreContext) {}

  read(): Engine | null {
    return (
      this.context.sql.get(DEFAULT, 'select engine from ai_engine_defaults where singleton = 1')
        ?.engine ?? null
    );
  }

  update(engine: Engine | null): EngineDefaultUpdate {
    const parsed = engine === null ? null : ENGINE_WRITE.parse(engine);
    return this.context.write(() => {
      const previous = this.read();
      this.context.sql.run(
        'set the chat engine default',
        `insert into ai_engine_defaults(singleton, engine, updated_at) values(1, $engine, $now)
         on conflict(singleton) do update set engine = excluded.engine, updated_at = excluded.updated_at`,
        { engine: parsed === null ? null : jsonText(parsed), now: this.context.now() },
      );
      return { engine: parsed, changed: JSON.stringify(previous) !== JSON.stringify(parsed) };
    });
  }
}

export class AiEngineDefaultsNotLoadedError extends Error {
  override readonly name = 'AiEngineDefaultsNotLoadedError';

  constructor() {
    super('The chat engine default was read before it was loaded from the store host.');
  }
}

export class AiEngineDefaultsWatch {
  private readonly listeners = new Set<() => void>();
  private current: { readonly engine: Engine | null } | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly host: StoreHost) {}

  load(): Promise<void> {
    this.loading ??= this.host.call('aiEngineDefaults', 'read').then((engine) => {
      this.current ??= { engine };
    });
    return this.loading;
  }

  read(): Engine | null {
    if (this.current === null) throw new AiEngineDefaultsNotLoadedError();
    return this.current.engine;
  }

  onChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  async update(engine: Engine | null): Promise<Engine | null> {
    const updated = await this.host.call('aiEngineDefaults', 'update', engine);
    this.current = { engine: updated.engine };
    if (updated.changed) for (const listener of [...this.listeners]) listener();
    return updated.engine;
  }
}
