import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiModelSearchSort } from '@smarteverything/domain';
import { Banner } from '../../../../components/banner';
import { Button } from '../../../../components/button';
import { HScroller } from '../../../../components/h-scroller';
import { SearchField } from '../../../../components/search-field';
import { Select } from '../../../../components/select';
import { StatusChip } from '../../../../components/status-chip';
import { Text } from '../../../../components/text';
import type { LibraryData } from './library-data';
import { SORT_OPTIONS } from './library-model';
import { sourceChipLabel, type LibrarySource } from './library-sources';
import type { LibraryState } from './library-state';
import { ModelSearchSource } from '../model-search-source';
import { SourceStatuses } from '../model-source-status';

function SortSelect({
  sort,
  onChange,
}: {
  readonly sort: AiModelSearchSort;
  readonly onChange: (sort: AiModelSearchSort) => void;
}): ReactNode {
  return (
    <View className="w-44">
      <Select
        label="Sort"
        showLabel={false}
        options={SORT_OPTIONS}
        value={sort}
        onChange={onChange}
      />
    </View>
  );
}

function SourceStrip({ sources }: { readonly sources: readonly LibrarySource[] }): ReactNode {
  return (
    <HScroller label="Model sources">
      {sources.map((source) => (
        <StatusChip key={source.id} status={source.health} label={sourceChipLabel(source)} />
      ))}
    </HScroller>
  );
}

export interface LibraryToolsProps {
  readonly state: LibraryState;
  readonly data: LibraryData;
  readonly filtersInline: boolean;
  readonly touch: boolean;
  readonly details: boolean;
  readonly toggleDetails: () => void;
}

function CountLine({ state, data, filtersInline, touch }: LibraryToolsProps): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-2">
      {filtersInline ? (
        <Text variant="footnote" tone="variant">
          Filters in the left column
        </Text>
      ) : (
        <Button
          label={state.active === 0 ? 'Filters' : `Filters · ${String(state.active)}`}
          variant="outlined"
          icon="filter"
          onPress={(): void => {
            state.setPage('filters');
          }}
        />
      )}
      {touch ? <SortSelect sort={state.sort} onChange={state.setSort} /> : null}
      <Text variant="footnote" tone="variant" className="tabular">
        {`${String(data.rows.length)} models`}
      </Text>
    </View>
  );
}

export function LibraryTools(props: LibraryToolsProps): ReactNode {
  const { state, data, touch } = props;
  return (
    <View className="gap-2 pt-2">
      <View className="gap-2 px-4">
        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <SearchField
              value={state.text}
              onChange={state.setText}
              placeholder="Search models"
              variant="field"
              focusOnMount={!touch}
            />
          </View>
          {touch ? null : <SortSelect sort={state.sort} onChange={state.setSort} />}
        </View>
        <CountLine {...props} />
      </View>
      <SourceStrip sources={data.sources} />
      <SourceStatuses sources={[data.search.sources.native, data.search.sources.routes]} />
      {data.search.pages.updated ? (
        <View className="px-4">
          <Banner tone="info" title="Models updated" />
        </View>
      ) : null}
      <View className="px-4">
        <ModelSearchSource
          pages={data.search.pages}
          sort={state.sort}
          details={props.details}
          toggle={props.toggleDetails}
        />
      </View>
    </View>
  );
}
