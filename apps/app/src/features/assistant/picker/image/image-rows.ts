import type { ImageEndpoint, ImageModelChoice } from '@smarteverything/domain';
import { compareText } from '../../../../format/text';
import type { ModelCandidate } from '../../data/model-candidates';
import type { ModelChoice } from '../model-choice';
import type { LibraryRow } from '../library/library-rows';
import { priceLine } from './image-price';
import { favouriteKey, matchesQuery, sameChoice, takesReferences } from './use-image-models';

export type ImageSort = 'name' | 'price';

export interface ImageFilters {
  readonly maker: string;
  readonly references: boolean;
  readonly preview: boolean;
}

export const NO_IMAGE_FILTERS: ImageFilters = { maker: '', references: false, preview: false };

export const IMAGE_SORT_OPTIONS = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'price', label: 'Lowest price' },
] as const;

export function makerOf(endpoint: ImageEndpoint): string {
  return endpoint.model.split('/')[0] ?? endpoint.model;
}

export function titleOf(slug: string): string {
  return slug
    .split(/[-_]/u)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function activeImageFilters(filters: ImageFilters): number {
  return Number(filters.maker !== '') + Number(filters.references) + Number(filters.preview);
}

function choiceOf(endpoint: ImageEndpoint): ModelChoice {
  const maker = makerOf(endpoint);
  return {
    id: favouriteKey(endpoint),
    name: endpoint.name,
    provider: maker,
    providerLabel: titleOf(maker),
    contextLength: null,
    price: { inputPerMillion: null, outputPerMillion: null, variable: false },
    efforts: [],
    latest: false,
    inputs: takesReferences(endpoint) ? ['image'] : [],
    outputs: [],
  };
}

export interface ImageRowFacts {
  readonly selected: ImageModelChoice | null;
  readonly favourites: ReadonlySet<string>;
  readonly dollars: (amount: number) => string;
  readonly pick: (endpoint: ImageEndpoint) => void;
}

export function imageRow(endpoint: ImageEndpoint, facts: ImageRowFacts): LibraryRow {
  const key = favouriteKey(endpoint);
  const candidate: ModelCandidate = {
    key,
    model: choiceOf(endpoint),
    selected: sameChoice(endpoint, facts.selected),
    favourite: facts.favourites.has(key),
    render: () => null,
    pick: (): void => {
      facts.pick(endpoint);
    },
  };
  return {
    key,
    candidate,
    sources: [],
    where: titleOf(endpoint.provider_tag),
    reason: null,
    facts: priceLine(endpoint, facts.dollars),
    favouriteId: key,
  };
}

export function imageEndpointsOf(
  endpoints: readonly ImageEndpoint[],
  text: string,
  filters: ImageFilters,
): readonly ImageEndpoint[] {
  return endpoints.filter(
    (endpoint) =>
      matchesQuery(endpoint, text) &&
      (filters.maker === '' || makerOf(endpoint) === filters.maker) &&
      (!filters.references || takesReferences(endpoint)) &&
      (!filters.preview || endpoint.supports_streaming),
  );
}

function lowestOutput(endpoint: ImageEndpoint): number {
  const costs = endpoint.pricing
    .filter((line) => line.billable === 'output_image')
    .map((line) => line.cost_usd);
  return costs.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...costs);
}

export function orderedImageEndpoints(
  endpoints: readonly ImageEndpoint[],
  sort: ImageSort,
  favourites: ReadonlySet<string>,
): readonly ImageEndpoint[] {
  const compare = (a: ImageEndpoint, b: ImageEndpoint): number =>
    sort === 'price'
      ? lowestOutput(a) - lowestOutput(b) || compareText(a.name, b.name)
      : compareText(a.name, b.name);
  const starred = endpoints.filter((endpoint) => favourites.has(favouriteKey(endpoint)));
  const rest = endpoints.filter((endpoint) => !favourites.has(favouriteKey(endpoint)));
  return [...starred.sort(compare), ...rest.sort(compare)];
}
