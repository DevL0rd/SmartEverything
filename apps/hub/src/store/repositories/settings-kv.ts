import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { Remembered } from '../remembered';
import { jsonText } from '../sql';

const STORED = storedRow(z.strictObject({ settings: z.record(z.string(), z.unknown()) }), {
  json: ['settings'],
});

export const SAVED_SETTINGS = new Remembered<Readonly<Record<string, unknown>> | null>();

export class SettingsKvRepository {
  constructor(private readonly context: StoreContext) {}

  read(key: string): Readonly<Record<string, unknown>> | null {
    return SAVED_SETTINGS.value(
      this.context,
      key,
      () =>
        this.context.sql.get(STORED, 'select settings from ai_settings where key = $key', { key })
          ?.settings ?? null,
    );
  }

  save(key: string, settings: Readonly<Record<string, unknown>>): void {
    this.context.write(() => {
      SAVED_SETTINGS.forget(this.context);
      this.context.sql.run(
        'save the setting',
        `insert into ai_settings (key, settings, updated_at) values ($key, $settings, $now)
         on conflict (key) do update set settings = excluded.settings, updated_at = excluded.updated_at`,
        { key, settings: jsonText(settings), now: this.context.now() },
      );
    });
  }
}
