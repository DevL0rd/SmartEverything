import { use, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Banner } from '../../../../components/banner';
import { FlatChoice } from '../../../../components/flat-choice';
import { HScroller } from '../../../../components/h-scroller';
import { SearchField } from '../../../../components/search-field';
import { Select } from '../../../../components/select';
import { StatusChip } from '../../../../components/status-chip';
import { Text } from '../../../../components/text';
import { useFocusRequest } from '../../../../components/focus-request';
import { useMeasuredWidth } from '../../../../components/use-measured-width';
import type { LibraryData } from './library-data';
import { SORT_OPTIONS } from './library-model';
import { sourceChipLabel, type LibrarySource } from './library-sources';
import type { LibraryState } from './library-state';
import { ModelSearchSource } from '../model-search-source';
import { SourceStatuses } from '../model-source-status';
import { LibraryOriginFocus } from './library-pages';

export function SortSelect<T extends string>({
  options,
  sort,
  onChange,
  compact = false,
}: {
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly sort: T;
  readonly onChange: (sort: T) => void;
  readonly compact?: boolean;
}): ReactNode {
  return (
    <View className={compact ? 'w-full max-w-44' : 'w-44 max-w-full'}>
      <Select label="Sort" showLabel={false} options={options} value={sort} onChange={onChange} />
    </View>
  );
}

function ResultCount({ count }: { readonly count: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" className="shrink-0 tabular" numberOfLines={1}>
      {count}
    </Text>
  );
}

export function SourceCountRow({
  children,
  count,
}: {
  readonly children: ReactNode;
  readonly count: string | null;
}): ReactNode {
  return count === null ? (
    children
  ) : (
    <View className="flex-row items-center gap-2 pr-4">
      <View className="min-w-0 flex-1">{children}</View>
      <ResultCount count={count} />
    </View>
  );
}

export function SourceStrip({
  sources,
  count,
}: {
  readonly sources: readonly LibrarySource[];
  readonly count: string | null;
}): ReactNode {
  return (
    <SourceCountRow count={count}>
      <HScroller label="Model sources">
        {sources.map((source) => (
          <StatusChip key={source.id} status={source.health} label={sourceChipLabel(source)} />
        ))}
      </HScroller>
    </SourceCountRow>
  );
}

export interface LibraryToolsProps {
  readonly state: LibraryState;
  readonly data: LibraryData;
  readonly filtersInline: boolean;
  readonly compact: boolean;
  readonly touch: boolean;
  readonly details: boolean;
  readonly toggleDetails: () => void;
}

export function CountLine({
  inline,
  active,
  onFilters,
  sort,
  count,
}: {
  readonly inline: boolean;
  readonly active: number;
  readonly onFilters: () => void;
  readonly sort: ReactNode;
  readonly count: string | null;
}): ReactNode {
  const ref = useFocusRequest(use(LibraryOriginFocus) === 'filters');
  return (
    <View className="flex-row items-center justify-between gap-2">
      {inline ? (
        <Text variant="footnote" tone="variant">
          Filters in the left column
        </Text>
      ) : (
        <View className="shrink-0">
          <FlatChoice
            ref={ref}
            label="Filters"
            count={active === 0 ? undefined : active}
            active={active > 0}
            menu
            icon="filter"
            onPress={onFilters}
          />
        </View>
      )}
      {sort === null ? null : <View className="min-w-0 flex-1">{sort}</View>}
      {count === null ? null : <ResultCount count={count} />}
    </View>
  );
}

function LibraryCountLine({
  state,
  data,
  filtersInline,
  touch,
  compact,
  count,
}: LibraryToolsProps & { readonly count: string | null }): ReactNode {
  return (
    <CountLine
      inline={filtersInline}
      active={state.active}
      onFilters={(): void => {
        state.setPage('filters');
      }}
      sort={
        touch && !data.search.scoped ? (
          <SortSelect
            options={SORT_OPTIONS}
            sort={state.sort}
            onChange={state.setSort}
            compact={compact}
          />
        ) : null
      }
      count={count}
    />
  );
}

export function modelCount(count: number, name = 'model'): string {
  return `${String(count)} ${name}${count === 1 ? '' : 's'}`;
}

export function useCountAtSources(
  enabled: boolean,
  inlineWidth: number,
): {
  readonly countAtSources: boolean;
  readonly onLayout: ReturnType<typeof useMeasuredWidth>['onLayout'];
} {
  const { width, onLayout } = useMeasuredWidth();
  const { fontScale } = useWindowDimensions();
  return { countAtSources: enabled && width > 0 && width < inlineWidth * fontScale, onLayout };
}

export function LibraryTools(props: LibraryToolsProps): ReactNode {
  const { state, data, touch } = props;
  const { countAtSources, onLayout } = useCountAtSources(touch && !data.search.scoped, 352);
  const count = modelCount(data.rows.length);
  return (
    <View className="gap-2 pt-2" onLayout={onLayout}>
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
          {touch || data.search.scoped ? null : (
            <SortSelect options={SORT_OPTIONS} sort={state.sort} onChange={state.setSort} />
          )}
        </View>
        <LibraryCountLine {...props} count={countAtSources ? null : count} />
      </View>
      {data.search.scoped ? null : (
        <SourceStrip sources={data.sources} count={countAtSources ? count : null} />
      )}
      <SourceStatuses sources={[data.search.sources.native, data.search.sources.routes]} />
      {data.search.pages.updated ? (
        <View className="px-4">
          <Banner tone="info" title="Models updated" />
        </View>
      ) : null}
      {data.search.scoped ? null : (
        <View className="px-4">
          <ModelSearchSource
            pages={data.search.pages}
            sort={state.sort}
            details={props.details}
            toggle={props.toggleDetails}
          />
        </View>
      )}
    </View>
  );
}
