import type { MomentText } from '../../../format/clock-text';
import type { DayStripModel } from './day-strip-model';

export interface AlarmPin {
  readonly at: number;
  readonly count: number;
  readonly label: string;
}

function pinOf(
  first: number,
  rest: readonly number[],
  timeZone: string,
  instant: MomentText,
): AlarmPin {
  const last = rest.at(-1);
  if (last === undefined) {
    return { at: first, count: 1, label: `Alarm ${instant(first, timeZone)}` };
  }
  const count = rest.length + 1;
  return {
    at: first,
    count,
    label: `${String(count)} alarms ${instant(first, timeZone)} to ${instant(last, timeZone)}`,
  };
}

export function alarmPinsOf(
  model: Pick<DayStripModel, 'from' | 'to' | 'alarms' | 'timeZone'>,
  width: number,
  pinWidth: number,
  instant: MomentText,
): readonly AlarmPin[] {
  const span = Math.max(1, model.to - model.from);
  const reach = width <= 0 ? 0 : (pinWidth / width) * span;
  const groups: { readonly first: number; readonly rest: number[] }[] = [];
  for (const at of [...model.alarms].sort((left, right) => left - right)) {
    const group = groups.at(-1);
    if (group !== undefined && at - group.first < reach) group.rest.push(at);
    else groups.push({ first: at, rest: [] });
  }
  return groups.map((group) => pinOf(group.first, group.rest, model.timeZone, instant));
}
