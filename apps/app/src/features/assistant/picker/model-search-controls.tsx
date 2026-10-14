import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  AI_MODEL_SEARCH_SORT,
  type AiModelSearchSort,
  type AiProviderCount,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Select, type SelectOption } from '../../../components/select';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import type { ModelCandidate } from './model-candidates';
import {
  activeModelFilters,
  EMPTY_MODEL_FILTERS,
  type ModelSearchFilters,
} from './model-search-filters';
const SORT_LABELS: Readonly<Record<AiModelSearchSort, string>> = {
  newest: 'Newest',
  name: 'Name A–Z',
  intelligence: 'Intelligence',
  latency: 'Lowest latency',
  'input-price': 'Lowest input cost',
  'output-price': 'Lowest output cost',
  context: 'Largest context',
};
const SORT_OPTIONS = AI_MODEL_SEARCH_SORT.options.map((value) => ({
  value,
  label: SORT_LABELS[value],
}));
const MODALITIES = [
  { value: '', label: 'Any' },
  ...['text', 'image', 'audio', 'video', 'file'].map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
];
const CONTEXTS = [
  { value: '', label: 'Any' },
  { value: '32000', label: '32K or more' },
  { value: '128000', label: '128K or more' },
  { value: '200000', label: '200K or more' },
  { value: '1000000', label: '1M or more' },
];
export interface SearchControlProps {
  readonly filters: ModelSearchFilters;
  readonly setFilters: (filters: ModelSearchFilters) => void;
  readonly sort: AiModelSearchSort;
  readonly setSort: (sort: AiModelSearchSort) => void;
  readonly expanded: boolean;
  readonly toggle: () => void;
  readonly makers: readonly AiProviderCount[];
  readonly native: readonly ModelCandidate[];
}
function makerOptions(props: SearchControlProps): readonly SelectOption<string>[] {
  const options = [
    ...props.makers.map((maker) => ({ value: maker.provider, label: maker.name })),
    ...props.native
      .filter((row) => row.model.catalogueSupplier === undefined)
      .map((row) => ({ value: row.model.provider, label: row.model.providerLabel })),
  ];
  return [
    { value: '', label: 'All makers' },
    ...new Map(options.map((option) => [option.value, option])).values(),
  ];
}
interface FilterSelectProps extends Pick<SearchControlProps, 'filters' | 'setFilters'> {
  readonly label: string;
  readonly field: keyof ModelSearchFilters;
  readonly options: readonly SelectOption<string>[];
}
function FilterSelect({
  label,
  field,
  options,
  filters,
  setFilters,
}: FilterSelectProps): ReactNode {
  return (
    <View className="min-w-0 flex-1">
      <Select
        label={label}
        options={options}
        value={filters[field]}
        onChange={(value): void => {
          setFilters({ ...filters, [field]: value });
        }}
      />
    </View>
  );
}
interface PriceLimitProps extends Pick<SearchControlProps, 'filters' | 'setFilters'> {
  readonly field: 'inputPrice' | 'outputPrice';
  readonly label: string;
}
function PriceLimit({ field, label, filters, setFilters }: PriceLimitProps): ReactNode {
  return (
    <View className="min-w-0 flex-1">
      <TextField
        label={label}
        value={filters[field]}
        kind="number"
        placeholder="Any"
        onChange={(value): void => {
          setFilters({ ...filters, [field]: value });
        }}
      />
    </View>
  );
}
function Filters(props: SearchControlProps): ReactNode {
  return (
    <View className="gap-3 rounded-md bg-surface-2 p-2">
      <Select
        label="Maker"
        options={makerOptions(props)}
        value={props.filters.provider}
        searchable
        onChange={(provider): void => {
          props.setFilters({ ...props.filters, provider });
        }}
      />
      <DirectionalFilters {...props} />
      <Text variant="caption" tone="variant">
        Price limits include known token prices.
      </Text>
      <Button
        label="Reset filters"
        variant="text"
        onPress={(): void => {
          props.setFilters(EMPTY_MODEL_FILTERS);
        }}
      />
    </View>
  );
}
export function ModelSearchControls(props: SearchControlProps): ReactNode {
  const count = activeModelFilters(props.filters);
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="label" tone="variant">
          All models
        </Text>
        <Button
          label={count === 0 ? 'Filters' : `Filters (${String(count)})`}
          variant="text"
          onPress={props.toggle}
        />
      </View>
      <Select label="Sort" options={SORT_OPTIONS} value={props.sort} onChange={props.setSort} />
      {props.expanded ? <Filters {...props} /> : null}
    </View>
  );
}

function DirectionalFilters(props: SearchControlProps): ReactNode {
  return (
    <>
      <View className="flex-row gap-2">
        <FilterSelect
          label="Input"
          field="input"
          options={MODALITIES}
          filters={props.filters}
          setFilters={props.setFilters}
        />
        <FilterSelect
          label="Output"
          field="output"
          options={MODALITIES}
          filters={props.filters}
          setFilters={props.setFilters}
        />
      </View>
      <Select
        label="Minimum context"
        options={CONTEXTS}
        value={props.filters.context}
        onChange={(context): void => {
          props.setFilters({ ...props.filters, context });
        }}
      />
      <View className="flex-row gap-2">
        <PriceLimit
          label="Input USD / 1M ≤"
          field="inputPrice"
          filters={props.filters}
          setFilters={props.setFilters}
        />
        <PriceLimit
          label="Output USD / 1M ≤"
          field="outputPrice"
          filters={props.filters}
          setFilters={props.setFilters}
        />
      </View>
    </>
  );
}
