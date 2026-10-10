import {
  MCP_TOOL_AREAS,
  PLUGIN_ROW,
  type McpToolArea,
  type PluginManifest,
  type PluginRow,
  type PluginSource,
  type PluginStatus,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { SQL_JSON, jsonText } from '../sql';

const STORED_PLUGIN = storedRow(PLUGIN_ROW, {
  flags: ['enabled', 'trusted'],
  json: ['manifest', 'tool_switches', 'settings', 'secret_names'],
});

const COLUMNS =
  'id, manifest, source, location, enabled, trusted, status, status_detail, tool_switches, ' +
  'settings, secret_names, icon_url, installed_at, updated_at';

const STORED_TOKEN = z.strictObject({
  plugin_id: z.string(),
  areas: SQL_JSON.pipe(z.array(z.enum(MCP_TOOL_AREAS))),
});

export interface PluginToken {
  readonly pluginId: string;
  readonly areas: readonly McpToolArea[];
}

export interface NewPlugin {
  readonly manifest: PluginManifest;
  readonly source: PluginSource;
  readonly location: string | null;
  readonly trusted: boolean;
}

export interface PluginChange {
  readonly manifest?: PluginManifest | undefined;
  readonly enabled?: boolean | undefined;
  readonly trusted?: boolean | undefined;
  readonly status?: PluginStatus | undefined;
  readonly statusDetail?: string | null | undefined;
  readonly toolSwitches?: Readonly<Record<string, boolean>> | undefined;
  readonly settings?: PluginRow['settings'] | undefined;
  readonly secretNames?: readonly string[] | undefined;
  readonly iconUrl?: string | null | undefined;
}

function flag(value: boolean | undefined): number | undefined {
  return value === undefined ? undefined : Number(value);
}

function json(value: unknown): string | undefined {
  return value === undefined ? undefined : jsonText(value);
}

function columnsOf(change: PluginChange): Readonly<Record<string, SQLInputValue | undefined>> {
  return {
    manifest: json(change.manifest),
    enabled: flag(change.enabled),
    trusted: flag(change.trusted),
    status: change.status,
    status_detail: change.statusDetail,
    tool_switches: json(change.toolSwitches),
    settings: json(change.settings),
    secret_names: json(change.secretNames),
    icon_url: change.iconUrl,
  };
}

export class PluginsRepository {
  constructor(private readonly context: StoreContext) {}

  list(): PluginRow[] {
    return this.context.sql.all(STORED_PLUGIN, `select ${COLUMNS} from plugins order by id`);
  }

  find(id: string): PluginRow | undefined {
    return this.context.sql.get(STORED_PLUGIN, `select ${COLUMNS} from plugins where id = $id`, {
      id,
    });
  }

  byId(id: string): PluginRow {
    return found(this.find(id), 'plugin', id);
  }

  create(plugin: NewPlugin): PluginRow {
    return this.context.write(() => {
      const now = this.context.now();
      this.context.sql.run(
        'add the plugin',
        `insert into plugins (id, manifest, source, location, enabled, trusted, status, tool_switches,
           settings, secret_names, installed_at, updated_at)
         values ($id, $manifest, $source, $location, 0, $trusted, 'disabled', '{}', '{}', '[]', $now,
           $now)`,
        {
          id: plugin.manifest.id,
          manifest: jsonText(plugin.manifest),
          source: plugin.source,
          location: plugin.location,
          trusted: Number(plugin.trusted),
          now,
        },
      );
      const row = this.byId(plugin.manifest.id);
      this.context.changed('plugins', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, change: PluginChange): PluginRow {
    return this.context.write(() => {
      const before = this.byId(id);
      const set = assignments({ ...columnsOf(change), updated_at: this.context.now() });
      this.context.sql.run('change the plugin', `update plugins set ${set.text} where id = $id`, {
        ...set.parameters,
        id,
      });
      const after = this.byId(id);
      this.context.changed('plugins', 'UPDATE', after, before);
      return after;
    });
  }

  remove(id: string): void {
    this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run('remove the plugin', 'delete from plugins where id = $id', { id });
      this.context.changed('plugins', 'DELETE', null, before);
    });
  }

  saveToken(pluginId: string, tokenHash: string, areas: readonly McpToolArea[]): void {
    this.context.write(() => {
      this.context.sql.run(
        'save the plugin token',
        `insert into plugin_tokens (plugin_id, token_hash, areas, created_at)
         values ($pluginId, $tokenHash, $areas, $now)
         on conflict (plugin_id) do update set token_hash = excluded.token_hash,
           areas = excluded.areas, created_at = excluded.created_at`,
        { pluginId, tokenHash, areas: jsonText(areas), now: this.context.now() },
      );
    });
  }

  dropToken(pluginId: string): void {
    this.context.write(() => {
      this.context.sql.run(
        'drop the plugin token',
        'delete from plugin_tokens where plugin_id = $pluginId',
        { pluginId },
      );
    });
  }

  tokenByHash(tokenHash: string): PluginToken | undefined {
    const row = this.context.sql.get(
      STORED_TOKEN,
      `select t.plugin_id, t.areas from plugin_tokens t join plugins p on p.id = t.plugin_id
       where t.token_hash = $tokenHash and p.enabled = 1`,
      { tokenHash },
    );
    return row === undefined ? undefined : { pluginId: row.plugin_id, areas: row.areas };
  }
}
