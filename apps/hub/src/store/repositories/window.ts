import type { SQLInputValue } from 'node:sqlite';
import { moment } from '../context';

export interface TimeWindow {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly deviceIds?: readonly string[] | undefined;
  readonly limit: number;
}

export interface WindowFilter {
  readonly text: string;
  readonly parameters: Record<string, SQLInputValue>;
}

export function windowFilter(column: string, window: TimeWindow): WindowFilter {
  const clauses: string[] = ['1 = 1'];
  const parameters: Record<string, SQLInputValue> = { limit: window.limit };
  if (window.from !== undefined) {
    clauses.push(`${column} >= $from`);
    parameters['from'] = moment(window.from);
  }
  if (window.to !== undefined) {
    clauses.push(`${column} < $to`);
    parameters['to'] = moment(window.to);
  }
  if (window.deviceIds !== undefined) {
    const names = window.deviceIds.map((id, index) => {
      parameters[`device${String(index)}`] = id;
      return `$device${String(index)}`;
    });
    clauses.push(`device_id in (${names.join(', ')})`);
  }
  return { text: clauses.join(' and '), parameters };
}
