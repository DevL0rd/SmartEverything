import { useScreenQuery } from '../../queries/use-screen-query';
import {
  SHELLY_DEVICE,
  SHELLY_PLUGIN_ID,
  type ShellyDevice,
  type ShellyResources,
} from '@smarteverything/shelly';
import { z } from 'zod';
import { callPluginTool } from '../../api/plugins';
import { PLUGIN_PREFIX } from '../../queries/keys';
import { failure } from './use-presence-operation';
import { background } from '@smarteverything/logging';

export type PresenceResource = 'schedules' | 'webhooks' | 'scripts' | 'storedValues';

const READ_RESULT = z.object({ device: SHELLY_DEVICE });
const NONE: ShellyResources = {};

export interface ResourceState {
  readonly resources: ShellyResources;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

export function usePresenceResource(
  sensor: ShellyDevice,
  resource: PresenceResource,
): ResourceState {
  const query = useScreenQuery({
    queryKey: [...PLUGIN_PREFIX, SHELLY_PLUGIN_ID, 'resource', sensor.externalId, resource],
    queryFn: async (): Promise<ShellyResources> => {
      const reply = await callPluginTool(SHELLY_PLUGIN_ID, 'read', {
        externalId: sensor.externalId,
        resource,
      });
      return READ_RESULT.parse(reply.result).device.resources ?? NONE;
    },
    retry: false,
  });
  return {
    resources: query.data ?? NONE,
    loading: query.isPending,
    error: query.error === null ? null : failure(query.error),
    reload: (): void => {
      background(query.refetch(), 'query.refetch_failed');
    },
  };
}
