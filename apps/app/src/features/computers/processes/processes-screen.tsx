import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  processKey,
  type ProcessRow,
  type ProcessSort,
  type ProcessesPart,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ReasonLine } from '../../../components/reason-line';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useAreaWidth } from '../../../design/size-class';
import { ComputerFrame } from '../components/computer-frame';
import { DemandRegion } from '../../../store/demand-region';
import { useComputerSelect } from '../data/computer-metrics';
import { useComputerReach } from '../data/computer-scopes';
import { bodyWidthOf } from '../model/sections';
import { layoutOf, type ProcessLayout } from './process-format';
import { defaultOpen, flatLines, treeLines, type ProcessLine } from './process-lines';
import { ProcessControls, type ProcessView } from './process-controls';
import { ProcessSheet } from './process-sheet';
import {
  DEFAULT_ORDERING,
  orderingAfter,
  windowOf,
  type ProcessFilter,
  type ProcessOrdering,
} from './process-sort';
import { ProcessTable, type ProcessTableProps } from './process-table';
import { SectionGate } from './section-gate';

const TOPICS = ['processes'] as const;
const SEARCH_SETTLE_MS = 250;
const NO_ROWS: readonly ProcessRow[] = [];

function Loading(): ReactNode {
  return (
    <View className="gap-3 p-4" accessibilityLabel="Reading processes">
      {[0, 1, 2, 3, 4, 5].map((slot) => (
        <Skeleton key={slot} shape="line" className="h-8" />
      ))}
    </View>
  );
}

function useOpenState(rows: readonly ProcessRow[]): {
  readonly isOpen: (key: string) => boolean;
  readonly toggle: (key: string) => void;
} {
  const [defaults, setDefaults] = useState<ReadonlySet<string> | null>(null);
  const [changed, setChanged] = useState<ReadonlyMap<string, boolean>>(new Map());
  if (defaults === null && rows.length > 0) setDefaults(defaultOpen(rows));
  const isOpen = (key: string): boolean => changed.get(key) ?? defaults?.has(key) ?? false;
  return {
    isOpen,
    toggle: (key): void => {
      setChanged(new Map(changed).set(key, !isOpen(key)));
    },
  };
}

interface ListState {
  readonly ordering: ProcessOrdering;
  readonly setOrdering: (next: (current: ProcessOrdering) => ProcessOrdering) => void;
  readonly view: ProcessView;
  readonly setView: (view: ProcessView) => void;
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly filter: ProcessFilter;
  readonly setFilter: (filter: ProcessFilter) => void;
  readonly search: string;
  readonly flat: boolean;
  readonly tree: boolean;
  readonly gpuShown: boolean;
  readonly layout: ProcessLayout;
}

function useListState(): ListState {
  const [ordering, setOrdering] = useState<ProcessOrdering>(DEFAULT_ORDERING);
  const [view, setView] = useState<ProcessView>('tree');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProcessFilter>('all');
  const search = useDebouncedValue(query, SEARCH_SETTLE_MS).trim();
  const layout = layoutOf(bodyWidthOf(useAreaWidth()));
  const flat = search !== '' || filter !== 'all';
  const gpuShown = layout !== 'phone' || ordering.sort === 'gpu' || filter === 'gpu';
  return {
    ordering,
    setOrdering,
    view,
    setView,
    query,
    setQuery,
    filter,
    setFilter,
    search,
    flat,
    tree: view === 'tree' && !flat,
    gpuShown,
    layout,
  };
}

function Card({
  part,
  lines,
  state,
  handlers,
}: {
  readonly part: ProcessesPart | undefined;
  readonly lines: readonly ProcessLine[];
  readonly state: ListState;
  readonly handlers: Pick<ProcessTableProps, 'onSort' | 'onOpen' | 'onToggle'>;
}): ReactNode {
  const clear = (): void => {
    state.setQuery('');
    state.setFilter('all');
  };
  if (part === undefined) return <Loading />;
  if (lines.length === 0) {
    return (
      <EmptyState
        icon="search"
        title={state.flat ? 'No matching processes' : 'No processes'}
        body="Try a different name or clear the filter."
        action={state.flat ? <Button label="Clear" variant="tonal" onPress={clear} /> : undefined}
      />
    );
  }
  return (
    <ProcessTable
      lines={lines}
      layout={state.layout}
      tree={state.tree}
      ordering={state.ordering}
      gpuShown={state.gpuShown}
      summary={state.flat ? `${String(lines.length)} of ${String(part.total)}` : ''}
      {...handlers}
    />
  );
}

function useHandlers(
  state: ListState,
  toggle: (key: string) => void,
  select: (key: string) => void,
): Pick<ProcessTableProps, 'onSort' | 'onOpen' | 'onToggle'> {
  return {
    onOpen: useStableCallback(select),
    onToggle: useStableCallback(toggle),
    onSort: useStableCallback((sort: ProcessSort) => {
      state.setOrdering((current) => orderingAfter(current, sort));
    }),
  };
}

export function Results({
  deviceId,
  offline,
}: {
  readonly deviceId: string;
  readonly offline: boolean;
}): ReactNode {
  const state = useListState();
  const [selected, setSelected] = useState<string | null>(null);
  const part = useComputerSelect(deviceId, (parts) => parts.processes);
  const rows = part?.rows ?? NO_ROWS;
  const open = useOpenState(rows);
  const lines = state.tree ? treeLines(rows, open.isOpen) : flatLines(rows, state.filter);
  const handlers = useHandlers(state, open.toggle, setSelected);
  return (
    <DemandRegion
      deviceId={deviceId}
      topics={TOPICS}
      window={windowOf(state.ordering, state.search, state.tree, state.gpuShown)}
      className="min-h-0 flex-1 gap-3"
    >
      <ProcessControls
        deviceId={deviceId}
        view={state.view}
        onView={state.setView}
        query={state.query}
        onQuery={state.setQuery}
        filter={state.filter}
        onFilter={state.setFilter}
        flat={state.flat}
        shown={lines.length}
        total={part?.total ?? 0}
      />
      <View className="min-h-0 flex-1 overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        <Card part={part} lines={lines} state={state} handlers={handlers} />
      </View>
      <GpuHint rows={rows} gpuShown={state.gpuShown} layout={state.layout} />
      <SelectedSheet
        deviceId={deviceId}
        rows={rows}
        selected={selected}
        offline={offline}
        onClose={() => {
          setSelected(null);
        }}
      />
    </DemandRegion>
  );
}

function SelectedSheet({
  deviceId,
  rows,
  selected,
  offline,
  onClose,
}: {
  readonly deviceId: string;
  readonly rows: readonly ProcessRow[];
  readonly selected: string | null;
  readonly offline: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const chosen = rows.find((row) => processKey(row) === selected);
  return (
    <ProcessSheet
      deviceId={deviceId}
      rowKey={chosen === undefined ? null : selected}
      name={chosen?.name ?? ''}
      helpers={chosen?.descendants ?? 0}
      offline={offline}
      onClose={onClose}
    />
  );
}

function GpuHint({
  rows,
  gpuShown,
  layout,
}: {
  readonly rows: readonly ProcessRow[];
  readonly gpuShown: boolean;
  readonly layout: ProcessLayout;
}): ReactNode {
  if (!gpuShown || layout === 'phone' || rows.length === 0 || rows.some((row) => row.gpu !== null))
    return null;
  return (
    <Text variant="caption" tone="variant">
      GPU use per program isn’t available on this computer.
    </Text>
  );
}

export function ComputerProcessesScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const reach = useComputerReach(deviceId);
  return (
    <ComputerFrame deviceId={deviceId} title="Processes" width="dashboard" scroll={false}>
      <SectionGate deviceId={deviceId} section="processes" scope="processes">
        {reach.online ? null : (
          <ReasonLine
            icon="wifiOff"
            tone="warning"
            text={`${reach.name} is offline. This is the last reading.`}
          />
        )}
        <Results deviceId={deviceId} offline={!reach.online} />
      </SectionGate>
    </ComputerFrame>
  );
}
