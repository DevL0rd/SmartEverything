import { ApiError, JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import { SHELLY_COMPONENT_KEY, SHELLY_REVISION } from '@smarteverything/shelly';
import type { ShellyRpc } from '@smarteverything/shelly/rpc';
import { z } from 'zod';

const METHODS = z.object({ methods: z.array(z.string().min(1)) });
const COMPONENTS = z.record(z.string(), JSON_VALUE);
const SYSTEM_STATUS = z.object({ cfg_rev: SHELLY_REVISION });
const COMPONENT_PAGE = z.object({
  components: z.array(
    z.object({
      key: SHELLY_COMPONENT_KEY,
      config: JSON_VALUE.optional(),
      status: JSON_VALUE.optional(),
    }),
  ),
  offset: z.int().nonnegative(),
  total: z.int().nonnegative(),
});
type ComponentPage = z.output<typeof COMPONENT_PAGE>['components'];

export interface ShellyInventory {
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly status: Readonly<Record<string, JsonValue>>;
  readonly methods: readonly string[];
  readonly revision: number;
  readonly statusSequence: number;
}

export async function readShellyInventory(rpc: ShellyRpc): Promise<ShellyInventory> {
  const { methods } = await rpc.call('Shelly.ListMethods', {}, METHODS);
  const config = await rpc.call('Shelly.GetConfig', {}, COMPONENTS);
  const components = methods.includes('Shelly.GetComponents') ? await allComponents(rpc) : [];
  const status = await rpc.observedCall('Shelly.GetStatus', {}, COMPONENTS);
  return {
    config: { ...config, ...fieldOf(components, 'config') },
    status: { ...fieldOf(components, 'status'), ...status.value },
    methods,
    revision: SYSTEM_STATUS.parse(status.value['sys']).cfg_rev,
    statusSequence: status.sequence,
  };
}

async function allComponents(rpc: ShellyRpc): Promise<ComponentPage> {
  const components: ComponentPage = [];
  for (;;) {
    const page = await rpc.call(
      'Shelly.GetComponents',
      { offset: components.length, include: ['config', 'status'] },
      COMPONENT_PAGE,
    );
    components.push(...page.components);
    if (components.length >= page.total) return components;
    if (page.components.length === 0)
      throw new ApiError('upstream_failed', 'Shelly component pagination made no progress.');
  }
}

function fieldOf(components: ComponentPage, field: 'config' | 'status'): Record<string, JsonValue> {
  return Object.fromEntries(
    components.flatMap((component) => {
      const value = component[field];
      return value === undefined ? [] : [[component.key, value]];
    }),
  );
}
