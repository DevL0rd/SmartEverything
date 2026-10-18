import { type ReactNode } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { HarnessDiscoveryItem } from '@smarteverything/domain';
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
import { ExtensionReadStatus, useMemberBanner } from './query-status';
import { useSkillInspection } from './inspection';
import { useDiscovery, discoveryItemKey } from './discovery';
import { discoveryHref } from './links';
import { background } from '@smarteverything/logging';

const SEARCH_DELAY_MS = 250;
const PARAMS = z.object({
  search: z.string().max(200).optional(),
  browsePage: z.coerce.number().int().min(1).max(1000).optional(),
  source: z.string().optional(),
});
type DiscoveryQuery = ReturnType<typeof useDiscovery>;
function DiscoveryError({
  discovery,
  label,
}: {
  readonly discovery: DiscoveryQuery;
  readonly label: string;
}): ReactNode {
  const error = discovery.error;
  if (error === null) return null;
  const page = discovery.data?.selection.page;
  return (
    <Banner
      tone={page === undefined ? 'critical' : 'warning'}
      title={
        page === undefined
          ? `Couldn’t load ${label}`
          : `Couldn’t load the requested page · showing page ${String(page)}`
      }
      body={friendlyError(error) ?? error.message}
      action={{
        label: 'Try again',
        onPress: () => {
          background(discovery.refetch(), 'discovery.refetch_failed');
        },
      }}
      wrapBody
    />
  );
}
function DiscoveryStatus({
  discovery,
  kind,
}: {
  readonly discovery: DiscoveryQuery;
  readonly kind: 'skill' | 'extension';
}): ReactNode {
  const label = kind === 'skill' ? 'Anthropic skills' : 'Official plugins and community extensions';
  if (discovery.error !== null) return <DiscoveryError discovery={discovery} label={label} />;
  return discovery.isFetching && discovery.data !== undefined ? (
    <ActivityIndicator colorClassName="accent-primary" accessibilityLabel={`Loading ${label}`} />
  ) : null;
}
function ImportRow({
  kind,
  onImport,
}: {
  readonly kind: 'skill' | 'extension';
  readonly onImport: () => void;
}): ReactNode {
  const owner = useIsOwner();
  const live = useSyncStatus().status === 'live';
  if (kind !== 'skill' || !owner) return null;
  return (
    <NavRow
      icon="link"
      title="From a skill link"
      subtitle={live ? 'Add skills from a git link or marketplace' : 'Needs your home hub'}
      disabled={!live}
      onPress={onImport}
    />
  );
}
function BrowseHeader({
  kind,
  query,
  setQuery,
  discovery,
  onImport,
}: {
  readonly kind: 'skill' | 'extension';
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly discovery: DiscoveryQuery;
  readonly onImport: () => void;
}): ReactNode {
  return (
    <View className="gap-3 px-gutter pb-3">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={kind === 'skill' ? 'Search skills' : 'Search extensions'}
        variant="field"
      />
      <Text variant="caption" tone="variant">
        {kind === 'skill' ? 'Anthropic skills' : 'Official plugins and community extensions'}
      </Text>
      <ExtensionReadStatus
        kind={kind}
        loading={discovery.data === undefined ? discovery.isFetching : false}
        error={null}
        retry={() => {
          background(discovery.refetch(), 'discovery.refetch_failed');
        }}
      />
      <DiscoveryStatus discovery={discovery} kind={kind} />
      <ImportRow kind={kind} onImport={onImport} />
    </View>
  );
}
function BrowseRow({
  item,
  source,
}: {
  readonly item: HarnessDiscoveryItem;
  readonly source: string | undefined;
}): ReactNode {
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
      caption={item.publisher}
      {...(present ? { value: 'Installed' } : {})}
      onPress={() => {
        client.setQueryData(discoveryItemKey(item.id, source), item);
        router.push(discoveryHref(item, source));
      }}
    />
  );
}
function BrowsePagination({
  discovery,
  move,
}: {
  readonly discovery: DiscoveryQuery;
  readonly move: (page: number) => void;
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
          move(result.selection.page - 1);
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
          if (result.catalogue.next_page !== null) move(result.catalogue.next_page);
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
  const { query, discovery, changeQuery, move } = useBrowse(kind);
  const inspection = useSkillInspection(kind);
  const banner = useMemberBanner(kind === 'skill' ? 'add skills' : 'add extensions');
  return (
    <SettingsFrame
      page={kind === 'skill' ? 'assistant/skills/add' : 'assistant/extensions/add'}
      scroll={false}
      {...(banner === undefined ? {} : { banner })}
    >
      <VirtualList
        header={
          <BrowseHeader
            kind={kind}
            query={query}
            setQuery={changeQuery}
            discovery={discovery}
            onImport={inspection.open}
          />
        }
        sections={[{ key: 'online', title: '', data: discovery.data?.catalogue.items ?? [] }]}
        keyOf={(item) => item.id}
        renderItem={(item) => <BrowseRow item={item} source={discovery.data?.selection.source} />}
        footer={<BrowsePagination discovery={discovery} move={move} />}
        empty={
          <BrowseEmpty
            kind={kind}
            discovery={discovery}
            query={query.trim()}
            clear={() => {
              changeQuery('');
            }}
          />
        }
      />
      <TextEditSheet request={inspection.request} onClose={inspection.close} />
    </SettingsFrame>
  );
}

function BrowseEmpty({
  kind,
  discovery,
  query,
  clear,
}: {
  readonly kind: 'skill' | 'extension';
  readonly discovery: DiscoveryQuery;
  readonly query: string;
  readonly clear: () => void;
}): ReactNode {
  if (discovery.isFetching || discovery.error !== null || discovery.data === undefined) return null;
  const noun = kind === 'skill' ? 'skills' : 'extensions';
  return query === '' ? (
    <EmptyState
      icon={kind === 'skill' ? 'fileText' : 'puzzle'}
      title={`No ${noun} in the catalogue`}
      body="The catalogue has nothing to show right now. Check again later."
    />
  ) : (
    <EmptyState
      icon="search"
      title={`No ${noun} match “${query}”`}
      body="Search by name, description or publisher."
      action={<Button label="Clear search" variant="text" onPress={clear} />}
    />
  );
}
function useBrowse(kind: 'skill' | 'extension'): {
  readonly query: string;
  readonly discovery: DiscoveryQuery;
  readonly changeQuery: (value: string) => void;
  readonly move: (page: number) => void;
} {
  const params = PARAMS.parse(useLocalSearchParams());
  const router = useRouter();
  const query = params.search ?? '';
  const settled = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  const selection = {
    kind,
    query: settled,
    page: params.browsePage ?? 1,
    ...(params.source === undefined ? {} : { source: params.source }),
  };
  const discovery = useDiscovery(selection);
  return {
    query,
    discovery,
    changeQuery: (value): void => {
      router.setParams({ search: value.slice(0, 200), browsePage: '1' });
    },
    move: (page): void => {
      router.setParams({ browsePage: String(page) });
    },
  };
}
