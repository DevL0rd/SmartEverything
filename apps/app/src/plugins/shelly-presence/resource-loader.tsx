import { useEffect, useState, type ReactNode } from 'react';
import { z } from 'zod';
import {
  SHELLY_PRESENCE_DEVICE,
  SHELLY_PRESENCE_PLUGIN_ID,
  SHELLY_PRESENCE_SNAPSHOT,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import { callPluginTool } from '../../api/plugins';
import { Text } from '../../components/text';

export type PresenceResource = 'schedules' | 'webhooks' | 'scripts' | 'storedValues';
const RESOURCE_RESULT = z.object({
  snapshot: SHELLY_PRESENCE_SNAPSHOT,
  device: SHELLY_PRESENCE_DEVICE,
});

export function ResourceLoader({
  sensor,
  resource,
  accept,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly resource: PresenceResource;
  readonly accept: (device: ShellyPresenceDevice) => void;
}): ReactNode {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    readPresenceResource(sensor.externalId, resource)
      .then((device) => {
        if (active) {
          accept(device);
          setState('ready');
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : String(caught));
          setState('failed');
        }
      });
    return (): void => {
      active = false;
    };
  }, [sensor.externalId, resource, accept]);
  return state === 'ready' ? null : (
    <Text tone={state === 'failed' ? 'critical' : 'variant'}>
      {state === 'loading' ? 'Loading accepted device data…' : error}
    </Text>
  );
}

export async function readPresenceResource(
  externalId: string,
  resource: PresenceResource,
): Promise<ShellyPresenceDevice> {
  const reply = await callPluginTool(SHELLY_PRESENCE_PLUGIN_ID, 'read', { externalId, resource });
  return RESOURCE_RESULT.parse(reply.result).device;
}
