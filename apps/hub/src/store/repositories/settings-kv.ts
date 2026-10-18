import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED = storedRow(z.strictObject({ settings: z.record(z.string(), z.unknown()) }), {
  json: ['settings'],
});

export class SettingsKvRepository {
  constructor(private readonly context: StoreContext) {}

  read(key: string): Readonly<Record<string, unknown>> | null {
    return (
      this.context.sql.get(STORED, 'select settings from ai_settings where key = $key', { key })
        ?.settings ?? null
    );
  }

  save(key: string, settings: Readonly<Record<string, unknown>>): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the setting',
        `insert into ai_settings (key, settings, updated_at) values ($key, $settings, $now)
         on conflict (key) do update set settings = excluded.settings, updated_at = excluded.updated_at`,
        { key, settings: jsonText(settings), now: this.context.now() },
      );
    });
  }
}
