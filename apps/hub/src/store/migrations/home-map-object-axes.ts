import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { jsonText, type Sql } from '../sql';
import type { Migration } from './migration';

type JsonObject = Readonly<Record<string, JsonValue>>;

const IMPORTED = z.looseObject({
  modelId: z.string(),
  params: z.looseObject({ width: z.number(), depth: z.number() }),
  origin: z.looseObject({ kind: z.literal('source'), overridden: z.array(z.string()) }),
});

const ROW = z.object({ key: z.string(), revision: z.number().optional(), text: z.string() });

interface Turned {
  readonly value: JsonValue;
  readonly objects: number;
}

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function swapped(value: JsonObject): JsonObject | null {
  const imported = IMPORTED.safeParse(value);
  if (!imported.success || imported.data.origin.overridden.includes('params')) return null;
  const { params } = imported.data;
  return { ...value, params: { ...params, width: params.depth, depth: params.width } };
}

export function swapImportedAxes(value: JsonValue): Turned {
  if (Array.isArray(value)) {
    const items = value.map(swapImportedAxes);
    return {
      value: items.map((item) => item.value),
      objects: items.reduce((sum, item) => sum + item.objects, 0),
    };
  }
  if (!isObject(value)) return { value, objects: 0 };
  const own = swapped(value);
  const base = own ?? value;
  const members = Object.entries(base).map(([key, member]) => {
    if (own !== null && key === 'params') return { key, value: member, objects: 0 };
    const turned = swapImportedAxes(member);
    return { key, value: turned.value, objects: turned.objects };
  });
  return {
    value: Object.fromEntries(members.map((member) => [member.key, member.value])),
    objects: members.reduce((sum, member) => sum + member.objects, own === null ? 0 : 1),
  };
}

function rewrite(text: string): Turned {
  return swapImportedAxes(JSON_VALUE.parse(JSON.parse(text)));
}

export function swapHomeMapObjectAxes(sql: Sql): LogPayload {
  let objects = 0;
  const maps = sql.all(ROW, 'select id as key, document as text from home_maps');
  for (const row of maps) {
    const turned = rewrite(row.text);
    objects += turned.objects;
    if (turned.objects > 0)
      sql.run(
        'swap imported object axes in a home map',
        'update home_maps set document = $document where id = $key',
        {
          key: row.key,
          document: jsonText(turned.value),
        },
      );
  }
  const versions = sql.all(
    ROW,
    `select map_id || '/' || version_id as key, document as text from home_map_versions`,
  );
  for (const row of versions) {
    const turned = rewrite(row.text);
    objects += turned.objects;
    if (turned.objects > 0)
      sql.run(
        'swap imported object axes in a saved home map version',
        `update home_map_versions set document = $document where map_id || '/' || version_id = $key`,
        { key: row.key, document: jsonText(turned.value) },
      );
  }
  for (const column of ['ops', 'inverse'] as const) {
    const revisions = sql.all(
      ROW,
      `select map_id as key, revision, ${column} as text from home_map_revisions`,
    );
    for (const row of revisions) {
      const turned = rewrite(row.text);
      if (turned.objects > 0)
        sql.run(
          'swap imported object axes in a home map revision',
          `update home_map_revisions set ${column} = $text where map_id = $key and revision = $revision`,
          { key: row.key, revision: row.revision ?? 0, text: jsonText(turned.value) },
        );
    }
  }
  return { maps: maps.length, versions: versions.length, objects };
}

export const HOME_MAP_OBJECT_AXES_MIGRATION: Migration = {
  version: 159,
  name: 'home-map-object-axes',
  statements: [],
  backfill: swapHomeMapObjectAxes,
};
