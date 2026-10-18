import { z } from 'zod';
import type { LogPayload } from '@smarteverything/logging';
import type { Sql } from '../sql';
import { jsonText } from '../sql';

export const HARNESS_EXTENSION_TABLES: readonly string[] = [
  `create table harness_builtins (
    id text primary key, enabled integer not null check(enabled in (0,1)), config text not null
  ) strict`,
  `create table harness_extensions (
    id text primary key,
    kind text not null check(kind in ('skill','plugin')),
    enabled integer not null check(enabled in (0,1)),
    source text not null,
    version text,
    name text not null,
    description text not null,
    publisher text not null,
    license text,
    executes integer not null check(executes in (0,1)),
    confirmed integer not null check(confirmed in (0,1)),
    installed_at text not null
  ) strict`,
  'drop table harness_skill_presentations',
];

const RAW_ASSET_URL =
  /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([a-f0-9]{40})\/(.+)$/u;
const REMOVED_SETTINGS = ['coding_process_assets', 'hook_integrities', 'mcp_integrities'];
const ASSET = z.object({ id: z.string(), source: z.object({ url: z.string().optional() }) });
const ENTRY = z.object({
  id: z.string(),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  metadata: z.object({ skill_assets: z.array(ASSET) }).optional(),
});
const CURRENT = z.object({
  configuration: z
    .string()
    .transform((text) => z.object({ entries: z.array(ENTRY) }).parse(JSON.parse(text))),
});
type Entry = z.infer<typeof ENTRY>;

export function moveConfigurationToExtensions(sql: Sql): LogPayload {
  const current = sql.get(
    CURRENT,
    'select configuration from harness_configuration_revisions join harness_configuration_current using(revision) where singleton=1',
  );
  const entries = current?.configuration.entries ?? [];
  const now = new Date().toISOString();
  for (const entry of entries) keepBuiltin(sql, entry);
  const assets = entries.flatMap(assetsOf);
  let left = 0;
  for (const asset of assets) {
    if (asset.source === undefined) left += 1;
    else keepExtension(sql, { ...asset, source: asset.source, now });
  }
  return { builtins: entries.length, moved: assets.length - left, left };
}

function assetsOf(entry: Entry): readonly {
  readonly kind: 'skill' | 'plugin';
  readonly source: GitSource | undefined;
  readonly confirmed: boolean;
}[] {
  if (entry.id !== 'skills' && entry.id !== 'claude-plugins') return [];
  return (entry.metadata?.skill_assets ?? []).map((asset) => ({
    kind: entry.id === 'skills' ? 'skill' : 'plugin',
    source: gitSource(asset.source.url ?? ''),
    confirmed: confirmed(entry, asset.id),
  }));
}

function keepBuiltin(sql: Sql, entry: Entry): void {
  const config = Object.fromEntries(
    Object.entries(entry.config).filter(([key]) => !REMOVED_SETTINGS.includes(key)),
  );
  sql.run(
    'move a built-in extension choice',
    'insert into harness_builtins(id,enabled,config) values($id,$enabled,$config)',
    { id: entry.id, enabled: entry.enabled ? 1 : 0, config: jsonText(config) },
  );
}

interface GitSource {
  readonly url: string;
  readonly commit: string;
  readonly path: string | null;
  readonly name: string;
  readonly publisher: string;
}

function gitSource(url: string): GitSource | undefined {
  const match = RAW_ASSET_URL.exec(url);
  const [, owner, repository, commit, file] = match ?? [];
  if (owner === undefined || repository === undefined || commit === undefined || file === undefined)
    return undefined;
  const parts = file.split('/');
  const last = parts.pop();
  if (last === 'plugin.json') parts.pop();
  else if (last !== 'SKILL.md') return undefined;
  return {
    url: `https://github.com/${owner}/${repository}`,
    commit,
    path: parts.length === 0 ? null : parts.join('/'),
    name: parts.at(-1) ?? repository,
    publisher: `${owner}/${repository}`,
  };
}

function confirmed(entry: Entry, assetId: string): boolean {
  return ['hook_integrities', 'mcp_integrities'].some((key) => {
    const grants = z.record(z.string(), z.unknown()).safeParse(entry.config[key]);
    return grants.success && Object.keys(grants.data).some((grant) => grant.startsWith(assetId));
  });
}

function keepExtension(
  sql: Sql,
  input: {
    readonly kind: 'skill' | 'plugin';
    readonly source: GitSource;
    readonly confirmed: boolean;
    readonly now: string;
  },
): void {
  const { kind, source } = input;
  sql.run(
    'move an installed extension',
    `insert or ignore into harness_extensions(id,kind,enabled,source,version,name,description,publisher,license,executes,confirmed,installed_at)
     values($id,$kind,1,$source,null,$name,$description,$publisher,null,0,$confirmed,$now)`,
    {
      id: `${kind}:${source.name}`,
      kind,
      source: jsonText({
        kind: 'git',
        url: source.url,
        ref: null,
        path: source.path,
        commit: source.commit,
      }),
      name: source.name,
      description: `Installed from ${source.publisher}; details load when it is next fetched.`,
      publisher: source.publisher,
      confirmed: input.confirmed ? 1 : 0,
      now: input.now,
    },
  );
}
