import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List, Section } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { sameJson } from '../../../store/same-json';
import type { Device } from '../../../store/state';
import { CardGrid } from '../components/card-grid';
import { useComputerSelect } from '../data/computer-metrics';
import { AdapterCard } from './adapter-card';
import { ADAPTER_ICON, adapterGroups, adapterState } from './network-model';

export function Adapters({ device }: { readonly device: Device }): ReactNode {
  const groups = useComputerSelect(
    device.id,
    (parts) => (parts.network === undefined ? null : adapterGroups(parts.network.interfaces)),
    sameJson,
  );
  if (groups === null) return <Skeleton shape="block" className="h-40" />;
  if (groups.connected.length === 0 && groups.idle.length === 0) {
    return (
      <EmptyState
        icon="wifi"
        title="No network adapters"
        body={`${device.label} reports no network connections.`}
      />
    );
  }
  return (
    <>
      {groups.connected.length === 0 ? null : (
        <Section title="Adapters">
          <CardGrid
            items={groups.connected}
            keyOf={(adapter) => adapter.name}
            render={(adapter) => (
              <AdapterCard
                deviceId={device.id}
                name={adapter.name}
                title={adapter.title}
                offline={!device.online}
              />
            )}
          />
        </Section>
      )}
      {groups.idle.length === 0 ? null : (
        <List title="Not connected">
          {groups.idle.map((adapter) => (
            <ListRow
              key={adapter.name}
              title={adapter.title}
              subtitle={adapter.name}
              icon={ADAPTER_ICON[adapter.kind]}
              value={adapterState(adapter.state).word}
            />
          ))}
        </List>
      )}
    </>
  );
}
