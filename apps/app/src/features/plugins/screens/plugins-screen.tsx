import type { ReactNode } from 'react';
import type { PluginRow } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List, Section } from '../../../components/section';
import { Switch } from '../../../components/switch';
import { SettingsFrame } from '../../../settings/settings-frame';
import { DEVICE_SETTINGS } from '../../devices';
import { SETTINGS as WATCH_SETTINGS } from '../../watches';
import { useListedDevices, useRows } from '../../../store/selectors';
import { switchPlugin } from '../data/plugin-actions';
import { pluginMenu } from '../data/plugin-menu';
import { devicePluginRows, type DevicePluginRow } from '../model/device-plugins';
import { pluginIcon, pluginSubtitle, statusLook } from '../model/plugin-look';
import { background } from '@smarteverything/logging';

const ADD = href.settings.page('plugins/add');

function PluginRowItem({ row }: { readonly row: PluginRow }): ReactNode {
  return (
    <ListRow
      icon={pluginIcon(row.manifest)}
      title={row.manifest.name}
      subtitle={pluginSubtitle(row)}
      subtitleTone={statusLook(row.status).tone}
      href={href.pluginSettings(row.id)}
      contextMenu={pluginMenu(row)}
      trailing={
        <Switch
          value={row.enabled}
          label={`${row.manifest.name} on`}
          onChange={(on) => {
            background(switchPlugin(row, on), 'plugin.switch_failed');
          }}
        />
      }
    />
  );
}

function DevicePluginRowItem({ row }: { readonly row: DevicePluginRow }): ReactNode {
  return (
    <ListRow
      icon={row.icon}
      title={row.title}
      subtitle={row.description}
      wrapSubtitle
      href={row.href}
      trailing={row.status === null ? undefined : <Badge label={row.status} tone="positive" />}
    />
  );
}

function HubPlugins(): ReactNode {
  const rows = useRows('plugins');
  if (rows.length === 0) {
    return (
      <Section title="Hub plugins">
        <EmptyState
          icon="puzzle"
          title="No plugins yet"
          body="Plugins add devices, widgets and tools to SmartEverything."
          action={<Button label="Add a plugin" icon="plus" href={ADD} />}
        />
      </Section>
    );
  }
  return (
    <List inset title="Hub plugins">
      {[
        ...rows.map((row) => <PluginRowItem key={row.id} row={row} />),
        <ListRow key="add" icon="plus" iconTone="primary" title="Add a plugin" href={ADD} />,
      ]}
    </List>
  );
}

function DevicePlugins(): ReactNode {
  const devices = useListedDevices();
  const rows = devicePluginRows(devices, [...DEVICE_SETTINGS, ...WATCH_SETTINGS]);
  if (rows.length === 0) return null;
  return (
    <List inset title="Device plugins">
      {rows.map((row) => (
        <DevicePluginRowItem key={row.id} row={row} />
      ))}
    </List>
  );
}

export function PluginsScreen(): ReactNode {
  return (
    <SettingsFrame page="plugins">
      <HubPlugins />
      <DevicePlugins />
    </SettingsFrame>
  );
}
