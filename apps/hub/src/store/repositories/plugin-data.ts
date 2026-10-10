import {
  JSON_VALUE,
  PLUGIN_DATA_POINT,
  PLUGIN_SEARCH_ENTRY,
  PLUGIN_STREAM_ROW,
  type JsonValue,
  type PluginDataPoint,
  type PluginSearchEntry,
  type PluginStreamRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const STORED_POINT = z
  .strictObject({ stream: z.string(), value: SQL_JSON, at: z.string() })
  .pipe(PLUGIN_DATA_POINT);

const STORED_STREAM = z
  .strictObject({ plugin_id: z.string(), stream: z.string(), value: SQL_JSON, at: z.string() })
  .pipe(PLUGIN_STREAM_ROW);

const LATEST = `select d.plugin_id, d.stream, d.value, max(d.at) as at from plugin_data d
  join plugins p on p.id = d.plugin_id where p.enabled = 1`;

const STORED_RECORD = z.strictObject({ key: z.string(), value: SQL_JSON.pipe(JSON_VALUE) });

const STORED_ENTRY = z.strictObject({
  plugin_id: z.string(),
  entry: SQL_JSON.pipe(PLUGIN_SEARCH_ENTRY),
});

export interface PluginSearchRow {
  readonly pluginId: string;
  readonly entry: PluginSearchEntry;
}

export interface PluginRecordRow {
  readonly key: string;
  readonly value: JsonValue;
}

export class PluginDataRepository {
  constructor(private readonly context: StoreContext) {}

  publish(pluginId: string, point: PluginDataPoint, keep: number): void {
    this.context.write(() => {
      const before = this.stream(pluginId, point.stream);
      this.context.sql.run(
        'save the plugin data',
        `insert into plugin_data (plugin_id, stream, at, value) values ($pluginId, $stream, $at, $value)`,
        { pluginId, stream: point.stream, at: point.at, value: jsonText(point.value) },
      );
      this.context.sql.run(
        'trim the plugin data',
        `delete from plugin_data where plugin_id = $pluginId and stream = $stream and rowid not in (
           select rowid from plugin_data where plugin_id = $pluginId and stream = $stream
           order by at desc limit $keep)`,
        { pluginId, stream: point.stream, keep: Math.max(keep, 1) },
      );
      const row = { plugin_id: pluginId, ...point };
      this.context.changed(
        'plugin_streams',
        before === undefined ? 'INSERT' : 'UPDATE',
        row,
        before ?? null,
      );
    });
  }

  stream(pluginId: string, stream: string): PluginStreamRow | undefined {
    return this.context.sql.get(
      STORED_STREAM,
      `select plugin_id, stream, value, at from plugin_data
       where plugin_id = $pluginId and stream = $stream order by at desc limit 1`,
      { pluginId, stream },
    );
  }

  streams(): PluginStreamRow[] {
    return this.context.sql.all(STORED_STREAM, `${LATEST} group by d.plugin_id, d.stream`);
  }

  history(pluginId: string, stream: string, limit: number): PluginDataPoint[] {
    return this.context.sql.all(
      STORED_POINT,
      `select stream, value, at from plugin_data where plugin_id = $pluginId and stream = $stream
       order by at desc limit $limit`,
      { pluginId, stream, limit },
    );
  }

  latest(pluginId: string): PluginDataPoint[] {
    return this.context.sql.all(
      STORED_POINT,
      `select stream, value, max(at) as at from plugin_data where plugin_id = $pluginId
       group by stream order by stream`,
      { pluginId },
    );
  }

  record(pluginId: string, collection: string, key: string): JsonValue | null {
    const row = this.context.sql.get(
      STORED_RECORD,
      `select key, value from plugin_records
       where plugin_id = $pluginId and collection = $collection and key = $key`,
      { pluginId, collection, key },
    );
    return row === undefined ? null : row.value;
  }

  records(pluginId: string, collection: string): PluginRecordRow[] {
    return this.context.sql.all(
      STORED_RECORD,
      `select key, value from plugin_records where plugin_id = $pluginId and collection = $collection
       order by key`,
      { pluginId, collection },
    );
  }

  putRecord(pluginId: string, collection: string, key: string, value: JsonValue): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the plugin record',
        `insert into plugin_records (plugin_id, collection, key, value, updated_at)
         values ($pluginId, $collection, $key, $value, $now)
         on conflict (plugin_id, collection, key) do update
           set value = excluded.value, updated_at = excluded.updated_at`,
        { pluginId, collection, key, value: jsonText(value), now: this.context.now() },
      );
    });
  }

  removeRecord(pluginId: string, collection: string, key: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'remove the plugin record',
        `delete from plugin_records
         where plugin_id = $pluginId and collection = $collection and key = $key`,
        { pluginId, collection, key },
      );
    });
  }

  replaceSearch(pluginId: string, entries: readonly PluginSearchEntry[]): void {
    this.context.write(() => {
      this.context.sql.run(
        'clear the plugin search entries',
        'delete from plugin_search where plugin_id = $pluginId',
        { pluginId },
      );
      for (const entry of entries) {
        this.context.sql.run(
          'save the plugin search entry',
          `insert into plugin_search (plugin_id, entry_id, entry) values ($pluginId, $id, $entry)`,
          { pluginId, id: entry.id, entry: jsonText(entry) },
        );
      }
    });
  }

  searchEntries(): PluginSearchRow[] {
    return this.context.sql
      .all(
        STORED_ENTRY,
        `select s.plugin_id, s.entry from plugin_search s join plugins p on p.id = s.plugin_id
         where p.enabled = 1 order by s.plugin_id, s.entry_id`,
      )
      .map((row) => ({ pluginId: row.plugin_id, entry: row.entry }));
  }
}
