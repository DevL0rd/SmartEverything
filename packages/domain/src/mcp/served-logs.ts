import type { Served } from './served-types';

export const SERVED_LOGS = [
  {
    name: 'log_read',
    area: 'system',
    access: 'read',
    title: 'Read runtime logs',
    line: 'Search logs, inspect nearby entries or list sources',
    description:
      'Read logs for the hub and paired devices. Search by time, level, runtime, device or text; use around to inspect neighbouring records; use sources to see who is sending logs. Access is restricted to logs the caller can read.',
    route: {
      key: 'view',
      default: 'search',
      branches: {
        search: { part: 'search_runtime_logs', line: 'Search log records, newest first' },
        around: { part: 'read_runtime_logs_around', line: 'Read around a record id or time' },
        sources: { part: 'read_runtime_log_sources', line: 'List log sources and last activity' },
      },
    },
  },
] as const satisfies readonly Served[];
