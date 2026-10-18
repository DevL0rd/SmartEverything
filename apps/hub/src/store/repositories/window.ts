import { moment } from '../context';
import { allOf, inList, type SqlFilter } from '../sql';

export interface TimeWindow {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly deviceIds?: readonly string[] | undefined;
  readonly limit: number;
}

export function windowFilter(column: string, window: TimeWindow): SqlFilter {
  return allOf([
    { text: '1 = 1', parameters: { limit: window.limit } },
    ...(window.from === undefined
      ? []
      : [{ text: `${column} >= $from`, parameters: { from: moment(window.from) } }]),
    ...(window.to === undefined
      ? []
      : [{ text: `${column} < $to`, parameters: { to: moment(window.to) } }]),
    ...(window.deviceIds === undefined ? [] : [inList('device_id', 'devices', window.deviceIds)]),
  ]);
}
