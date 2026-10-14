import { type ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, type HarnessDiscoveryItem } from '@smarteverything/domain';
import { SettingsFrame } from '../../../settings/settings-frame';
import { TextEditSheet } from '../../../settings/text-edit-sheet';
import { SearchField } from '../../../components/search-field';
import { NavRow } from '../../../components/rows';
import { VirtualList } from '../../../components/virtual-list';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { friendlyError } from '../../../format/errors';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { useExtensions } from './queries';
import { ExtensionReadStatus } from './query-status';
import { useSkillInspection } from './inspection';
import { useDiscovery, discoveryItemKey } from './discovery';
import { discoveryHref } from './links';

const SEARCH_DELAY_MS = 250;
const PARAMS = z.object({
  search: z.string().max(200).optional(),
  browsePage: z.coerce.number().int().min(1).max(1000).optional(),
  snapshot: z.string().max(200).optional(),
});
type DiscoveryQuery = ReturnType<typeof useDiscovery>;
function DiscoveryStatus({
  discovery,
  kind,
  reset,
}: {
  readonly discovery: DiscoveryQuery;
  readonly kind: 'skill' | 'extension';
  readonly reset: () => void;
}): ReactNode {
  const label = kind === 'skill' ? 'Anthropic skills' : 'Official plugins and community extensions';
  const error = discovery.error;
  if (error !== null)
    return (
      <Banner
        tone="warning"
        title={
          discovery.data === undefined
            ? `Couldn’t load ${label}`
            : `Couldn’t load the requested page · showing page ${String(discovery.data.selection.page)}`
        }
        body={friendlyError(error) ?? error.message}
        action={{
          label: 'Retry',
          onPress: () => {
            if (error instanceof ApiError && error.code === 'conflict') reset();
            else void discovery.refetch();
          },
        }}
        wrapBody
      />
    );
  if (discovery.data?.catalogue.stale === true)
    return (
      <Banner
        tone="warning"
        title="Showing retained catalogue results"
        body={discovery.data.catalogue.warning ?? 'The source could not be refreshed.'}
        wrapBody
      />
    );
  return discovery.isFetching ? (
    <ActivityIndicator colorClassName="accent-primary" accessibilityLabel={`Loading ${label}`} />
  ) : null;
}
function useImportable(kind: 'skill' | 'extension'): boolean {
  const owner = useIsOwner();
  const sync = useSyncStatus();
  const installed = useExtensions();
  return (
    kind === 'skill' &&
    owner &&
    sync.status === 'live' &&
    (installed.data?.import_formats.length ?? 0) > 0
  );
}
function BrowseHeader({
  kind,
  query,
  setQuery,
  discovery,
  onImport,
  reset,
}: {
  readonly kind: 'skill' | 'extension';
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly discovery: DiscoveryQuery;
  readonly onImport: () => void;
  readonly reset: () => void;
}): ReactNode {
  const importable = useImportable(kind);
  return (
    <View className="gap-3 px-gutter pb-3">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={kind === 'skill' ? 'Search skills' : 'Search extensions'}
      />
      <Text variant="caption" tone="variant">
        {kind === 'skill' ? 'Anthropic skills' : 'Official plugins and community extensions'}
      </Text>
      <ExtensionReadStatus
        kind={kind}
        loading={false}
        error={null}
        retry={() => {
          void discovery.refetch();
        }}
      />
      <DiscoveryStatus discovery={discovery} kind={kind} reset={reset} />
      {importable ? (
        <NavRow
          icon="link"
          title="From a skill link"
          subtitle="Inspect a pinned public GitHub skill or JSON bundle"
          onPress={onImport}
        />
      ) : null}
    </View>
  );
}
function BrowseRow({ item }: { readonly item: HarnessDiscoveryItem }): ReactNode {
  const client = useQueryClient();
  const router = useRouter();
  const installed = useExtensions();
  const present =
    item.installed_id !== null &&
    installed.data?.items.some((entry) => entry.id === item.installed_id) === true;
  return (
    <NavRow
      icon={item.kind === 'skill' ? 'fileText' : 'puzzle'}
      title={item.name}
      subtitle={item.description}
      caption={`${item.publisher} · ${item.acquisition.state === 'available' ? 'Available for inspection' : 'Not supported'}`}
      {...(present ? { value: 'Installed' } : {})}
      onPress={() => {
        client.setQueryData(discoveryItemKey(item.id), item);
        router.push(discoveryHref(item));
      }}
    />
  );
}
function BrowsePagination({
  discovery,
  move,
}: {
  readonly discovery: DiscoveryQuery;
  readonly move: (page: number, snapshot: string) => void;
}): ReactNode {
  const result = discovery.data;
  if (result === undefined) return null;
  const disabled = discovery.isFetching || discovery.isPlaceholderData || discovery.error !== null;
  return (
    <View className="flex-row items-center justify-center gap-3 px-gutter pt-3">
      <Button
        label="Previous"
        variant="text"
        disabled={disabled || result.selection.page <= 1}
        onPress={() => {
          move(result.selection.page - 1, result.catalogue.snapshot);
        }}
      />
      <Text variant="caption" tone="variant">
        Page {String(result.selection.page)}
      </Text>
      <Button
        label="Next"
        variant="text"
        disabled={disabled || result.catalogue.next_page === null}
        onPress={() => {
          if (result.catalogue.next_page !== null)
            move(result.catalogue.next_page, result.catalogue.snapshot);
        }}
      />
    </View>
  );
}
export function BrowseAiExtensionsScreen({
  kind = 'extension',
}: {
  readonly kind?: 'extension' | 'skill';
}): ReactNode {
  const { query, discovery, reset, changeQuery, move } = useBrowse(kind);
  const inspection = useSkillInspection();
  return (
    <SettingsFrame
      page={kind === 'skill' ? 'assistant/skills/add' : 'assistant/extensions/add'}
      scroll={false}
    >
      <VirtualList
        header={
          <BrowseHeader
            kind={kind}
            query={query}
            setQuery={changeQuery}
            discovery={discovery}
            onImport={inspection.open}
            reset={reset}
          />
        }
        sections={[{ key: 'online', title: '', data: discovery.data?.catalogue.items ?? [] }]}
        keyOf={(item) => item.id}
        renderItem={(item) => <BrowseRow item={item} />}
        footer={<BrowsePagination discovery={discovery} move={move} />}
        empty={<BrowseEmpty kind={kind} discovery={discovery} />}
      />
      <TextEditSheet request={inspection.request} onClose={inspection.close} />
    </SettingsFrame>
  );
}

function BrowseEmpty({
  kind,
  discovery,
}: {
  readonly kind: 'skill' | 'extension';
  readonly discovery: DiscoveryQuery;
}): ReactNode {
  let title = kind === 'skill' ? 'No matching skills' : 'No matching extensions';
  if (discovery.isFetching) title = 'Loading catalogue…';
  else if (discovery.error !== null) title = 'Catalogue unavailable';
  return (
    <EmptyState
      icon={kind === 'skill' ? 'fileText' : 'puzzle'}
      title={title}
      body="Search by name, description or publisher."
    />
  );
}
function useBrowse(kind: 'skill' | 'extension'): {
  readonly query: string;
  readonly discovery: DiscoveryQuery;
  readonly reset: () => void;
  readonly changeQuery: (value: string) => void;
  readonly move: (page: number, snapshot: string) => void;
} {
  const params = PARAMS.parse(useLocalSearchParams());
  const router = useRouter();
  const query = params.search ?? '';
  const settled = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  const selection = {
    kind,
    query: settled,
    page: params.browsePage ?? 1,
    ...(params.snapshot === undefined || params.snapshot === ''
      ? {}
      : { snapshot: params.snapshot }),
  };
  const discovery = useDiscovery(selection);
  const reset = (): void => {
    router.setParams({ browsePage: '1', snapshot: '' });
  };
  return {
    query,
    discovery,
    reset,
    changeQuery: (value): void => {
      router.setParams({ search: value.slice(0, 200), browsePage: '1', snapshot: '' });
    },
    move: (page, snapshot): void => {
      router.setParams({ browsePage: String(page), snapshot });
    },
  };
}
