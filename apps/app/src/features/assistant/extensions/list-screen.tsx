import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { SettingsFrame } from '../../../settings/settings-frame';
import { List } from '../../../components/section';
import { NavRow } from '../../../components/rows';
import { VirtualList, type VirtualSection } from '../../../components/virtual-list';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { Button } from '../../../components/button';
import { useExtensions, useExtensionConfiguration } from './queries';
import { ExtensionReadStatus, useMemberBanner } from './query-status';
import { pageKind } from './items';
import {
  catalogueItemIcon,
  catalogueItemHref,
  matchesCatalogueItem,
  type CatalogueItem,
} from './catalogue-items';
import { extensionBrowseHref } from './links';
import { EmptyState } from '../../../components/empty-state';
import { devicesSummary, itemSummary } from './status';
import { ExtensionDevicesSheet } from './devices-sheet';
import { ClaudeCollectionControl } from './collection-control';
import { background } from '@smarteverything/logging';

type ConfigurationQuery = ReturnType<typeof useExtensionConfiguration>;

function InstalledHeader({
  configuration,
  catalogue,
  onDevices,
  query,
  setQuery,
  searchable,
  kind,
}: {
  readonly configuration: ConfigurationQuery;
  readonly catalogue: ReturnType<typeof useExtensions>;
  readonly onDevices: () => void;
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly searchable: boolean;
  readonly kind: 'extension' | 'skill';
}): ReactNode {
  return (
    <View className="gap-section-gap px-gutter">
      <ExtensionReadStatus
        kind={kind}
        loading={configuration.isFetching ? configuration.data === undefined : false}
        error={configuration.error ?? catalogue.error}
        retry={() => {
          background(configuration.refetch(), 'configuration.refetch_failed');
          background(catalogue.refetch(), 'catalogue.refetch_failed');
        }}
      />
      <Text variant="callout" tone="variant">
        {kind === 'skill'
          ? (catalogue.data?.bundled_skills?.length ?? 0) > 0
            ? 'Included skills guide SmartEverything through useful tasks. Add shared skills for compatible workspaces.'
            : 'Update the hub to see included skills. Workspace skills are below.'
          : 'Choose once for your compatible devices. File access and sign-ins stay on each device.'}
      </Text>
      <ClaudeCollectionControl kind={kind} />
      <DeviceLink configuration={configuration} onDevices={onDevices} />
      {searchable ? (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={kind === 'skill' ? 'Search skills' : 'Search added extensions'}
          variant="field"
        />
      ) : null}
    </View>
  );
}

function InstalledFooter({ kind }: { readonly kind: 'extension' | 'skill' }): ReactNode {
  return (
    <View className="px-gutter pt-3">
      <List inset>
        <NavRow
          icon="plus"
          title={kind === 'skill' ? 'Browse skills' : 'Browse extensions'}
          href={extensionBrowseHref(kind)}
        />
        {kind === 'skill' ? (
          <NavRow
            icon="refresh"
            title="Updates"
            href={{
              pathname: '/settings/[...page]',
              params: { page: ['assistant', 'skills', 'updates'] },
            }}
          />
        ) : null}
      </List>
    </View>
  );
}

function sectionsOf(items: readonly CatalogueItem[]): readonly VirtualSection<CatalogueItem>[] {
  return [
    {
      key: 'included',
      title: 'Included',
      data: items.filter(
        (item) => item.kind === 'bundled_skill' || item.source.kind === 'included',
      ),
    },
    {
      key: 'added',
      title: 'Added',
      data: items.filter(
        (item) => item.kind !== 'bundled_skill' && item.source.kind !== 'included',
      ),
    },
  ].filter((section) => section.data.length > 0);
}

function InstalledList({ kind }: { readonly kind: 'extension' | 'skill' }): ReactNode {
  const configuration = useExtensionConfiguration();
  const catalogue = useExtensions();
  const params = z.object({ section: z.string().optional() }).parse(useLocalSearchParams());
  const [devices, setDevices] = useState(params.section === 'devices');
  const [query, setQuery] = useState('');
  const items = useInstalledItems(kind);
  return (
    <>
      <VirtualList
        header={
          <InstalledHeader
            configuration={configuration}
            catalogue={catalogue}
            onDevices={() => {
              setDevices(true);
            }}
            query={query}
            setQuery={setQuery}
            searchable={items.length > 8}
            kind={kind}
          />
        }
        sections={sectionsOf(items.filter((item) => matchesCatalogueItem(item, query)))}
        keyOf={(item) => item.id}
        renderItem={(item) => <InstalledRow item={item} />}
        footer={<InstalledFooter kind={kind} />}
        empty={
          <CatalogueEmpty
            kind={kind}
            query={query}
            clear={() => {
              setQuery('');
            }}
          />
        }
      />
      {configuration.data === undefined ? null : (
        <ExtensionDevicesSheet
          open={devices}
          onClose={() => {
            setDevices(false);
          }}
          configuration={configuration.data}
        />
      )}
    </>
  );
}

export function AiExtensionsScreen({
  kind = 'extension',
}: {
  readonly kind?: 'extension' | 'skill';
}): ReactNode {
  const banner = useMemberBanner(
    kind === 'skill' ? 'add, update or remove skills' : 'add, update or remove extensions',
  );
  return (
    <SettingsFrame
      page={kind === 'skill' ? 'assistant/skills' : 'assistant/extensions'}
      scroll={false}
      {...(banner === undefined ? {} : { banner })}
    >
      <InstalledList kind={kind} />
    </SettingsFrame>
  );
}

function useInstalledItems(kind: 'extension' | 'skill'): readonly CatalogueItem[] {
  const catalogue = useExtensions().data;
  const installed = (catalogue?.items ?? []).filter((item) => pageKind(item) === kind);
  return kind === 'skill' ? [...(catalogue?.bundled_skills ?? []), ...installed] : installed;
}

function InstalledRow({ item }: { readonly item: CatalogueItem }): ReactNode {
  const configuration = useExtensionConfiguration().data;
  return (
    <NavRow
      icon={catalogueItemIcon(item)}
      title={item.name}
      subtitle={
        item.kind === 'bundled_skill'
          ? `${item.description}\nIncluded in SmartEverything`
          : configuration === undefined
            ? item.description
            : itemSummary(item, configuration)
      }
      wrapSubtitle
      href={catalogueItemHref(item)}
    />
  );
}

function DeviceLink({
  configuration,
  onDevices,
}: {
  readonly configuration: ConfigurationQuery;
  readonly onDevices: () => void;
}): ReactNode {
  return (
    <List inset>
      <NavRow
        icon="monitor"
        title="Devices"
        subtitle={
          configuration.data === undefined
            ? 'Waiting for device status'
            : devicesSummary(configuration.data.hosts)
        }
        onPress={onDevices}
      />
    </List>
  );
}

function CatalogueEmpty({
  kind,
  query,
  clear,
}: {
  readonly kind: 'extension' | 'skill';
  readonly query: string;
  readonly clear: () => void;
}): ReactNode {
  const catalogue = useExtensions();
  const noun = kind === 'skill' ? 'skills' : 'extensions';
  if (query !== '')
    return (
      <EmptyState
        icon="search"
        title={`No ${noun} match “${query}”`}
        body="Try a different word."
        action={<Button label="Clear search" variant="text" onPress={clear} />}
      />
    );
  if (catalogue.data === undefined) return null;
  return (
    <EmptyState
      icon={kind === 'skill' ? 'fileText' : 'puzzle'}
      title={`No ${noun} yet`}
      body="Extensions and skills add tools to the assistant. Browse the catalogue to add one."
      action={<Button label={`Browse ${noun}`} variant="tonal" href={extensionBrowseHref(kind)} />}
    />
  );
}
