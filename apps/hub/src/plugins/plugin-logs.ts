import type { PluginLogLine, RuntimeLogRow } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';

const PLUGIN_LOG_PAGE = 500;

export function pluginSource(id: string): string {
  return `plugin:${id}`;
}

export function pluginLogger(log: Logger, id: string): Logger {
  const source = pluginSource(id);
  return log.child({ actorId: source, source });
}

function logLine(row: RuntimeLogRow): PluginLogLine {
  const output = row.payload['line'] ?? row.payload['reason'];
  const line =
    typeof output === 'string'
      ? output
      : row.failure === null
        ? row.event
        : `${row.event}: ${row.failure.message}`;
  return { at: row.at, line };
}

export function readPluginLines(store: Store, id: string): readonly PluginLogLine[] {
  const page = store.runtimeLogs.search(
    { owner: true, profileId: null },
    { source: pluginSource(id), limit: PLUGIN_LOG_PAGE },
  );
  return page.rows.map(logLine).reverse();
}
