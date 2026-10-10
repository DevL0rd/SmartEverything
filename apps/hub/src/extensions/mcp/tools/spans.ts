import {
  healthTypeInfo,
  zoneOffsetSeconds,
  type EntrySpan,
  type HealthRecordType,
} from '@smarteverything/domain';
import { ToolError, type ToolContext } from './registry';

const MINUTE_MS = 60_000;

export interface LoggedSpan {
  readonly startTime: string;
  readonly endTime: string | null;
  readonly zoneOffsetSeconds: number;
}

export function minuteSpan(context: ToolContext, start: Date): EntrySpan {
  return {
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + MINUTE_MS).toISOString(),
    zoneOffsetSeconds: zoneOffsetSeconds(context.store.settings.read().time_zone, start),
  };
}

export function entrySpan(
  context: ToolContext,
  type: HealthRecordType,
  start: Date,
  endTime: string | undefined,
): LoggedSpan {
  const info = healthTypeInfo(type);
  const minute = minuteSpan(context, start);
  if (info.span === 'instant') {
    return { ...minute, endTime: null };
  }
  if (endTime === undefined && info.endRequired) {
    throw new ToolError(`${type} is a session; give its endTime`);
  }
  return endTime === undefined ? minute : { ...minute, endTime };
}
