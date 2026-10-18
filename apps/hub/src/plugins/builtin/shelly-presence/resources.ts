import { ApiError } from '@smarteverything/domain';
import {
  SHELLY_KVS_PAGE,
  SHELLY_SCHEDULES,
  SHELLY_SCRIPTS,
  SHELLY_WEBHOOKS,
  SHELLY_WEBHOOK_TYPES,
  type ShellyResources,
} from '@smarteverything/shelly';
import { z } from 'zod';
import type { OperationPorts } from './ports';

const SCRIPT_STATUS = z.looseObject({
  id: z.int().nonnegative(),
  running: z.boolean(),
  errors: z.array(z.string()).optional(),
});

export type ShellyResource = 'schedules' | 'webhooks' | 'scripts' | 'storedValues';
type Call = OperationPorts['call'];

async function scripts(call: Call): Promise<ShellyResources['scripts']> {
  const listed = await call('Script.List', {}, SHELLY_SCRIPTS);
  const rows = [];
  for (const script of listed.scripts)
    rows.push({
      ...script,
      status: await call('Script.GetStatus', { id: script.id }, SCRIPT_STATUS),
    });
  return { scripts: rows };
}

async function storedValues(call: Call): Promise<NonNullable<ShellyResources['storedValues']>> {
  const items: NonNullable<ShellyResources['storedValues']>['items'] = {};
  let revision: number | undefined;
  for (let offset = 0; ;) {
    const page = await call('KVS.GetMany', { offset }, SHELLY_KVS_PAGE);
    if (page.offset !== offset || (revision !== undefined && page.rev !== revision))
      throw new ApiError('conflict', 'Stored values changed while they were being read.');
    revision = page.rev;
    Object.assign(items, page.items);
    const received = Object.keys(page.items).length;
    offset += received;
    if (offset >= page.total) return { items, offset: 0, total: page.total, rev: revision };
    if (received === 0)
      throw new ApiError('upstream_failed', 'Stored value paging made no progress.');
  }
}

async function webhookTypes(call: Call): Promise<NonNullable<ShellyResources['webhookTypes']>> {
  const types: NonNullable<ShellyResources['webhookTypes']>['types'] = [];
  for (let offset = 0; ;) {
    const page = await call('Webhook.ListAllSupported', { offset }, SHELLY_WEBHOOK_TYPES);
    types.push(...page.types);
    offset += page.types.length;
    if (page.total === undefined || offset >= page.total) return { types };
    if (page.types.length === 0)
      throw new ApiError('upstream_failed', 'Webhook type paging made no progress.');
  }
}

export async function readShellyResource(
  call: Call,
  resource: ShellyResource,
): Promise<Partial<ShellyResources>> {
  switch (resource) {
    case 'schedules':
      return { schedules: await call('Schedule.List', {}, SHELLY_SCHEDULES) };
    case 'webhooks':
      return {
        webhooks: await call('Webhook.List', {}, SHELLY_WEBHOOKS),
        webhookTypes: await webhookTypes(call),
      };
    case 'scripts':
      return { scripts: await scripts(call) };
    case 'storedValues':
      return { storedValues: await storedValues(call) };
  }
}
