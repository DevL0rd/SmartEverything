import { Redirect } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import {
  LOG_LEVEL,
  RUNTIME_LOG_SEARCH_MAX,
  type RuntimeLogRow,
  type RuntimeLogSource,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { SearchField } from '../../../components/search-field';
import { Select } from '../../../components/select';
import type { SelectOption } from '../../../components/select-picker';
import { Skeleton } from '../../../components/skeleton';
import { useDeveloperOn } from '../../../developer/panel-read';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useIsOwner, useSession } from '../../../store/selectors';
import { RuntimeLogEntry } from '../components/runtime-log-row';
import { useRuntimeLogs, useRuntimeLogSources } from '../data/runtime-logs';

const PAGE = 'developer/logs';
const SEARCH_DELAY_MS = 200;
const ALL = 'all';
type Level = RuntimeLogRow['level'] | typeof ALL;

const LEVELS: readonly SelectOption<Level>[] = [
  { value: ALL, label: 'All levels' },
  ...LOG_LEVEL.options.map((value) => ({
    value,
    label: value.slice(0, 1).toUpperCase() + value.slice(1),
  })),
];

function sourceOptions(
  sources: readonly RuntimeLogSource[],
  currentClient: string,
): readonly SelectOption<string>[] {
  const options = new Map<string, SelectOption<string>>();
  for (const item of sources) {
    if (options.has(item.source)) continue;
    const label =
      item.source === currentClient
        ? 'This app'
        : item.source === 'hub:service'
          ? 'Home Hub'
          : item.source;
    options.set(item.source, { value: item.source, label, description: item.platform });
  }
  return [{ value: ALL, label: 'All sources' }, ...options.values()];
}

function LogListFooter({ logs }: { readonly logs: ReturnType<typeof useRuntimeLogs> }): ReactNode {
  const more = (): void => {
    if (!logs.isFetching) {
      background(logs.fetchNextPage({ cancelRefetch: false }), 'runtime_logs.next_page_failed');
    }
  };
  if (logs.isFetchNextPageError) return <ErrorState error={logs.error} retry={more} />;
  if (!logs.hasNextPage) return null;
  return (
    <View className="items-start px-3 py-2">
      <Button
        label="Load older logs"
        variant="tonal"
        icon="chevronDown"
        onPress={more}
        loading={logs.isFetchingNextPage}
        disabled={logs.isFetching}
      />
    </View>
  );
}

function LogList({ logs }: { readonly logs: ReturnType<typeof useRuntimeLogs> }): ReactNode {
  const [open, setOpen] = useState<number | null>(null);
  const refresh = (): void => {
    background(logs.refetch(), 'runtime_logs.refresh_failed');
  };
  if (logs.isPending) return <Skeleton shape="block" />;
  if (logs.isError && logs.data === undefined)
    return <ErrorState error={logs.error} retry={refresh} />;
  const entries = logs.data.pages.flatMap((page) => page.rows);
  return (
    <View className="min-h-0 flex-1 overflow-hidden rounded-md border border-outline-variant bg-surface-1">
      <FlashList
        data={entries}
        extraData={open}
        keyExtractor={(entry) => String(entry.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <RuntimeLogEntry
            record={item}
            open={open === item.id}
            onToggle={() => {
              setOpen(open === item.id ? null : item.id);
            }}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="terminal"
            title="No matching logs"
            body="Try another search, level or source."
            compact
          />
        }
        ListFooterComponent={<LogListFooter logs={logs} />}
      />
    </View>
  );
}

function refreshAction(
  logs: ReturnType<typeof useRuntimeLogs>,
  sources: ReturnType<typeof useRuntimeLogSources>,
): { readonly icon: 'refresh'; readonly label: string; readonly onPress: () => void } {
  return {
    icon: 'refresh',
    label: 'Refresh logs',
    onPress: (): void => {
      background(Promise.all([logs.refetch(), sources.refetch()]), 'runtime_logs.refresh_failed');
    },
  };
}

interface LogFilterBarProps {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly level: Level;
  readonly onLevelChange: (value: Level) => void;
  readonly source: string;
  readonly onSourceChange: (value: string) => void;
  readonly sources: readonly SelectOption<string>[];
}

function LogFilterBar(props: LogFilterBarProps): ReactNode {
  return (
    <View className="w-full max-w-detail flex-row flex-wrap gap-2">
      <View className="min-w-0 grow basis-64">
        <SearchField value={props.query} onChange={props.onQueryChange} placeholder="Search logs" />
      </View>
      <View className="min-w-0 grow basis-64 flex-row gap-2">
        <View className="min-w-0 flex-1">
          <Select
            label="Level"
            options={LEVELS}
            value={props.level}
            onChange={props.onLevelChange}
            showLabel={false}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Select
            label="Source"
            options={props.sources}
            value={props.source}
            onChange={props.onSourceChange}
            showLabel={false}
            searchable
          />
        </View>
      </View>
    </View>
  );
}

function OwnerLogs(): ReactNode {
  const { client } = useSession();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<Level>(ALL);
  const [source, setSource] = useState<string>(ALL);
  const text = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  const logs = useRuntimeLogs({ text, level, source: source === ALL ? null : source });
  const sources = useRuntimeLogSources();
  return (
    <SettingsFrame page={PAGE} scroll={false} actions={[refreshAction(logs, sources)]}>
      <View className="w-full flex-1 gap-2 px-gutter pb-section-gap">
        <LogFilterBar
          query={query}
          onQueryChange={(value) => {
            setQuery(value.slice(0, RUNTIME_LOG_SEARCH_MAX));
          }}
          level={level}
          onLevelChange={setLevel}
          source={source}
          onSourceChange={setSource}
          sources={sourceOptions(sources.data?.sources ?? [], `app:${client.id}`)}
        />
        {sources.isError ? (
          <ErrorState
            error={sources.error}
            retry={() => {
              background(sources.refetch(), 'runtime_logs.sources_failed');
            }}
          />
        ) : null}
        <LogList logs={logs} />
      </View>
    </SettingsFrame>
  );
}

export function RuntimeLogsScreen(): ReactNode {
  const owner = useIsOwner();
  const developer = useDeveloperOn();
  if (!owner) return <Redirect href={href.settings.index()} />;
  return developer ? (
    <OwnerLogs />
  ) : (
    <SettingsFrame page={PAGE}>
      <EmptyState
        icon="terminal"
        title="Runtime logs unavailable"
        body="Turn on Developer mode to read runtime logs."
      />
    </SettingsFrame>
  );
}
