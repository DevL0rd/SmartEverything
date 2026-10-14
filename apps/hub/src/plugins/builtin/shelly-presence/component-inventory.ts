import {
  ApiError,
  JSON_VALUE,
  SHELLY_COMPONENT_KEY,
  SHELLY_REVISION,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ShellyRpc } from './rpc';

export const SHELLY_COMPONENT_PAGE = z.object({
  components: z
    .array(
      z.object({
        key: SHELLY_COMPONENT_KEY,
        config: JSON_VALUE.optional(),
        status: JSON_VALUE.optional(),
      }),
    )
    .max(512),
  cfg_rev: SHELLY_REVISION,
  offset: z.int().nonnegative(),
  total: z.int().min(0).max(512),
});
export type ShellyComponentPage = z.output<typeof SHELLY_COMPONENT_PAGE>;
export const COMPONENT_OBJECT = z.record(SHELLY_COMPONENT_KEY, JSON_VALUE);
export interface ShellyInventory {
  readonly config: Readonly<Record<string, JsonValue>>;
  readonly status: Readonly<Record<string, JsonValue>>;
  readonly methods: readonly string[];
  readonly revision: number;
  readonly statusSequence: number;
  readonly statusSequences: Readonly<Record<string, number>>;
}
interface ShellyObservedComponents extends ShellyComponentPage {
  readonly statusSequences: Readonly<Record<string, number>>;
}
export function shellyInventoryUpdate(
  inventory: ShellyInventory,
  notification: { readonly sequence?: number },
): (component: string) => boolean {
  const sequence = notification.sequence ?? 0;
  return (component) =>
    sequence > (inventory.statusSequences[component] ?? inventory.statusSequence);
}
const METHODS = z.object({ methods: z.array(z.string().min(1).max(100)).max(1024) });
export async function readShellyInventory(rpc: ShellyRpc): Promise<ShellyInventory> {
  const { methods } = await rpc.call('Shelly.ListMethods', {}, METHODS);
  const config = await rpc.call('Shelly.GetConfig', {}, COMPONENT_OBJECT);
  const components = methods.includes('Shelly.GetComponents') ? await pages(rpc) : null;
  const observed = await rpc.observedCall('Shelly.GetStatus', {}, COMPONENT_OBJECT);
  const status = observed.value;
  const sys = z.object({ cfg_rev: SHELLY_REVISION }).parse(status['sys']);
  if (components !== null && sys.cfg_rev !== components.cfg_rev)
    throw new ApiError(
      'conflict',
      'Shelly configuration changed during the snapshot. Refresh again.',
    );
  return {
    config:
      components === null
        ? config
        : Object.fromEntries(
            components.components.flatMap((component) =>
              component.config === undefined ? [] : [[component.key, component.config]],
            ),
          ),
    status: {
      ...Object.fromEntries(
        components?.components.flatMap((component) =>
          component.status === undefined ? [] : [[component.key, component.status]],
        ) ?? [],
      ),
      ...status,
    },
    methods,
    revision: sys.cfg_rev,
    statusSequence: observed.sequence,
    statusSequences: {
      ...components?.statusSequences,
      ...Object.fromEntries(Object.keys(status).map((key) => [key, observed.sequence])),
    },
  };
}
async function pages(rpc: ShellyRpc): Promise<ShellyObservedComponents> {
  let offset = 0;
  let first: ShellyComponentPage | null = null;
  const components: ShellyComponentPage['components'] = [];
  const statusSequences: Record<string, number> = {};
  for (let page = 0; page < 128; page += 1) {
    const observed = await rpc.observedCall(
      'Shelly.GetComponents',
      { offset, include: ['config', 'status'] },
      SHELLY_COMPONENT_PAGE,
    );
    const result = observed.value;
    if (
      result.offset !== offset ||
      (first !== null && (result.cfg_rev !== first.cfg_rev || result.total !== first.total))
    )
      throw new ApiError('conflict', 'Shelly component inventory changed during pagination.');
    first ??= result;
    if (result.components.length === 0 && offset < result.total)
      throw new ApiError('upstream_failed', 'Shelly component pagination made no progress.');
    components.push(...result.components);
    Object.assign(statusSequences, componentStatusSequences(result.components, observed.sequence));
    offset += result.components.length;
    if (offset >= result.total) return { ...first, components, statusSequences };
  }
  throw new ApiError('upstream_failed', 'Shelly component pagination exceeded its bounded limit.');
}

function componentStatusSequences(
  components: ShellyComponentPage['components'],
  sequence: number,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    components.flatMap((component) =>
      component.status === undefined ? [] : [[component.key, sequence]],
    ),
  );
}
