import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ruleText, type FirewallStatus, type LowPorts } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useStoreSelector } from '../../../store/store-context';
import { OPENING_LOOK, REACH_LOOK, openingTitle } from '../model/firewall';
import { SERVER_PANEL, ServerPanels } from './server-panels';

const PURPOSE_ICON = {
  webrtc: 'film',
  camera: 'camera',
  device: 'wifi',
  plugin: 'puzzle',
  hub: 'server',
  discovery: 'wifi',
  announcement: 'wifi',
} as const;

function useDeviceName(): (id: string) => string | null {
  const byId = useStoreSelector((state) => state.tables.devices.byId);
  return (id) => byId[id]?.label ?? null;
}

function usePluginName(): (id: string) => string | null {
  const byId = useStoreSelector((state) => state.tables.plugins.byId);
  return (id) => byId[id]?.manifest.name ?? null;
}

function LowPortsRow({
  lowPorts,
  wrapDetails,
}: {
  readonly lowPorts: LowPorts;
  readonly wrapDetails: boolean;
}): ReactNode {
  const look = OPENING_LOOK[lowPorts.state];
  return (
    <ListRow
      icon="lock"
      title="Low ports"
      subtitle={`Every program on this computer may listen on ports from ${String(lowPorts.start)} up`}
      wrapSubtitle={wrapDetails}
      trailing={<Badge label={look.label} tone={look.tone} />}
    />
  );
}

function WaitingDeviceRows({
  unlearned,
  wrapDetails,
}: {
  readonly unlearned: FirewallStatus['unlearned'];
  readonly wrapDetails: boolean;
}): ReactNode {
  const nameOf = useDeviceName();
  return unlearned
    .filter((device) => device.purpose !== 'camera')
    .map((device) => (
      <ListRow
        key={device.deviceId}
        icon={PURPOSE_ICON[device.purpose]}
        title={`${nameOf(device.deviceId) ?? device.address} updates`}
        wrapTitle={wrapDetails}
        subtitle={`MAC address not learned yet · now at ${device.address}`}
        wrapSubtitle={wrapDetails}
        trailing={<Badge label="Waiting" tone="neutral" />}
      />
    ));
}

interface FirewallListProps {
  readonly firewall: FirewallStatus;
  readonly className?: string;
  readonly wrapDetails?: boolean;
}

function hasOpenings(firewall: FirewallStatus): boolean {
  return (
    firewall.openings.length > 0 || firewall.unlearned.length > 0 || firewall.lowPorts !== null
  );
}

export function OpeningsList({
  firewall,
  className = '',
  wrapDetails = false,
}: FirewallListProps): ReactNode {
  const nameOf = useDeviceName();
  const pluginName = usePluginName();
  if (!hasOpenings(firewall)) return null;
  return (
    <List inset title="Needed openings" className={className}>
      {firewall.openings.map((opening) => {
        const deviceNames = opening.deviceIds
          .map(nameOf)
          .filter((name): name is string => name !== null);
        const names =
          deviceNames.length > 0
            ? deviceNames
            : opening.pluginIds.map(pluginName).filter((name): name is string => name !== null);
        const look = OPENING_LOOK[opening.state];
        return (
          <ListRow
            key={opening.id}
            icon={PURPOSE_ICON[opening.rule.purpose]}
            title={openingTitle(opening, names)}
            wrapTitle={wrapDetails}
            subtitle={ruleText(opening.rule)}
            wrapSubtitle={wrapDetails}
            trailing={<Badge label={look.label} tone={look.tone} />}
          />
        );
      })}
      <WaitingDeviceRows unlearned={firewall.unlearned} wrapDetails={wrapDetails} />
      {firewall.lowPorts === null ? null : (
        <LowPortsRow lowPorts={firewall.lowPorts} wrapDetails={wrapDetails} />
      )}
    </List>
  );
}

export function CamerasList({
  firewall,
  className = '',
  wrapDetails = false,
}: FirewallListProps): ReactNode {
  const nameOf = useDeviceName();
  if (firewall.cameras.length === 0) return null;
  return (
    <List inset title="Cameras" className={className}>
      {firewall.cameras.map((camera) => {
        const look = REACH_LOOK[camera.state];
        return (
          <ListRow
            key={camera.deviceId}
            icon="camera"
            title={nameOf(camera.deviceId) ?? camera.address}
            wrapTitle={wrapDetails}
            subtitle={
              camera.mac === null
                ? `MAC address not learned yet · now at ${camera.address}`
                : `${camera.mac} · now at ${camera.address}`
            }
            wrapSubtitle={wrapDetails}
            trailing={<Badge label={look.label} tone={look.tone} />}
          />
        );
      })}
    </List>
  );
}

export function FirewallLists({ firewall }: { readonly firewall: FirewallStatus }): ReactNode {
  const openings = hasOpenings(firewall) ? (
    <OpeningsList firewall={firewall} className={SERVER_PANEL} wrapDetails />
  ) : null;
  const cameras =
    firewall.cameras.length === 0 ? null : (
      <CamerasList firewall={firewall} className={SERVER_PANEL} wrapDetails />
    );
  if (openings === null || cameras === null) return openings ?? cameras;
  return (
    <View className="min-w-0 grow shrink basis-(--container-reading)">
      <ServerPanels>
        {openings}
        {cameras}
      </ServerPanels>
    </View>
  );
}
