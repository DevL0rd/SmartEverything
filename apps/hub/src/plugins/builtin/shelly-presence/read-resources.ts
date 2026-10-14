import {
  ApiError,
  SHELLY_KVS_PAGE,
  SHELLY_SCHEDULES,
  SHELLY_SCRIPTS,
  SHELLY_SCRIPT_STATUS,
  SHELLY_WEBHOOKS,
  SHELLY_WEBHOOK_TYPES,
  type ShellyResources,
} from '@smarteverything/domain';
import type { ShellyRpc } from './rpc';
import { supportedMethod } from './action-plan';

export type ShellyResource = 'schedules' | 'webhooks' | 'scripts' | 'storedValues';
export async function readShellyResource(
  rpc: ShellyRpc,
  methods: readonly string[],
  resource: ShellyResource,
): Promise<Partial<ShellyResources>> {
  switch (resource) {
    case 'schedules':
      return {
        schedules: await rpc.call(supportedMethod(methods, 'Schedule.List'), {}, SHELLY_SCHEDULES),
      };
    case 'webhooks':
      return {
        webhooks: await rpc.call(supportedMethod(methods, 'Webhook.List'), {}, SHELLY_WEBHOOKS),
        webhookTypes: await webhookTypes(rpc, methods),
      };
    case 'scripts':
      return { scripts: await scripts(rpc, methods) };
    case 'storedValues':
      return { storedValues: await storedValues(rpc, methods) };
  }
}
async function scripts(
  rpc: ShellyRpc,
  methods: readonly string[],
): Promise<ShellyResources['scripts']> {
  const listed = await rpc.call(supportedMethod(methods, 'Script.List'), {}, SHELLY_SCRIPTS);
  const rows = [];
  for (const script of listed.scripts) {
    const status = await rpc.call(
      supportedMethod(methods, 'Script.GetStatus'),
      { id: script.id },
      SHELLY_SCRIPT_STATUS,
    );
    rows.push({ ...script, status });
  }
  return { scripts: rows };
}
async function storedValues(
  rpc: ShellyRpc,
  methods: readonly string[],
): Promise<NonNullable<ShellyResources['storedValues']>> {
  const method = supportedMethod(methods, 'KVS.GetMany');
  let offset = 0;
  const items: NonNullable<ShellyResources['storedValues']>['items'] = {};
  let rev: number | undefined;
  for (let page = 0; page < 50; page += 1) {
    const result = await rpc.call(method, { offset }, SHELLY_KVS_PAGE);
    if (result.offset !== offset || (rev !== undefined && result.rev !== rev))
      throw new ApiError('conflict', 'Stored values changed during pagination.');
    rev = result.rev;
    const total = result.total;
    Object.assign(items, result.items);
    const received = Object.keys(result.items).length;
    if (received === 0 && offset < total)
      throw new ApiError('upstream_failed', 'Stored value pagination made no progress.');
    offset += received;
    if (offset >= total) return { items, offset: 0, total, ...(rev === undefined ? {} : { rev }) };
  }
  throw new ApiError('upstream_failed', 'Stored value pagination exceeded its bounded limit.');
}
async function webhookTypes(
  rpc: ShellyRpc,
  methods: readonly string[],
): Promise<ShellyResources['webhookTypes']> {
  const all = methods.find((method) => method.toLowerCase() === 'webhook.listallsupported');
  if (all === undefined)
    return rpc.call(supportedMethod(methods, 'Webhook.ListSupported'), {}, SHELLY_WEBHOOK_TYPES);
  const types: NonNullable<ShellyResources['webhookTypes']>['types'] = [];
  let offset = 0;
  for (let page = 0; page < 64; page += 1) {
    const result = await rpc.call(all, { offset }, SHELLY_WEBHOOK_TYPES);
    types.push(...result.types);
    if (result.total === undefined) return { types };
    if (result.types.length === 0 && offset < result.total)
      throw new ApiError('upstream_failed', 'Webhook type pagination made no progress.');
    offset += result.types.length;
    if (offset >= result.total) return { types, offset: 0, total: result.total };
  }
  throw new ApiError('upstream_failed', 'Webhook type pagination exceeded its bounded limit.');
}
