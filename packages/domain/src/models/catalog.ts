import { z } from 'zod';
import { DEVICE_FAMILIES } from '../presentation/types';
import { compareVersions, MODEL_MATCH, MODEL_MATCH_READ, normaliseModelString } from './match';
import { MODEL_ID, NAME, SEMVER, TOKEN } from './spec-base';

const MOMENT = z.iso.datetime({ offset: true });

export const MODEL_SHA256 = z.string().regex(/^[0-9a-f]{64}$/);

export const MODEL_OWNER = z
  .string()
  .regex(/^(builtin|(provider|plugin):[A-Za-z0-9][A-Za-z0-9_.-]*)$/);

export const MODEL_EXTRA_ROLES = ['dock', 'accessory'] as const;

export type ModelExtraRole = (typeof MODEL_EXTRA_ROLES)[number];

export const MODEL_EXTRA = z.strictObject({
  role: z.enum(MODEL_EXTRA_ROLES),
  modelId: MODEL_ID,
});

export type ModelExtra = z.output<typeof MODEL_EXTRA>;

const BRANDS = z.array(z.string().min(1));

function isRelativeAssetPath(path: string): boolean {
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.includes(':')) {
    return false;
  }
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

const ASSET_PATH = z.string().min(1).refine(isRelativeAssetPath, {
  message: 'a relative path inside the plugin without .. segments',
});

export const PLUGIN_MODEL_CONTRIBUTION = z.strictObject({
  id: MODEL_ID,
  title: z.string().min(1),
  version: SEMVER,
  match: MODEL_MATCH,
  spec: ASSET_PATH,
  specSha256: MODEL_SHA256.nullable().default(null),
  brands: BRANDS.default([]),
  extras: z.array(MODEL_EXTRA).default([]),
});

export type PluginModelContribution = z.output<typeof PLUGIN_MODEL_CONTRIBUTION>;

export const MODEL_CATALOG_ROW = z.object({
  id: MODEL_ID,
  version: SEMVER,
  owner: MODEL_OWNER,
  title: z.string().min(1),
  category: TOKEN,
  match: MODEL_MATCH_READ,
  brands: BRANDS.default([]),
  aliases: z.array(z.string().min(1)).default([]),
  extras: z.array(MODEL_EXTRA).default([]),
  spec_sha256: MODEL_SHA256.nullable().default(null),
});

export type ModelCatalogRow = z.output<typeof MODEL_CATALOG_ROW>;

export const MODEL_OVERRIDE_SCOPES = ['device', 'identity', 'family'] as const;

export type ModelOverrideScope = (typeof MODEL_OVERRIDE_SCOPES)[number];

const OVERRIDE_PARAMS = z.record(NAME, z.number());

function oneModelSource(value: {
  readonly model_id?: string | null | undefined;
  readonly asset_hash?: string | null | undefined;
}): boolean {
  const hasModel = value.model_id !== null && value.model_id !== undefined;
  const hasAsset = value.asset_hash !== null && value.asset_hash !== undefined;
  return hasModel !== hasAsset;
}

const ONE_SOURCE = { message: 'exactly one of model_id and asset_hash' };

export const MODEL_OVERRIDE_ROW = z
  .object({
    scope: z.enum(MODEL_OVERRIDE_SCOPES),
    target: z.string().min(1),
    model_id: MODEL_ID.nullable(),
    asset_hash: MODEL_SHA256.nullable(),
    finish: NAME.nullable(),
    params: OVERRIDE_PARAMS.default({}),
    set_by: z.string().min(1),
    updated_at: MOMENT,
  })
  .refine(oneModelSource, ONE_SOURCE)
  .refine((row) => row.scope !== 'family' || DEVICE_FAMILIES.some((name) => name === row.target), {
    message: 'a family override targets a device family',
    path: ['target'],
  });

export type ModelOverrideRow = z.output<typeof MODEL_OVERRIDE_ROW>;

export const MODEL_OVERRIDE_INPUT = z
  .strictObject({
    scope: z.enum(MODEL_OVERRIDE_SCOPES),
    model_id: MODEL_ID.optional(),
    asset_hash: MODEL_SHA256.optional(),
    finish: NAME.optional(),
    params: OVERRIDE_PARAMS.optional(),
  })
  .refine(oneModelSource, ONE_SOURCE);

export type ModelOverrideInput = z.output<typeof MODEL_OVERRIDE_INPUT>;

export interface ModelIdentity {
  readonly brand: string;
  readonly modelString: string;
  readonly hardwareModel?: string | undefined;
}

export function modelIdentityKey(identity: ModelIdentity): string {
  return JSON.stringify([
    identity.brand.toLowerCase(),
    normaliseModelString(identity.modelString),
    identity.hardwareModel ?? '',
  ]);
}

export interface ModelCatalog {
  readonly rows: readonly ModelCatalogRow[];
  find(idOrAlias: string): ModelCatalogRow | undefined;
}

function newer(current: ModelCatalogRow | undefined, row: ModelCatalogRow): ModelCatalogRow {
  return current === undefined || compareVersions(row.version, current.version) > 0 ? row : current;
}

export function createModelCatalog(rows: readonly ModelCatalogRow[]): ModelCatalog {
  const byId = new Map<string, ModelCatalogRow>();
  const byAlias = new Map<string, ModelCatalogRow>();
  for (const row of rows) {
    byId.set(row.id, newer(byId.get(row.id), row));
    for (const alias of row.aliases) byAlias.set(alias, newer(byAlias.get(alias), row));
  }
  return {
    rows,
    find: (idOrAlias) => byId.get(idOrAlias) ?? byAlias.get(idOrAlias),
  };
}
