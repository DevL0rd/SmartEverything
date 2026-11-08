import {
  modelIdentityKey,
  type ModelCatalog,
  type ModelCatalogRow,
  type ModelExtra,
  type ModelIdentity,
  type ModelOverrideRow,
  type ModelOverrideScope,
} from './catalog';
import {
  brandAllowed,
  compareScores,
  compareVersions,
  identityScore,
  matchesFamily,
  type MatchScore,
  type MatchTier,
  type ModelSubject,
} from './match';

export interface ModelDevice extends ModelSubject {
  readonly id: string;
  readonly irCategory?: string | undefined;
}

export const MODEL_SOURCES = [
  'device-override',
  'identity-override',
  'family-override',
  'plugin-identity',
  'plugin-family',
  'kind-default',
  'none',
] as const;

export type ModelSource = (typeof MODEL_SOURCES)[number];

export type ModelRef =
  | { readonly kind: 'catalogue'; readonly modelId: string }
  | { readonly kind: 'asset'; readonly hash: string };

export interface ModelResolution {
  readonly source: ModelSource;
  readonly main: ModelRef | null;
  readonly extras: readonly ModelExtra[];
  readonly finish?: string;
  readonly params?: Readonly<Record<string, number>>;
  readonly candidates: readonly string[];
  readonly issues: readonly string[];
}

export interface ModelTie {
  readonly deviceId: string;
  readonly tier: MatchTier | 'family';
  readonly winner: string;
  readonly rival: string;
}

export interface ModelDefaults {
  readonly kindDefaults: ReadonlyMap<string, string>;
  readonly irCategoryDefaults: ReadonlyMap<string, string>;
}

export interface ModelOverrideIndex {
  find(scope: ModelOverrideScope, target: string): ModelOverrideRow | undefined;
}

export interface ModelResolverContext {
  readonly catalog: ModelCatalog;
  readonly overrides: ModelOverrideIndex;
  readonly defaults: ModelDefaults;
}

export interface ModelResolverOptions {
  readonly onTie?: (tie: ModelTie) => void;
}

interface Found {
  readonly source: ModelSource;
  readonly main: ModelRef | null;
  readonly finish?: string;
  readonly params?: Readonly<Record<string, number>>;
}

interface Ranked {
  readonly row: ModelCatalogRow;
  readonly score: MatchScore | null;
}

interface Run {
  readonly device: ModelDevice;
  readonly context: ModelResolverContext;
  readonly issues: string[];
  readonly onTie: ((tie: ModelTie) => void) | undefined;
}

export function modelDeviceIdentity(device: ModelDevice): ModelIdentity {
  return {
    brand: device.brand,
    modelString: device.model,
    hardwareModel: device.hardwareModel ?? device.product,
  };
}

function overrideKey(scope: ModelOverrideScope, target: string): string {
  return `${scope}\n${target}`;
}

export function createOverrideIndex(rows: readonly ModelOverrideRow[]): ModelOverrideIndex {
  const byKey = new Map<string, ModelOverrideRow>();
  for (const row of rows) {
    const key = overrideKey(row.scope, row.target);
    const current = byKey.get(key);
    if (current === undefined || Date.parse(row.updated_at) >= Date.parse(current.updated_at)) {
      byKey.set(key, row);
    }
  }
  return { find: (scope, target) => byKey.get(overrideKey(scope, target)) };
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareRanked(left: Ranked, right: Ranked): number {
  const score =
    left.score !== null && right.score !== null ? compareScores(right.score, left.score) : 0;
  return (
    score ||
    compareVersions(right.row.version, left.row.version) ||
    compareText(left.row.owner, right.row.owner) ||
    compareText(left.row.id, right.row.id)
  );
}

function rankIdentity(run: Run): Ranked[] {
  const ranked: Ranked[] = [];
  for (const row of run.context.catalog.rows) {
    if (!brandAllowed(row.brands, run.device)) continue;
    const score = identityScore(row.match, run.device);
    if (score !== null) ranked.push({ row, score });
  }
  return ranked.sort(compareRanked);
}

function rankFamily(run: Run): Ranked[] {
  return run.context.catalog.rows
    .filter(
      (row) => brandAllowed(row.brands, run.device) && matchesFamily(row.match, run.device.family),
    )
    .map((row): Ranked => ({ row, score: null }))
    .sort(compareRanked);
}

function overrideTail(row: ModelOverrideRow): Omit<Found, 'source' | 'main'> {
  return {
    ...(row.finish === null ? {} : { finish: row.finish }),
    ...(Object.keys(row.params).length === 0 ? {} : { params: row.params }),
  };
}

function fromOverride(
  source: ModelSource,
  row: ModelOverrideRow | undefined,
  run: Run,
): Found | null {
  if (row === undefined) return null;
  if (row.asset_hash !== null) {
    return { source, main: { kind: 'asset', hash: row.asset_hash }, ...overrideTail(row) };
  }
  const wanted = row.model_id ?? 'none';
  const model = run.context.catalog.find(wanted);
  if (model === undefined) {
    run.issues.push(`${source}: model ${wanted} is not in the catalogue`);
    return null;
  }
  return {
    source,
    main: { kind: 'catalogue', modelId: model.id },
    ...overrideTail(row),
  };
}

function reportTie(run: Run, ranked: readonly Ranked[], tier: MatchTier | 'family'): void {
  const [winner, ...rest] = ranked;
  const rival = rest.find((other) => other.row.id !== winner?.row.id);
  if (winner === undefined || rival === undefined || run.onTie === undefined) return;
  const same =
    winner.score === null || rival.score === null || compareScores(winner.score, rival.score) === 0;
  if (same) {
    run.onTie({ deviceId: run.device.id, tier, winner: winner.row.id, rival: rival.row.id });
  }
}

function fromRanked(source: ModelSource, ranked: readonly Ranked[], run: Run): Found | null {
  const winner = ranked[0];
  if (winner === undefined) return null;
  reportTie(run, ranked, winner.score?.tier ?? 'family');
  return { source, main: { kind: 'catalogue', modelId: winner.row.id } };
}

function defaultId(run: Run): string | undefined {
  const { device, context } = run;
  const byCategory =
    device.family === 'ir_remote' && device.irCategory !== undefined
      ? context.defaults.irCategoryDefaults.get(device.irCategory)
      : undefined;
  return byCategory ?? context.defaults.kindDefaults.get(device.family);
}

function fromDefault(run: Run): Found | null {
  const id = defaultId(run);
  if (id === undefined) return null;
  const model = run.context.catalog.find(id);
  if (model === undefined) {
    run.issues.push(`kind-default: model ${id} is not in the catalogue`);
    return null;
  }
  return { source: 'kind-default', main: { kind: 'catalogue', modelId: model.id } };
}

function candidateIds(...groups: readonly (readonly Ranked[])[]): string[] {
  return [...new Set(groups.flat().map((entry) => entry.row.id))];
}

function extrasOf(found: Found, catalog: ModelCatalog): readonly ModelExtra[] {
  return found.main?.kind === 'catalogue' ? (catalog.find(found.main.modelId)?.extras ?? []) : [];
}

export function resolveModel(
  device: ModelDevice,
  context: ModelResolverContext,
  options: ModelResolverOptions = {},
): ModelResolution {
  const run: Run = { device, context, issues: [], onTie: options.onTie };
  const identity = rankIdentity(run);
  const family = rankFamily(run);
  const { overrides } = context;
  const found: Found = fromOverride('device-override', overrides.find('device', device.id), run) ??
    fromOverride(
      'identity-override',
      overrides.find('identity', modelIdentityKey(modelDeviceIdentity(device))),
      run,
    ) ??
    fromOverride('family-override', overrides.find('family', device.family), run) ??
    fromRanked('plugin-identity', identity, run) ??
    fromRanked('plugin-family', family, run) ??
    fromDefault(run) ?? { source: 'none', main: null };
  return {
    ...found,
    extras: extrasOf(found, context.catalog),
    candidates: candidateIds(identity, family),
    issues: run.issues,
  };
}
