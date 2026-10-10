import type { ReactNode } from 'react';
import type { FirewallStatus } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useStoreSelector } from '../../../store/store-context';
import { OPENING_LOOK, REACH_LOOK, openingTitle, ruleText } from '../model/firewall';

const PURPOSE_ICON = { webrtc: 'film', camera: 'camera', device: 'wifi' } as const;

function useDeviceName(): (id: string) => string | null {
  const byId = useStoreSelector((state) => state.tables.devices.byId);
  return (id) => byId[id]?.label ?? null;
}

export function OpeningsList({ firewall }: { readonly firewall: FirewallStatus }): ReactNode {
  const nameOf = useDeviceName();
  if (firewall.openings.length === 0) {
    return null;
  }
  return (
    <List inset title="Needed openings">
      {firewall.openings.map((opening) => {
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
