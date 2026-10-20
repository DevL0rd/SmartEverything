import {
  MCP_TOOL_AREAS,
  MCP_TOOL_AREA_LABELS,
  type AccessRequestKind,
  type AccessRequestRow,
} from '@smarteverything/domain';
import { DAY_MS, relative } from '../../../format/time';
import { timeLeftText } from './standing';

export const REQUEST_KIND_LABEL: Readonly<Record<AccessRequestKind, string>> = {
  area: 'A part of the app',
  device: 'A device or room',
  model: 'An AI model',
  budget: 'More AI budget',
};

export const REQUEST_KIND_ORDER: readonly AccessRequestKind[] = [
  'area',
  'device',
  'model',
  'budget',
];

export interface RequestNames {
  readonly places: ReadonlyMap<string, string>;
}

function areaLabelOf(target: string): string {
  const area = MCP_TOOL_AREAS.find((one) => one === target);
  return area === undefined ? target : MCP_TOOL_AREA_LABELS[area];
}

export function targetText(
  row: Pick<AccessRequestRow, 'kind' | 'target'>,
  names: RequestNames,
): string {
  const { kind, target } = row;
  if (target === null) {
    return REQUEST_KIND_LABEL[kind];
  }
  switch (kind) {
    case 'area':
      return areaLabelOf(target);
    case 'device':
      return names.places.get(target) ?? 'A device or room';
    case 'model':
      return target;
    case 'budget':
      return `$${target} more AI budget`;
  }
}

export function requestStatusText(row: AccessRequestRow, now: number): string {
  switch (row.status) {
    case 'pending':
      return `Asked ${relative(row.requested_at, now)}`;
    case 'denied':
      return `Denied ${relative(row.decided_at ?? row.requested_at, now)}`;
    case 'approved':
      return approvedText(row, now);
  }
}

function approvedText(row: AccessRequestRow, now: number): string {
  if (row.lapsed_at !== null) {
    return `Ended ${relative(row.lapsed_at, now)}`;
  }
  return row.until === null
    ? 'Approved for good'
    : `Approved, ends in ${timeLeftText(row.until, now)}`;
}

export interface GrantPreset {
  readonly id: string;
  readonly label: string;
  readonly ms: number | null;
}

export const GRANT_PRESETS: readonly GrantPreset[] = [
  { id: 'forever', label: 'For good', ms: null },
  { id: 'day', label: 'For 1 day', ms: DAY_MS },
  { id: 'week', label: 'For 1 week', ms: 7 * DAY_MS },
  { id: 'month', label: 'For 30 days', ms: 30 * DAY_MS },
];

export function untilOf(preset: GrantPreset, now: number): string | null {
  return preset.ms === null ? null : new Date(now + preset.ms).toISOString();
}

export function pendingFirst(rows: readonly AccessRequestRow[]): readonly AccessRequestRow[] {
  const pending = rows.filter((row) => row.status === 'pending');
  return [...pending, ...rows.filter((row) => row.status !== 'pending')];
}
