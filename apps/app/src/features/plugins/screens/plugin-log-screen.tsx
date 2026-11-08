import type { ReactNode } from 'react';
import { View } from 'react-native';
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
import { background } from '@smarteverything/logging';

function textOf(lines: readonly PluginLogLine[]): string {
  return lines.map((entry) => `${clock(entry.at)}  ${entry.line}`).join('\n');
}

function LogStatus({ log }: { readonly log: ReturnType<typeof usePluginLog> }): ReactNode {
  if (log.isError) {
    return (
      <ErrorState
        error={log.error}
        retry={() => {
          background(log.refetch(), 'log.refetch_failed');
        }}
      />
    );
  }
  if (log.data === undefined) {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Loading plugin log">
        <Skeleton shape="block" />
      </View>
    );
  }
  return (
    <EmptyState icon="fileText" title="Nothing yet" body="Lines the plugin writes show up here." />
  );
}

function LogBody({ row }: { readonly row: PluginRow }): ReactNode {
  const log = usePluginLog(row);
  if (!log.isError && log.data !== undefined && log.data.length > 0) {
    return <CodeBlock code={textOf(log.data)} label={`${row.manifest.name} log`} />;
  }
  return (
    <View className="w-full max-w-reading">
      <LogStatus log={log} />
    </View>
  );
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
      contentWidth="detail"
      trail={[{ label: row.manifest.name, href: href.pluginSettings(row.id) }]}
    >
      <LogBody row={row} />
    </SettingsFrame>
  );
}
