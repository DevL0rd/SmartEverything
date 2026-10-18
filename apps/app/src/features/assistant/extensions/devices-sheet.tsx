import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  harnessTargetKey,
  type AiHarnessConfigurationHostStatus,
  type AiHarnessConfigurationCatalogue,
  type HarnessExtensionItem,
} from '@smarteverything/domain';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { TurnChevron } from '../../../components/disclosure';
import { Sheet } from '../../../components/sheet';
import { List } from '../../../components/section';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { Text } from '../../../components/text';
import { useHarnessCatalogue } from '../data/harness';
import { deviceStatus, hostDescription, readinessOf, type ItemScope } from './status';

const SEARCHABLE_FROM = 8;

function DeviceReport({
  host,
  scope,
}: {
  readonly host: AiHarnessConfigurationHostStatus;
  readonly scope: ItemScope | undefined;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const report = host.report;
  const entry = scope === undefined ? undefined : readinessOf(host, scope);
  return (
    <View className={cn('gap-1 pb-3 pr-4', pointer ? 'pl-16' : 'pl-18')}>
      {report === null ? (
        <Text variant="callout" tone="variant">
          No status received from this device yet.
        </Text>
      ) : (
        <>
          <Text variant="callout" tone="variant">
            {host.freshness === 'current' ? 'Applied status' : 'Last known status'} · received{' '}
            {new Date(report.received_at).toLocaleString()}
          </Text>
          {report.pending_revision === undefined ? null : (
            <Text variant="callout" tone="variant">
              The saved choice applies after current sessions finish.
            </Text>
          )}
        </>
      )}
      {entry === undefined ? null : (
        <>
          <Text variant="callout">
            Requested version {entry.requestedVersion} · installed{' '}
            {entry.installedVersion ?? 'not reported'}
          </Text>
          {entry.reason === null ? null : (
            <Text variant="callout" tone="warning">
              {entry.reason}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

function DeviceRow({
  host,
  scope,
  expanded,
  onPress,
}: {
  readonly host: AiHarnessConfigurationHostStatus;
  readonly scope: ItemScope | undefined;
  readonly expanded: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const inventory = useHarnessCatalogue();
  const description = hostDescription(host, inventory.data);
  const status = deviceStatus(host, scope);
  return (
    <View>
      <ListRow
        icon="monitor"
        title={description.name}
        subtitle={`${description.platform} · ${status.title}`}
        subtitleTone={status.tone}
        wrapSubtitle
        label={`${description.name}, ${status.title}`}
        trailing={<TurnChevron open={expanded} />}
        onPress={onPress}
      />
      {expanded ? <DeviceReport host={host} scope={scope} /> : null}
    </View>
  );
}

function DevicesList({
  hosts,
  scope,
}: {
  readonly hosts: readonly AiHarnessConfigurationHostStatus[];
  readonly scope: ItemScope | undefined;
}): ReactNode {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (hosts.length === 0)
    return (
      <Text tone="variant" className="px-4">
        No device status is available.
      </Text>
    );
  return (
    <List inset>
      {hosts.map((host) => {
        const key = harnessTargetKey(host.target);
        return (
          <DeviceRow
            key={key}
            host={host}
            scope={scope}
            expanded={expanded === key}
            onPress={() => {
              setExpanded(expanded === key ? null : key);
            }}
          />
        );
      })}
    </List>
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
  const hosts = configuration.hosts.filter((host) =>
    hostDescription(host, inventory.data).name.toLowerCase().includes(query.toLowerCase()),
  );
  const scope = item === undefined ? undefined : { item, desired: configuration.desired };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item === undefined ? 'Devices' : `${item.name} on your devices`}
      detents={['fit', 'full']}
    >
      <View className="gap-3">
        {configuration.hosts.length > SEARCHABLE_FROM ? (
          <SearchField value={query} onChange={setQuery} placeholder="Search devices" />
        ) : null}
        <DevicesList hosts={hosts} scope={scope} />
      </View>
    </Sheet>
  );
}
