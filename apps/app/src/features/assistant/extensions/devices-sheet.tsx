import { assetProviderName } from './items';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  harnessTargetKey,
  type AiHarnessConfigurationHostStatus,
  type AiHarnessConfigurationCatalogue,
  type HarnessExtensionItem,
} from '@smarteverything/domain';
import { Sheet } from '../../../components/sheet';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { VirtualList } from '../../../components/virtual-list';
import { Text } from '../../../components/text';
import { useHarnessCatalogue } from '../data/harness';
import { deviceStatus, hostDescription } from './status';
import { entryId } from './selection';

function DeviceReport({
  host,
  item,
}: {
  readonly host: AiHarnessConfigurationHostStatus;
  readonly item: HarnessExtensionItem | undefined;
}): ReactNode {
  const report = host.report;
  const entry =
    item === undefined ? undefined : report?.readiness.find((row) => row.id === entryId(item));
  if (report === null)
    return (
      <Text variant="callout" tone="variant">
        No status received from this device yet.
      </Text>
    );
  return (
    <View className="gap-1 px-4 pb-3">
      <Text variant="callout" tone="variant">
        {host.freshness === 'current' ? 'Applied status' : 'Last known status'} · received{' '}
        {new Date(report.received_at).toLocaleString()}
      </Text>
      {entry === undefined ? null : (
        <>
          <Text variant="callout">
            Requested version {entry.requestedVersion} · installed{' '}
            {entry.installedVersion ?? 'not reported'}
          </Text>
          <Text variant="callout" tone="variant">
            Currently {entry.state === 'disabled' ? 'off' : entry.state}
          </Text>
          {entry.reason === null ? null : (
            <Text variant="callout" tone="warning">
              {entry.reason}
            </Text>
          )}
        </>
      )}
      {report.pending_revision === undefined ? null : (
        <Text variant="callout" tone="variant">
          The saved choice applies after current sessions finish.
        </Text>
      )}
    </View>
  );
}

function DeviceRow({
  host,
  item,
  expanded,
  onPress,
}: {
  readonly host: AiHarnessConfigurationHostStatus;
  readonly item: HarnessExtensionItem | undefined;
  readonly expanded: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const inventory = useHarnessCatalogue();
  const description = hostDescription(host, inventory.data);
  const status = deviceStatus(host, item);
  return (
    <View>
      <ListRow
        icon="monitor"
        title={description.name}
        subtitle={`${description.platform} · ${status.title}`}
        subtitleTone={status.tone}
        wrapSubtitle
        label={`${description.name}, ${status.title}`}
        chevron
        onPress={onPress}
      />
      {expanded ? <DeviceReport host={host} item={item} /> : null}
    </View>
  );
}

export function ExtensionDevicesSheet({
  open,
  onClose,
  configuration,
  item,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly configuration: AiHarnessConfigurationCatalogue;
  readonly item?: HarnessExtensionItem;
}): ReactNode {
  const inventory = useHarnessCatalogue();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const hosts = configuration.hosts.filter((host) =>
    hostDescription(host, inventory.data).name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item === undefined ? 'Devices' : `${item.name} on your devices`}
      scroll={false}
    >
      <View className="min-h-0 flex-1 gap-3">
        <DevicesHeader
          searchable={configuration.hosts.length > 8}
          query={query}
          setQuery={setQuery}
          item={item}
        />
        <DevicesList hosts={hosts} item={item} expanded={expanded} setExpanded={setExpanded} />
      </View>
    </Sheet>
  );
}

function DevicesHeader({
  searchable,
  query,
  setQuery,
  item,
}: {
  readonly searchable: boolean;
  readonly query: string;
  readonly setQuery: (value: string) => void;
  readonly item: HarnessExtensionItem | undefined;
}): ReactNode {
  return (
    <>
      {searchable ? (
        <SearchField value={query} onChange={setQuery} placeholder="Search devices" />
      ) : null}
      {item?.selection.kind === 'skill_asset' ? (
        <Text variant="footnote" tone="variant">
          Status is for {assetProviderName(item.selection.parent_id)}. Individual asset readiness is
          not reported.
        </Text>
      ) : null}
    </>
  );
}

function DevicesList({
  hosts,
  item,
  expanded,
  setExpanded,
}: {
  readonly hosts: readonly AiHarnessConfigurationHostStatus[];
  readonly item: HarnessExtensionItem | undefined;
  readonly expanded: string | null;
  readonly setExpanded: (value: string | null) => void;
}): ReactNode {
  return (
    <VirtualList
      sections={[{ key: 'devices', title: '', data: hosts }]}
      keyOf={(host) => harnessTargetKey(host.target)}
      empty={<Text tone="variant">No device status is available.</Text>}
      renderItem={(host) => {
        const key = harnessTargetKey(host.target);
        return (
          <DeviceRow
            host={host}
            item={item}
            expanded={expanded === key}
            onPress={() => {
              setExpanded(expanded === key ? null : key);
            }}
          />
        );
      }}
    />
  );
}
