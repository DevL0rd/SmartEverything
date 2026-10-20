import {
  MCP_TOOL_AREAS,
  MCP_TOOL_AREA_LABELS,
  TEMPLATE_SCOPES,
  type AccessScopes,
  type DeviceScope,
  type McpToolArea,
  type PersonAccess,
  type PersonAccessChange,
  type PersonBudget,
  type PersonTemplate,
} from '@smarteverything/domain';
import { plural } from '../../../format/text';

export const TEMPLATE_LABEL: Readonly<Record<PersonTemplate, string>> = {
  owner: 'Owner',
  adult: 'Adult',
  child: 'Child',
  guest: 'Guest',
};

export const TEMPLATE_HELP: Readonly<Record<PersonTemplate, string>> = {
  owner: 'Everything, always',
  adult: 'Everything except owner powers',
  child: 'No settings, people, plugins, computers or automations',
  guest: 'Like a child, and no health data',
};

export const TEMPLATE_ORDER: readonly PersonTemplate[] = ['adult', 'child', 'guest'];

export const DEFAULT_WARN_PERCENT = 80;

export function templateChange(template: PersonTemplate): PersonAccessChange {
  return { template, scopes: TEMPLATE_SCOPES[template] };
}

export function toggled(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((one) => one !== id) : [...list, id];
}

export function scopesChange(
  access: PersonAccess,
  scopes: Partial<AccessScopes>,
): PersonAccessChange {
  return { scopes: { ...access.scopes, ...scopes } };
}

export function areasText(areas: readonly McpToolArea[]): string {
  if (areas.length === MCP_TOOL_AREAS.length) {
    return 'Everything';
  }
  if (areas.length === 0) {
    return 'Nothing';
  }
  return `${String(areas.length)} of ${String(MCP_TOOL_AREAS.length)}`;
}

export function areaLabels(): readonly { readonly value: McpToolArea; readonly label: string }[] {
  return MCP_TOOL_AREAS.map((value) => ({ value, label: MCP_TOOL_AREA_LABELS[value] }));
}

export function devicesText(scope: DeviceScope): string {
  const places = scope.rooms.length + scope.devices.length;
  if (scope.mode === 'all') {
    return 'All devices';
  }
  const count = plural(places, 'room or device', 'rooms and devices');
  return scope.mode === 'only' ? `Only ${count}` : `All except ${count}`;
}

export function modelsText(scope: AccessScopes['models']): string {
  return scope.mode === 'default' ? 'Any model' : `Only ${plural(scope.ids.length, 'model')}`;
}

export function channelsText(scope: AccessScopes['channels']): string {
  return scope.mode === 'all' ? 'All channels' : `Only ${plural(scope.ids.length, 'channel')}`;
}

export function budgetText(budget: PersonBudget | null): string {
  if (budget === null || (budget.daily_usd === null && budget.monthly_usd === null)) {
    return 'No limit';
  }
  const parts = [
    budget.daily_usd === null ? null : `$${String(budget.daily_usd)} a day`,
    budget.monthly_usd === null ? null : `$${String(budget.monthly_usd)} a month`,
  ];
  return parts.filter((part) => part !== null).join(', ');
}

export type UsdInput =
  | { readonly kind: 'none' }
  | { readonly kind: 'amount'; readonly usd: number }
  | { readonly kind: 'invalid' };

const USD_MIN = 0.01;

const USD_MAX = 100_000;

export function usdOf(text: string): UsdInput {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { kind: 'none' };
  }
  const usd = Number(trimmed);
  return Number.isFinite(usd) && usd >= USD_MIN && usd <= USD_MAX
    ? { kind: 'amount', usd }
    : { kind: 'invalid' };
}

export function budgetOf(
  daily: UsdInput,
  monthly: UsdInput,
  hardStop: boolean,
  warnAtPercent: number,
): PersonBudget | null | 'invalid' {
  if (daily.kind === 'invalid' || monthly.kind === 'invalid') {
    return 'invalid';
  }
  if (daily.kind === 'none' && monthly.kind === 'none') {
    return null;
  }
  return {
    daily_usd: daily.kind === 'amount' ? daily.usd : null,
    monthly_usd: monthly.kind === 'amount' ? monthly.usd : null,
    warn_at_percent: warnAtPercent,
    hard_stop: hardStop,
  };
}
