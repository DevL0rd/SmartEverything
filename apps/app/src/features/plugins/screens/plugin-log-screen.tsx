import type { ReactNode } from 'react';
import type { PluginLogLine, PluginRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { CodeBlock } from '../../../components/code';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { clock } from '../../../format/time';
import { SettingsFrame } from '../../../settings/settings-frame';
import { usePluginLog } from '../data/plugin-queries';
import { MissingPlugin, usePluginParam } from './plugin-screen';

function textOf(lines: readonly PluginLogLine[]): string {
  return lines.map((entry) => `${clock(entry.at)}  ${entry.line}`).join('\n');
}

function LogBody({ row }: { readonly row: PluginRow }): ReactNode {
  const log = usePluginLog(row);
  if (log.isError) {
    return <ErrorState error={log.error} retry={() => void log.refetch()} />;
  }
  if (log.data === undefined) {
    return <Skeleton shape="block" className="h-56" />;
  }
  if (log.data.length === 0) {
    return (
      <EmptyState
        icon="fileText"
        title="Nothing yet"
        body="Lines the plugin writes show up here."
      />
    );
  }
  return <CodeBlock code={textOf(log.data)} label={`${row.manifest.name} log`} />;
}

export function PluginLogScreen({
  pluginId,
}: {
  readonly pluginId: string | undefined;
}): ReactNode {
  const row = usePluginParam(pluginId);
  if (row === null) {
    return <MissingPlugin />;
  }
  return (
    <SettingsFrame
      page="plugins"
      title="Log"
      detail
      trail={[{ label: row.manifest.name, href: href.pluginSettings(row.id) }]}
    >
      <LogBody row={row} />
    </SettingsFrame>
  );
}
