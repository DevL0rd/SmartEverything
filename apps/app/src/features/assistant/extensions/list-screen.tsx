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
import { useIsOwner } from '../../../store/selectors';
import { useExtensions, useExtensionConfiguration } from './queries';
import { ExtensionReadStatus } from './query-status';
import { installedItems } from './items';
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
          void configuration.refetch();
          void catalogue.refetch();
        }}
      />
      <Text variant="callout" tone="variant">
        {kind === 'skill'
          ? (catalogue.data?.bundled_skills?.length ?? 0) > 0
            ? 'Included skills guide SmartEverything through useful tasks. Add shared skills for compatible workspaces.'
            : 'This hub does not list its included skills yet. Imported workspace skills are shown below.'
          : 'Choose once for your compatible devices. File access and sign-ins stay on each device.'}
      </Text>
      <DeviceLink configuration={configuration} onDevices={onDevices} />
      {searchable ? (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={kind === 'skill' ? 'Search skills' : 'Search added extensions'}
        />
      ) : null}
    </View>
  );
}

function InstalledFooter({ kind }: { readonly kind: 'extension' | 'skill' }): ReactNode {
  const owner = useIsOwner();
  return (
    <View className="gap-3 px-gutter pt-3">
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
      {owner ? null : (
        <Text variant="footnote" tone="variant">
          Managed by the home owner
        </Text>
      )}
    </View>
  );
}

function sectionsOf(items: readonly CatalogueItem[]): readonly VirtualSection<CatalogueItem>[] {
  return [
    {
      key: 'included',
      title: 'Included',
      data: items.filter((item) => item.kind === 'bundled_skill' || item.included),
    },
    {
      key: 'added',
      title: 'Added',
      data: items.filter((item) => item.kind !== 'bundled_skill' && !item.included),
    },
  ].filter((section) => section.data.length > 0);
}

export function AiExtensionsScreen({
  kind = 'extension',
}: {
  readonly kind?: 'extension' | 'skill';
}): ReactNode {
  const configuration = useExtensionConfiguration();
  const catalogue = useExtensions();
  const params = z.object({ section: z.string().optional() }).parse(useLocalSearchParams());
  const [devices, setDevices] = useState(params.section === 'devices');
  const [query, setQuery] = useState('');
  const items = useInstalledItems(kind);
  return (
    <SettingsFrame
      page={kind === 'skill' ? 'assistant/skills' : 'assistant/extensions'}
      scroll={false}
    >
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
        empty={<CatalogueEmpty kind={kind} />}
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
    </SettingsFrame>
  );
}

function useInstalledItems(kind: 'extension' | 'skill'): readonly CatalogueItem[] {
  const configuration = useExtensionConfiguration();
  const catalogue = useExtensions();
  const selected =
    configuration.data === undefined
      ? []
      : installedItems(catalogue.data?.items ?? [], configuration.data.desired).filter(
          (item) => item.kind === kind,
        );
  return kind === 'skill' ? [...(catalogue.data?.bundled_skills ?? []), ...selected] : selected;
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

function CatalogueEmpty({ kind }: { readonly kind: 'extension' | 'skill' }): ReactNode {
  const catalogue = useExtensions();
  return (
    <EmptyState
      icon={kind === 'skill' ? 'fileText' : 'puzzle'}
      title={kind === 'skill' ? 'No matching skills' : 'No matching extensions'}
      body={
        catalogue.data === undefined
          ? 'Reconnect or refresh to load the catalogue.'
          : 'Browse the catalogue to add a shared selection.'
      }
    />
  );
}
