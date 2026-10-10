import type { ReactNode } from 'react';
import type { FirewallStatus, LowPorts } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useStoreSelector } from '../../../store/store-context';
import { OPENING_LOOK, REACH_LOOK, openingTitle, ruleText } from '../model/firewall';

const PURPOSE_ICON = {
  webrtc: 'film',
  camera: 'camera',
  device: 'wifi',
  plugin: 'puzzle',
} as const;

function useDeviceName(): (id: string) => string | null {
  const byId = useStoreSelector((state) => state.tables.devices.byId);
  return (id) => byId[id]?.label ?? null;
}

function usePluginName(): (id: string) => string | null {
  const byId = useStoreSelector((state) => state.tables.plugins.byId);
  return (id) => byId[id]?.manifest.name ?? null;
}

function LowPortsRow({ lowPorts }: { readonly lowPorts: LowPorts }): ReactNode {
  const look = OPENING_LOOK[lowPorts.state];
  return (
    <ListRow
      icon="lock"
      title="Low ports"
      subtitle={`Every program on this computer may listen on ports from ${String(lowPorts.start)} up`}
      trailing={<Badge label={look.label} tone={look.tone} />}
    />
  );
}

export function OpeningsList({ firewall }: { readonly firewall: FirewallStatus }): ReactNode {
  const nameOf = useDeviceName();
  const pluginName = usePluginName();
  if (firewall.openings.length === 0 && firewall.lowPorts === null) {
    return null;
  }
  return (
    <List inset title="Needed openings">
      {firewall.openings.map((opening) => {
        if (opening.rule.purpose === 'plugin') {
          const plugins = opening.pluginIds
            .map(pluginName)
            .filter((name): name is string => name !== null);
          const look = OPENING_LOOK[opening.state];
          return (
            <ListRow
              key={opening.id}
              icon="puzzle"
              title={openingTitle(opening, plugins)}
              subtitle={ruleText(opening.rule)}
              trailing={<Badge label={look.label} tone={look.tone} />}
            />
          );
        }
        const owners =
          opening.deviceIds.length > 0
            ? opening.deviceIds
            : firewall.cameras
                .filter(
                  (camera) =>
                    opening.rule.purpose === 'camera' && camera.address === opening.rule.source,
                )
                .map((camera) => camera.deviceId);
        const names = owners.map(nameOf).filter((name): name is string => name !== null);
        const look = OPENING_LOOK[opening.state];
        return (
          <ListRow
            key={opening.id}
            icon={PURPOSE_ICON[opening.rule.purpose]}
            title={openingTitle(opening, names)}
            subtitle={ruleText(opening.rule)}
            trailing={<Badge label={look.label} tone={look.tone} />}
          />
        );
      })}
      {firewall.lowPorts === null ? null : <LowPortsRow lowPorts={firewall.lowPorts} />}
    </List>
  );
}

export function CamerasList({ firewall }: { readonly firewall: FirewallStatus }): ReactNode {
  const nameOf = useDeviceName();
  if (firewall.cameras.length === 0) {
    return null;
  }
  return (
    <List inset title="Cameras">
      {firewall.cameras.map((camera) => {
        const look = REACH_LOOK[camera.state];
        return (
          <ListRow
            key={camera.deviceId}
            icon="camera"
            title={nameOf(camera.deviceId) ?? camera.address}
            subtitle={camera.address}
            trailing={<Badge label={look.label} tone={look.tone} />}
          />
        );
      })}
    </List>
  );
}
