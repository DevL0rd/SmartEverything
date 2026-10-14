import {
  AI_MODEL_SEARCH_QUERY,
  matchesModelSearchWords,
  type AiModelKind,
  type AiModelSearchRequest,
  type AiModelSearchSort,
} from '@smarteverything/domain';
import type { ModelChoice } from './model-choice';
export interface ModelSearchFilters {
  readonly provider: string;
  readonly input: string;
  readonly output: string;
  readonly context: string;
  readonly inputPrice: string;
  readonly outputPrice: string;
}
export const EMPTY_MODEL_FILTERS: ModelSearchFilters = {
  provider: '',
  input: '',
  output: '',
  context: '',
  inputPrice: '',
  outputPrice: '',
};
export type SearchQuery = Omit<AiModelSearchRequest, 'cursor' | 'limit' | 'gone'>;
export type SearchValidation =
  | { readonly ok: true; readonly query: SearchQuery }
  | { readonly ok: false; readonly message: string };
export function modelSearchQuery(
  kind: AiModelKind,
  text: string,
  filters: ModelSearchFilters,
  sort: AiModelSearchSort,
): SearchValidation {
  const query = AI_MODEL_SEARCH_QUERY.safeParse({
    kind,
    sort,
    ...(text.trim() === '' ? {} : { q: text.trim() }),
    ...(filters.provider === '' ? {} : { provider: filters.provider }),
    ...(filters.input === '' ? {} : { input_modality: filters.input }),
    ...(filters.output === '' ? {} : { output_modality: filters.output }),
    ...(filters.context === '' ? {} : { min_context: filters.context }),
    ...(filters.inputPrice === '' ? {} : { max_input_price: filters.inputPrice }),
    ...(filters.outputPrice === '' ? {} : { max_output_price: filters.outputPrice }),
  });
  if (!query.success)
    return {
      ok: false,
      message:
        text.trim().length > 80
          ? 'Search must be 80 characters or fewer.'
          : 'Use nonnegative limits. Token prices must be at most $1,000,000 per million.',
    };
  const { cursor: _cursor, limit: _limit, gone: _gone, ...data } = query.data;
  return { ok: true, query: data };
}
export function activeModelFilters(filters: ModelSearchFilters): number {
  return Object.values(filters).filter((value) => value !== '').length;
}
export function nativeMatches(model: ModelChoice, query: SearchQuery): boolean {
  if (
    !matchesModelSearchWords(
      {
        id: model.id,
        name: model.name,
        author_name: [model.providerLabel, model.supplierLabel, model.billing]
          .filter((label) => label !== undefined)
          .join(' '),
      },
      query.q ?? '',
    )
  )
    return false;
  if (query.provider !== undefined && model.provider !== query.provider) return false;
  if (!nativeCapabilitiesMatch(model, query)) return false;
  return query.max_input_price === undefined && query.max_output_price === undefined;
}

function nativeCapabilitiesMatch(model: ModelChoice, query: SearchQuery): boolean {
  if (
    query.input_modality !== undefined &&
    !model.inputs.some((value) => value === query.input_modality)
  )
    return false;
  if (
    query.output_modality !== undefined &&
    !model.outputs.some((value) => value === query.output_modality)
  )
    return false;
  return (
    query.min_context === undefined ||
    (model.contextLength !== null && model.contextLength >= query.min_context)
  );
}
