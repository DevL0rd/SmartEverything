import { z } from 'zod';
import { PLUGIN_ID } from './plugin-parts';

export const PLUGIN_PERSON_STATUSES = ['approved', 'owner'] as const;

export type PluginPersonStatus = (typeof PLUGIN_PERSON_STATUSES)[number];

export const PLUGIN_REQUESTERS = ['owner', 'approved', 'unlisted'] as const;

export type PluginRequester = (typeof PLUGIN_REQUESTERS)[number];

export function requesterOf(
  person: { readonly status: PluginPersonStatus } | undefined,
): PluginRequester {
  return person === undefined ? 'unlisted' : person.status;
}

export const PLUGIN_ORIGIN = z.strictObject({
  plugin_id: PLUGIN_ID,
  requester: z.enum(PLUGIN_REQUESTERS),
});

export type PluginOrigin = z.output<typeof PLUGIN_ORIGIN>;

export function leastTrustedOrigin(origins: readonly PluginOrigin[]): PluginOrigin | null {
  return origins.reduce<PluginOrigin | null>(
    (least, next) =>
      least === null ||
      PLUGIN_REQUESTERS.indexOf(next.requester) > PLUGIN_REQUESTERS.indexOf(least.requester)
        ? next
        : least,
    null,
  );
}

export function turnRoleOf(requester: PluginRequester | undefined): 'owner' | 'member' {
  return requester === 'owner' || requester === 'approved' ? 'owner' : 'member';
}

export const PLUGIN_EXTERNAL_ID = z
  .string()
  .regex(/^[A-Za-z0-9_.:@-]{1,200}$/, 'the person’s id in that plugin');

export const PLUGIN_PERSON_CHANGE = z.strictObject({
  name: z.string().trim().min(1).max(120),
  status: z.enum(PLUGIN_PERSON_STATUSES),
});

export type PluginPersonChange = z.output<typeof PLUGIN_PERSON_CHANGE>;

export const PLUGIN_PERSON = z.strictObject({
  plugin_id: PLUGIN_ID,
  external_id: PLUGIN_EXTERNAL_ID,
  name: z.string().min(1).max(120),
  status: z.enum(PLUGIN_PERSON_STATUSES),
  added_at: z.iso.datetime({ offset: true }),
});

export type PluginPerson = z.output<typeof PLUGIN_PERSON>;

export const PLUGIN_PEOPLE_MAX = 500;
