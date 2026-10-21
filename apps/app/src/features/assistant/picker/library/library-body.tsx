import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../components/button';
import { KeyboardList } from '../../../../components/keyboard-list';
import { ReasonLine } from '../../../../components/reason-line';
import { useIdiom } from '../../../../design/platform';
import { useFavouriteModels } from '../../data/favourites';
import type { ModelPickerProps } from '../../data/model-candidates';
import { useLibraryData, type LibraryData } from './library-data';
import { LibraryDetail } from './library-detail';
import { LibraryFilters } from './library-filters';
import { LibraryList, type LibraryListApi } from './library-list';
import {
  ROW_HEIGHT,
  libraryLayout,
  primaryAction,
  type LibraryLayout,
  type LibraryMode,
  type PrimaryAction,
} from './library-model';
import { LibraryBack, SelectionBar } from './library-pages';
import { LibraryProblem } from './library-states';
import { useLibraryState, type LibraryState } from './library-state';
import { LibraryTools } from './library-tools';

export interface LibraryBodyProps {
  readonly mode: LibraryMode;
  readonly width: number;
  readonly picker: ModelPickerProps;
  readonly note: string | null;
}

function resultsCount(data: LibraryData): string {
  const { pages, rows } = data.search;
  return pages.total === null
    ? 'Loading models'
    : `${String(pages.total)} catalogue matches · ${String(rows.nativeCount)} on your computers`;
}

function Footer({
  data,
  action,
  state,
}: {
  readonly data: LibraryData;
  readonly action: PrimaryAction | null;
  readonly state: LibraryState;
}): ReactNode {
  const row = data.selected;
  if (row === null) return null;
  return (
    <SelectionBar
      name={row.candidate.model.name}
      source={row.where ?? row.candidate.model.providerLabel}
      action={action}
      onDetails={(): void => {
        state.setPage('detail');
      }}
    />
  );
}

interface ResultsProps {
  readonly body: LibraryBodyProps;
  readonly state: LibraryState;
  readonly data: LibraryData;
  readonly filtersInline: boolean;
  readonly touch: boolean;
}

function useFavourite(): ((id: string) => void) | null {
  const favourites = useFavouriteModels();
  if (favourites.status !== 'ready') return null;
  return favourites.toggle;
}

function Rows({
  body,
  state,
  data,
  list,
  rowHeight,
}: Pick<ResultsProps, 'body' | 'state' | 'data'> & {
  readonly list: RefObject<LibraryListApi | null>;
  readonly rowHeight: number;
}): ReactNode {
  const onFavourite = useFavourite();
  const { pages } = data.search;
  if (data.view !== 'ready') {
    return <LibraryProblem view={data.view} retry={pages.retry} reset={state.reset} />;
  }
  return (
    <LibraryList
      key={data.search.key}
      ref={list}
      rows={data.rows}
      mode={body.mode}
      rowHeight={rowHeight}
      shownKey={data.selected?.key ?? null}
      onSelect={state.select}
      onFavourite={onFavourite}
      count={resultsCount(data)}
      more={pages.more}
      loading={pages.loading}
    />
  );
}

function Results({ body, state, data, filtersInline, touch }: ResultsProps): ReactNode {
  const [details, setDetails] = useState(false);
  const list = useRef<LibraryListApi>(null);
  const revealed = useRef<string | null>(null);
  const rowHeight = touch ? ROW_HEIGHT.touch : ROW_HEIGHT.pointer;
  return (
    <KeyboardList
      items={data.rows.map((row) => ({ id: row.key }))}
      label="Models"
      autoHighlight
      className="min-h-0 flex-1"
      onActivate={(key): void => {
        state.select(key);
        data.rows.find((row) => row.key === key)?.candidate.pick?.();
      }}
      onHighlight={(key, index): void => {
        state.select(key);
        if (revealed.current === key) return;
        revealed.current = key;
        list.current?.reveal(index);
      }}
    >
      <LibraryTools
        state={state}
        data={data}
        filtersInline={filtersInline}
        touch={touch}
        details={details}
        toggleDetails={(): void => {
          setDetails(!details);
        }}
      />
      {body.note === null ? null : (
        <View className="px-4 pt-2">
          <ReasonLine text={body.note} />
        </View>
      )}
      <View className="mt-2 min-h-0 flex-1 border-t border-outline-variant">
        <Rows body={body} state={state} data={data} list={list} rowHeight={rowHeight} />
      </View>
    </KeyboardList>
  );
}

function detailOf(data: LibraryData, action: PrimaryAction | null): ReactNode {
  const row = data.selected;
  if (row === null) return null;
  return (
    <LibraryDetail
      row={row}
      metrics={data.search.pages.metrics[row.candidate.model.id]}
      source={data.search.pages.snapshot?.sources.intelligence}
      action={action}
    />
  );
}

function FiltersColumn({
  state,
  data,
}: {
  readonly state: LibraryState;
  readonly data: LibraryData;
}): ReactNode {
  return (
    <LibraryFilters
      state={state}
      sources={data.sources}
      makers={data.search.makers.data ?? []}
      native={data.search.sources.candidates}
      validation={data.search.validation}
    />
  );
}

function FiltersPage({ state, data }: Pick<ResultsProps, 'state' | 'data'>): ReactNode {
  return (
    <LibraryBack
      title="Filters"
      onBack={(): void => {
        state.setPage('results');
      }}
      footer={
        <View className="flex-row border-t border-outline-variant p-3">
          <Button
            label={`Show ${String(data.rows.length)} models`}
            size="lg"
            grow
            onPress={(): void => {
              state.setPage('results');
            }}
          />
        </View>
      }
    >
      <FiltersColumn state={state} data={data} />
    </LibraryBack>
  );
}

function Columns({
  body,
  state,
  data,
  layout,
  touch,
}: Pick<ResultsProps, 'body' | 'state' | 'data' | 'touch'> & {
  readonly layout: LibraryLayout;
}): ReactNode {
  const action = primaryAction(body.mode, data.selected?.candidate ?? null);
  return (
    <View className="min-h-0 flex-1 flex-row">
      {layout === 'one' ? null : (
        <View className="w-60 border-r border-outline-variant">
          <FiltersColumn state={state} data={data} />
        </View>
      )}
      <View className="min-h-0 min-w-0 flex-1">
        <Results
          body={body}
          state={state}
          data={data}
          filtersInline={layout !== 'one'}
          touch={touch}
        />
        {layout === 'three' ? null : <Footer data={data} action={action} state={state} />}
      </View>
      {layout === 'three' ? (
        <View className="w-80 border-l border-outline-variant">{detailOf(data, action)}</View>
      ) : null}
    </View>
  );
}

export function LibraryBody(body: LibraryBodyProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const layout = libraryLayout(body.width, touch);
  const state = useLibraryState(body.picker.initialQuery ?? '');
  const data = useLibraryData(body.picker, state);
  if (state.page === 'filters' && layout === 'one')
    return <FiltersPage state={state} data={data} />;
  if (state.page === 'detail' && layout !== 'three') {
    const action = primaryAction(body.mode, data.selected?.candidate ?? null);
    return (
      <LibraryBack
        title="Details"
        onBack={(): void => {
          state.setPage('results');
        }}
      >
        {detailOf(data, action)}
      </LibraryBack>
    );
  }
  return <Columns body={body} state={state} data={data} layout={layout} touch={touch} />;
}
