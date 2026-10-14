import { useIsOwner } from '../../store/selectors';
import { Text } from '../../components/text';
import { ResourceReload } from './resource-reload';
import { PresenceResourceRefresh } from './resource-refresh';
import { ManagementActions } from './management-actions';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyPresenceDevice, ShellyPresencePage } from '@smarteverything/domain';
import { ScheduleSettings, WebhookSettings } from './resource-settings';
import { ScriptSettings } from './script-settings';
import { StoredValues } from './stored-values';
import { ResourceLoader, readPresenceResource, type PresenceResource } from './resource-loader';

export function resourceForPage(page: ShellyPresencePage): PresenceResource | null {
  if (page === 'presence-schedules') return 'schedules';
  if (page === 'presence-actions') return 'webhooks';
  if (page === 'presence-scripts') return 'scripts';
  return page === 'presence-storage' ? 'storedValues' : null;
}

export function ResourcePage({
  sensor,
  resource,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly resource: PresenceResource;
}): ReactNode {
  const owner = useIsOwner();
  const [accepted, setAccepted] = useState<ShellyPresenceDevice | null>(null);
  const refresh = async (): Promise<void> => {
    setAccepted(await readPresenceResource(sensor.externalId, resource));
  };
  const shown = ownerResourceSensor(sensor, accepted, resource);
  const renderers = {
    schedules: ScheduleSettings,
    webhooks: WebhookSettings,
    scripts: ScriptSettings,
    storedValues: StoredValues,
  };
  const Renderer = renderers[resource];
  if (!owner && (resource === 'storedValues' || resource === 'scripts'))
    return <Text tone="variant">The home owner can read stored values and script source.</Text>;
  return (
    <PresenceResourceRefresh value={refresh}>
      <View className="gap-section-gap">
        <ResourceLoader sensor={sensor} resource={resource} accept={setAccepted} />
        <ResourceReload />
        <Renderer sensor={shown} />
        {resource === 'storedValues' ? (
          <ManagementActions sensor={sensor} page="presence-storage" />
        ) : null}
      </View>
    </PresenceResourceRefresh>
  );
}

function ownerResourceSensor(
  sensor: ShellyPresenceDevice,
  accepted: ShellyPresenceDevice | null,
  resource: PresenceResource,
): ShellyPresenceDevice {
  const storedValues = accepted?.resources?.storedValues;
  if (resource !== 'storedValues' || storedValues === undefined) return sensor;
  return { ...sensor, resources: { ...sensor.resources, storedValues } };
}
