import {
  MCP_TOOL_AREA_LABELS,
  turnRoleOf,
  type AccessScopes,
  type DeviceScope,
  type McpToolArea,
} from '@smarteverything/domain';
import type { PhoneViewer } from '../../../phones/phone-detail';
import { scopesOf } from '../../../server/person-scope';
import { ToolError, reachRefusal, type ToolActor, type ToolContext } from './registry';

export type Limited = Pick<ToolContext, 'store' | 'actor'>;

function actingAsMember(actor: ToolActor): boolean {
  return (
    actor.role === 'member' ||
    (actor.pluginRequester !== undefined && turnRoleOf(actor.pluginRequester) === 'member')
  );
}

export function scopesOfActor(context: Limited): AccessScopes | null {
  const actor = context.actor;
  if (actor === null || !actingAsMember(actor)) return null;
  return scopesOf(context.store, actor.profileId);
}

export function phoneViewerOfActor(context: Pick<ToolContext, 'actor'>): PhoneViewer {
  const actor = context.actor;
  if (actor === null) return { role: 'owner', profileId: null };
  return { role: actingAsMember(actor) ? 'member' : 'owner', profileId: actor.profileId };
}

export function deviceScopeOfActor(context: Limited): DeviceScope | null {
  return scopesOfActor(context)?.devices ?? null;
}

export function reachableAreas(
  context: Pick<ToolContext, 'store' | 'actor' | 'caller'>,
): readonly McpToolArea[] | undefined {
  const grant = context.caller?.areas;
  const person = scopesOfActor(context)?.areas;
  if (grant === undefined) return person;
  if (person === undefined) return grant;
  return grant.filter((area) => person.includes(area));
}

export function areaRefusal(
  context: Pick<ToolContext, 'caller'>,
  what: string,
  area: McpToolArea,
): ToolError {
  if (context.caller?.areas?.includes(area) === false) {
    return reachRefusal(context.caller, what, area);
  }
  return new ToolError(
    `${MCP_TOOL_AREA_LABELS[area]} is not part of your access, so ${what} is not available; ask the owner.`,
    'forbidden',
  );
}
