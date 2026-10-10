import type { ReactNode } from 'react';
import { View } from 'react-native';
import { PLUGIN_ID, type PluginRow } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { APP_PLUGINS } from '../../../plugins/registry';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useRow } from '../../../store/selectors';
import { restart } from '../data/plugin-actions';
import { pluginIcon } from '../model/plugin-look';
import { PowerRows, SwitchRows, ToolRows, UpkeepRows } from './plugin-detail-rows';
import { PluginSettingsForm } from './plugin-settings-form';

function Header({ row }: { readonly row: PluginRow }): ReactNode {
  const { manifest } = row;
  return (
    <View className="flex-row items-start gap-4 px-1">
      <IconWell icon={pluginIcon(manifest)} colour="primary" size="l" />
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body">{manifest.description}</Text>
        <Text variant="footnote" tone="variant">
          {joinParts([manifest.publisher, `Version ${manifest.version}`])}
        </Text>
      </View>
    </View>
  );
}

function StatusBanner({ row }: { readonly row: PluginRow }): ReactNode {
  const detail = row.status_detail ?? undefined;
  const body = detail === undefined ? {} : { body: detail };
  if (row.status === 'crashed') {
    return (
      <Banner
        tone="critical"
        title={`${row.manifest.name} stopped with a problem`}
        {...body}
        action={{
          label: 'Restart',
          onPress: () => {
            restart(row);
          },
        }}
      />
    );
  }
  if (row.status === 'needs_auth') {
    return <Banner tone="warning" title="Finish setting it up below" {...body} />;
  }
  return null;
}

function CustomSettings({ row }: { readonly row: PluginRow }): ReactNode {
  const custom = APP_PLUGINS.find((plugin) => plugin.id === row.id)?.settings ?? null;
  return custom === null ? null : custom();
}

function Plugin({ row }: { readonly row: PluginRow }): ReactNode {
  return (
    <SettingsFrame page="plugins" title={row.manifest.name} detail>
      <Header row={row} />
      <StatusBanner row={row} />
      <SwitchRows row={row} />
      <PowerRows row={row} />
      <ToolRows row={row} />
      <PluginSettingsForm row={row} />
      <CustomSettings row={row} />
      <UpkeepRows row={row} />
    </SettingsFrame>
  );
}

export function MissingPlugin(): ReactNode {
  return (
    <SettingsFrame page="plugins" title="Plugin" detail>
      <EmptyState icon="puzzle" title="Plugin not found" body="It may have been removed." />
    </SettingsFrame>
  );
}

export function usePluginParam(raw: string | undefined): PluginRow | null {
  const parsed = PLUGIN_ID.safeParse(raw);
  return useRow('plugins', parsed.success ? parsed.data : null);
}

export function PluginScreen({ pluginId }: { readonly pluginId: string | undefined }): ReactNode {
  const row = usePluginParam(pluginId);
  return row === null ? <MissingPlugin /> : <Plugin row={row} />;
}
