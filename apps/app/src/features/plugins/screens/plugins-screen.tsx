import type { ReactNode } from 'react';
import type { PluginRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Switch } from '../../../components/switch';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useRows } from '../../../store/selectors';
import { switchPlugin } from '../data/plugin-actions';
import { pluginMenu } from '../data/plugin-menu';
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

function PluginRows(): ReactNode {
  const rows = useRows('plugins');
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="puzzle"
        title="No plugins yet"
        body="Plugins add devices, widgets and tools to SmartEverything."
        action={<Button label="Add a plugin" icon="plus" href={ADD} />}
      />
    );
  }
  return (
    <List inset>
      {[
        ...rows.map((row) => <PluginRowItem key={row.id} row={row} />),
        <ListRow key="add" icon="plus" iconTone="primary" title="Add a plugin" href={ADD} />,
      ]}
    </List>
  );
}

export function PluginsScreen(): ReactNode {
  return (
    <SettingsFrame page="plugins">
      <PluginRows />
    </SettingsFrame>
  );
}
