import {
  ApiError,
  matchesModelSearchWords,
  type AiModelRow,
  type AiModelSearch,
  type AiModelSearchMetrics,
  type AiModelSearchRequest,
  type AiModelSearchSort,
} from '@smarteverything/domain';
import { createHash } from 'node:crypto';
import { freshMetricSource, type ModelMetric, type ModelSearchState } from './model-search-state';

function priceOf(row: AiModelRow, direction: 'input_per_mtok' | 'output_per_mtok'): number | null {
  return row.pricing.variable ? null : row.pricing[direction];
}

function underCeiling(value: number | null, ceiling: number | undefined): boolean {
  return ceiling === undefined || (value !== null && value <= ceiling);
}

function matchesIdentity(row: AiModelRow, query: AiModelSearchRequest): boolean {
  if (!query.gone && row.gone_at !== null) return false;
  if (query.kind !== undefined && !row.kinds.includes(query.kind)) return false;
  if (query.provider !== undefined && row.author !== query.provider) return false;
  return matchesModelSearchWords(row, query.q ?? '');
}

function includesModality(values: readonly string[], selected: string | undefined): boolean {
  return selected === undefined || values.includes(selected);
}

function aboveFloor(value: number | null, floor: number | undefined): boolean {
  return floor === undefined || (value !== null && value >= floor);
}

function matchesCapabilities(row: AiModelRow, query: AiModelSearchRequest): boolean {
  return (
    includesModality(row.input_modalities, query.input_modality) &&
    includesModality(row.output_modalities, query.output_modality) &&
    aboveFloor(row.context_length, query.min_context)
  );
}

function matches(row: AiModelRow, query: AiModelSearchRequest): boolean {
  return (
    matchesIdentity(row, query) &&
    matchesCapabilities(row, query) &&
    underCeiling(priceOf(row, 'input_per_mtok'), query.max_input_price) &&
    underCeiling(priceOf(row, 'output_per_mtok'), query.max_output_price)
  );
}

function metricRank(row: AiModelRow, state: ModelSearchState, metric: ModelMetric): number | null {
  return row.provider === 'openrouter' ? (state[metric].ranks[row.id] ?? null) : null;
}

function metricOf(row: AiModelRow, state: ModelSearchState): AiModelSearchMetrics {
  return {
    intelligence_index: null,
    intelligence_rank: metricRank(row, state, 'intelligence'),
    latency_ms: null,
    latency_rank: metricRank(row, state, 'latency'),
  };
}

function valueOf(row: AiModelRow, sort: AiModelSearchSort, state: ModelSearchState): number | null {
  switch (sort) {
    case 'newest':
      return -Date.parse(row.created);
    case 'context':
      return row.context_length === null ? null : -row.context_length;
    case 'input-price':
      return priceOf(row, 'input_per_mtok');
    case 'output-price':
      return priceOf(row, 'output_per_mtok');
    case 'intelligence':
      return metricRank(row, state, 'intelligence');
    case 'latency':
      return metricRank(row, state, 'latency');
    case 'name':
      return null;
  }
}

function compareKnown(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  return b === null ? -1 : a - b;
}

function compareModels(
  a: AiModelRow,
  b: AiModelRow,
  sort: AiModelSearchSort,
  state: ModelSearchState,
): number {
  const primary =
    sort === 'name'
      ? a.name.localeCompare(b.name)
      : compareKnown(valueOf(a, sort, state), valueOf(b, sort, state));
  return primary === 0 ? a.id.localeCompare(b.id) : primary;
}

function fingerprint(
  rows: readonly AiModelRow[],
  query: AiModelSearchRequest,
  state: ModelSearchState,
): string {
  const { cursor: _cursor, ...filters } = query;
  return createHash('sha256')
    .update(JSON.stringify([rows, filters, state]))
    .digest('hex');
}

function startOf(cursor: string | undefined, snapshot: string, count: number): number {
  if (cursor === undefined) return 0;
  const [revision, offset, ...extra] = cursor.split(':');
  const index = Number(offset);
  if (
    revision !== snapshot ||
    extra.length !== 0 ||
    offset === undefined ||
    !/^\d+$/.test(offset) ||
    !Number.isSafeInteger(index) ||
    index < 1 ||
    index >= count
  ) {
    throw new ApiError(
      'invalid_request',
      'This model search changed. Start again from the first page.',
    );
  }
  return index;
}

export type ModelSearchPage = Pick<
  AiModelSearch,
  'models' | 'metrics' | 'sources' | 'total' | 'next_cursor'
>;

export function modelSearchPage(
  rows: readonly AiModelRow[],
  query: AiModelSearchRequest,
  state: ModelSearchState,
  now: number,
): ModelSearchPage {
  const matching = rows.filter((row) => matches(row, query));
  matching.sort((a, b) => compareModels(a, b, query.sort, state));
  const snapshot = fingerprint(rows, query, state);
  const start = startOf(query.cursor, snapshot, matching.length);
  const end = start + query.limit;
  const models = matching.slice(start, end);
  return {
    models,
    metrics: Object.fromEntries(models.map((row) => [row.id, metricOf(row, state)])),
    sources: {
      intelligence: freshMetricSource(state.intelligence.source, now),
      latency: freshMetricSource(state.latency.source, now),
    },
    total: matching.length,
    next_cursor: end < matching.length ? `${snapshot}:${String(end)}` : null,
  };
}
