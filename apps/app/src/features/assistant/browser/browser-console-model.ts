import type { ConsoleLevel, ConsoleRecord } from './browser-diagnostics-contract';
import type { SelectOption } from '../../../components/select-picker';
export type ConsoleFilter = ConsoleLevel | 'all';
export const CONSOLE_LEVELS: readonly SelectOption<ConsoleFilter>[] = [
  { value: 'all', label: 'All levels' },
  { value: 'error', label: 'Errors' },
  { value: 'warning', label: 'Warnings' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug' },
];
export function matchingConsoleRecords(
  records: readonly ConsoleRecord[],
  query: string,
  level: ConsoleFilter,
): readonly ConsoleRecord[] {
  const needle = query.trim().toLowerCase();
  return records.filter(
    (record) =>
      (level === 'all' || record.level === level) &&
      `${record.message}\n${record.source ?? ''}\n${record.stack ?? ''}`
        .toLowerCase()
        .includes(needle),
  );
}
