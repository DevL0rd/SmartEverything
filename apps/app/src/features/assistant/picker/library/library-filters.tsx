import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { AiProviderCount } from '@smarteverything/domain';
import { Button } from '../../../../components/button';
import { Checkbox } from '../../../../components/checkbox';
import { Select, type SelectOption } from '../../../../components/select';
import { Text } from '../../../../components/text';
import { TextField } from '../../../../components/text-field';
import type { ModelCandidate } from '../../data/model-candidates';
import type { ModelSearchFilters, SearchValidation } from '../model-search-filters';
import { LibraryChip } from './library-chip';
import { CONTEXT_OPTIONS, MODALITY_OPTIONS, modalityLabel } from './library-model';
import { sourceChipLabel, type LibrarySource } from './library-sources';
import type { LibraryState } from './library-state';

const ALL_MAKERS = '';

function makerOptions(
  makers: readonly AiProviderCount[],
  native: readonly ModelCandidate[],
): readonly SelectOption<string>[] {
  const options = [
    ...makers.map((maker) => ({ value: maker.provider, label: maker.name })),
    ...native
      .filter((row) => row.model.catalogueSupplier === undefined)
      .map((row) => ({ value: row.model.provider, label: row.model.providerLabel })),
  ];
  return [
    { value: ALL_MAKERS, label: 'All makers' },
    ...new Map(options.map((option) => [option.value, option])).values(),
  ];
}

export function Group({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="gap-2 border-b border-outline-variant px-4 py-3">
      <Text variant="label" tone="variant" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function SourceGroup({
  sources,
  state,
}: {
  readonly sources: readonly LibrarySource[];
  readonly state: LibraryState;
}): ReactNode {
  return (
    <Group title="Source">
      {sources.map((source) => (
        <Checkbox
          key={source.id}
          label={sourceChipLabel(source)}
          checked={state.sources.has(source.id)}
          onChange={(): void => {
            state.toggleSource(source.id);
          }}
        />
      ))}
    </Group>
  );
}

interface ChipChoiceProps {
  readonly title: string;
  readonly field: 'input' | 'output' | 'context';
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly state: LibraryState;
}

function ChipChoice({ title, field, options, state }: ChipChoiceProps): ReactNode {
  return (
    <Group title={title}>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <LibraryChip
            key={option.value}
            label={option.label}
            active={state.filters[field] === option.value}
            onPress={(): void => {
              state.setFilters({
                ...state.filters,
                [field]: state.filters[field] === option.value ? '' : option.value,
              });
            }}
          />
        ))}
      </View>
    </Group>
  );
}

function PriceField({
  label,
  field,
  state,
}: {
  readonly label: string;
  readonly field: keyof Pick<ModelSearchFilters, 'inputPrice' | 'outputPrice'>;
  readonly state: LibraryState;
}): ReactNode {
  return (
    <View className="min-w-0 flex-1">
      <TextField
        label={label}
        kind="number"
        placeholder="Any"
        value={state.filters[field]}
        onChange={(value): void => {
          state.setFilters({ ...state.filters, [field]: value });
        }}
      />
    </View>
  );
}

function PriceGroup({
  state,
  validation,
}: {
  readonly state: LibraryState;
  readonly validation: SearchValidation;
}): ReactNode {
  return (
    <Group title="Price at most per 1M tokens">
      <View className="flex-row gap-2">
        <PriceField label="Input $" field="inputPrice" state={state} />
        <PriceField label="Output $" field="outputPrice" state={state} />
      </View>
      {validation.ok ? null : (
        <Text variant="footnote" tone="critical" accessibilityLiveRegion="polite">
          {validation.message}
        </Text>
      )}
    </Group>
  );
}

export interface LibraryFiltersProps {
  readonly state: LibraryState;
  readonly sources: readonly LibrarySource[];
  readonly makers: readonly AiProviderCount[];
  readonly native: readonly ModelCandidate[];
  readonly validation: SearchValidation;
}

export function LibraryFilters({
  state,
  sources,
  makers,
  native,
  validation,
}: LibraryFiltersProps): ReactNode {
  return (
    <ScrollView className="min-h-0 flex-1" keyboardShouldPersistTaps="handled">
      <SourceGroup sources={sources} state={state} />
      <Group title="Maker">
        <Select
          label="Maker"
          showLabel={false}
          searchable
          options={makerOptions(makers, native)}
          value={state.filters.provider}
          onChange={(provider): void => {
            state.setFilters({ ...state.filters, provider });
          }}
        />
      </Group>
      <ChipChoice
        title="Input"
        field="input"
        options={MODALITY_OPTIONS.map((value) => ({ value, label: modalityLabel(value) }))}
        state={state}
      />
      <ChipChoice
        title="Output"
        field="output"
        options={MODALITY_OPTIONS.map((value) => ({ value, label: modalityLabel(value) }))}
        state={state}
      />
      <ChipChoice
        title="Context at least"
        field="context"
        options={CONTEXT_OPTIONS}
        state={state}
      />
      <PriceGroup state={state} validation={validation} />
      <View className="flex-row p-3">
        <Button label="Reset filters" variant="outlined" grow onPress={state.reset} />
      </View>
    </ScrollView>
  );
}
