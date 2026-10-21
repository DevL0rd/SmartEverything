import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import type { ImageEndpoint } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../../components/button';
import { HScroller } from '../../../../components/h-scroller';
import { KeyboardList } from '../../../../components/keyboard-list';
import { ReasonLine } from '../../../../components/reason-line';
import { SearchField } from '../../../../components/search-field';
import { StatusChip } from '../../../../components/status-chip';
import { useIdiom } from '../../../../design/platform';
import { useMoney } from '../../../region';
import { LibraryBack, SelectionBar } from '../library/library-pages';
import { LibraryList, type LibraryListApi } from '../library/library-list';
import { ROW_HEIGHT, type PrimaryAction } from '../library/library-model';
import { selectedRow, libraryView, type LibraryRow } from '../library/library-rows';
import { LibraryProblem } from '../library/library-states';
import { CountLine, SortSelect } from '../library/library-tools';
import { ImageDetail } from './image-detail';
import { ImageFiltersColumn } from './image-filters';
import {
  IMAGE_SORT_OPTIONS,
  NO_IMAGE_FILTERS,
  activeImageFilters,
  imageEndpointsOf,
  imageRow,
  makerOf,
  orderedImageEndpoints,
  titleOf,
  type ImageFilters,
  type ImageSort,
} from './image-rows';
import {
  favouriteKey,
  useImageCatalog,
  useImageFavourites,
  useImageModelChange,
  useSelectedImageModel,
} from './use-image-models';

const SOURCE_LABEL = 'Home Hub · OpenRouter';

type Page = 'results' | 'filters' | 'detail';

function makerOptions(endpoints: readonly ImageEndpoint[]): readonly {
  readonly value: string;
  readonly label: string;
}[] {
  const makers = [...new Set(endpoints.map(makerOf))].sort();
  return [
    { value: '', label: 'All makers' },
    ...makers.map((maker) => ({ value: maker, label: titleOf(maker) })),
  ];
}

interface Data {
  readonly rows: readonly LibraryRow[];
  readonly selected: LibraryRow | null;
  readonly endpoints: readonly ImageEndpoint[];
  readonly problem: string | null;
  readonly view: ReturnType<typeof libraryView>;
  readonly retry: () => void;
  readonly toggleFavourite: ((id: string) => void) | null;
}

interface Query {
  readonly text: string;
  readonly filters: ImageFilters;
  readonly sort: ImageSort;
  readonly selectedKey: string | null;
}

function useData(query: Query, chosen: (endpoint: ImageEndpoint) => void): Data {
  const { text, filters, sort, selectedKey } = query;
  const catalog = useImageCatalog();
  const favourites = useImageFavourites();
  const selected = useSelectedImageModel();
  const money = useMoney();
  const endpoints = catalog.data?.endpoints;
  const starred = favourites?.favourites;
  const rows = useMemo(() => {
    const stars = starred ?? new Set<string>();
    const facts = { selected, favourites: stars, dollars: money.dollars, pick: chosen };
    return orderedImageEndpoints(imageEndpointsOf(endpoints ?? [], text, filters), sort, stars).map(
      (endpoint) => imageRow(endpoint, facts),
    );
  }, [endpoints, text, filters, sort, starred, selected, money, chosen]);
  const readiness = catalog.data?.readiness;
  return {
    rows,
    selected: selectedRow(rows, selectedKey),
    endpoints: endpoints ?? [],
    problem: readiness?.ready === false ? readiness.detail : null,
    view: libraryView({
      rows: rows.length,
      failed: catalog.isError,
      loading: catalog.isPending,
      reachable: true,
    }),
    retry: (): void => {
      background(catalog.refetch(), 'image_models.refetch_failed');
    },
    toggleFavourite: favourites === null ? null : favourites.toggle,
  };
}

interface Tools {
  readonly text: string;
  readonly setText: (text: string) => void;
  readonly sort: ImageSort;
  readonly setSort: (sort: ImageSort) => void;
  readonly filters: ImageFilters;
  readonly setFilters: (filters: ImageFilters) => void;
  readonly setPage: (page: Page) => void;
}

function ImageTools({
  tools,
  data,
  touch,
}: {
  readonly tools: Tools;
  readonly data: Data;
  readonly touch: boolean;
}): ReactNode {
  const sort = (
    <SortSelect options={IMAGE_SORT_OPTIONS} sort={tools.sort} onChange={tools.setSort} />
  );
  return (
    <View className="gap-2 pt-2">
      <View className="gap-2 px-4">
        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <SearchField
              value={tools.text}
              onChange={tools.setText}
              placeholder="Search image models"
              variant="field"
              focusOnMount={!touch}
            />
          </View>
          {touch ? null : sort}
        </View>
        <CountLine
          inline={false}
          active={activeImageFilters(tools.filters)}
          onFilters={(): void => {
            tools.setPage('filters');
          }}
          sort={touch ? sort : null}
          count={`${String(data.rows.length)} image models`}
        />
      </View>
      <HScroller label="Model sources">
        <StatusChip status={data.problem === null ? 'live' : 'attention'} label={SOURCE_LABEL} />
      </HScroller>
      {data.problem === null ? null : (
        <View className="px-4">
          <ReasonLine text={data.problem} icon="warning" tone="warning" />
        </View>
      )}
    </View>
  );
}

function actionOf(
  row: LibraryRow | null,
  change: (choice: null) => void,
  close: () => void,
): PrimaryAction | null {
  if (row === null) return null;
  const { selected, pick } = row.candidate;
  if (selected) {
    return {
      label: 'Clear default',
      run: (): void => {
        change(null);
        close();
      },
    };
  }
  return {
    label: 'Set as default',
    run:
      pick === null
        ? null
        : (): void => {
            pick();
            close();
          },
  };
}

interface RowsProps {
  readonly tools: Tools;
  readonly data: Data;
  readonly list: RefObject<LibraryListApi | null>;
  readonly select: (key: string) => void;
  readonly touch: boolean;
}

function ResultRows({ tools, data, list, select, touch }: RowsProps): ReactNode {
  if (data.view !== 'ready') {
    return (
      <LibraryProblem
        view={data.view}
        retry={data.retry}
        reset={(): void => {
          tools.setFilters(NO_IMAGE_FILTERS);
        }}
        noun="image models"
        single="image model"
      />
    );
  }
  return (
    <LibraryList
      ref={list}
      rows={data.rows}
      mode="default"
      rowHeight={touch ? ROW_HEIGHT.touch : ROW_HEIGHT.pointer}
      shownKey={data.selected?.key ?? null}
      onSelect={select}
      onFavourite={data.toggleFavourite}
      count={`${String(data.rows.length)} image models`}
      more={null}
      loading={false}
    />
  );
}

interface ResultsProps {
  readonly tools: Tools;
  readonly data: Data;
  readonly action: PrimaryAction | null;
  readonly select: (key: string) => void;
  readonly touch: boolean;
}

function Results({ tools, data, action, select, touch }: ResultsProps): ReactNode {
  const list = useRef<LibraryListApi>(null);
  const revealed = useRef<string | null>(null);
  const row = data.selected;
  return (
    <View className="min-h-0 flex-1">
      <KeyboardList
        items={data.rows.map((item) => ({ id: item.key }))}
        label="Image models"
        autoHighlight
        className="min-h-0 flex-1"
        onActivate={(key): void => {
          select(key);
          data.rows.find((item) => item.key === key)?.candidate.pick?.();
        }}
        onHighlight={(key, index): void => {
          select(key);
          if (revealed.current === key) return;
          revealed.current = key;
          list.current?.reveal(index);
        }}
      >
        <ImageTools tools={tools} data={data} touch={touch} />
        <View className="mt-2 min-h-0 flex-1 border-t border-outline-variant">
          <ResultRows tools={tools} data={data} list={list} select={select} touch={touch} />
        </View>
      </KeyboardList>
      {row === null ? null : (
        <SelectionBar
          name={row.candidate.model.name}
          source={`${row.candidate.model.providerLabel} · ${row.where ?? ''}`}
          action={action}
          onDetails={(): void => {
            tools.setPage('detail');
          }}
        />
      )}
    </View>
  );
}

function FiltersPage({
  tools,
  data,
  back,
}: {
  readonly tools: Tools;
  readonly data: Data;
  readonly back: () => void;
}): ReactNode {
  return (
    <LibraryBack
      title="Filters"
      onBack={back}
      footer={
        <View className="flex-row border-t border-outline-variant p-3">
          <Button label={`Show ${String(data.rows.length)} models`} size="lg" grow onPress={back} />
        </View>
      }
    >
      <ImageFiltersColumn
        filters={tools.filters}
        makers={makerOptions(data.endpoints)}
        onChange={tools.setFilters}
      />
    </LibraryBack>
  );
}

export function ImageLibraryBody({ onClose }: { readonly onClose: () => void }): ReactNode {
  const touch = useIdiom() === 'touch';
  const change = useImageModelChange();
  const [text, setText] = useState('');
  const [sort, setSort] = useState<ImageSort>('name');
  const [filters, setFilters] = useState(NO_IMAGE_FILTERS);
  const [page, setPage] = useState<Page>('results');
  const [selectedKey, select] = useState<string | null>(null);
  const data = useData({ text, filters, sort, selectedKey }, (endpoint) => {
    change({ model: endpoint.model, provider_tag: endpoint.provider_tag });
  });
  const action = actionOf(data.selected, change, onClose);
  const tools = { text, setText, sort, setSort, filters, setFilters, setPage };
  const back = (): void => {
    setPage('results');
  };
  const endpoint = data.endpoints.find((item) => favouriteKey(item) === data.selected?.key);
  if (page === 'filters') {
    return <FiltersPage tools={tools} data={data} back={back} />;
  }
  if (page === 'detail' && endpoint !== undefined) {
    return (
      <LibraryBack title="Details" onBack={back}>
        <ImageDetail
          endpoint={endpoint}
          isDefault={data.selected?.candidate.selected === true}
          action={action}
        />
      </LibraryBack>
    );
  }
  return <Results tools={tools} data={data} action={action} select={select} touch={touch} />;
}
