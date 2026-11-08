import { useState, type ReactElement, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { PluginRow } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Banner } from '../../../components/banner';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Grid, useGridLayout } from '../../../components/grid';
import { ListRow } from '../../../components/list-row';
import { SearchField } from '../../../components/search-field';
import { List, Section } from '../../../components/section';
import { Switch } from '../../../components/switch';
import { SettingsFrame } from '../../../settings/settings-frame';
import { DEVICE_SETTINGS } from '../../devices';
import { SETTINGS as WATCH_SETTINGS } from '../../watches';
import { useListedDevices, useRows, useSyncStatus } from '../../../store/selectors';
import { switchPlugin } from '../data/plugin-actions';
import { pluginMenu } from '../data/plugin-menu';
import { devicePluginRows, type DevicePluginRow } from '../model/device-plugins';
import { pluginIcon, pluginSubtitle, statusLook } from '../model/plugin-look';
import {
  matchesDevicePlugin,
  matchesHubPlugin,
  pluginCatalogStatus,
  pluginSourceLabel,
  type PluginCatalogStatus,
} from '../model/plugin-catalog';
import { background } from '@smarteverything/logging';

const PLUGIN_CARD_MIN_WIDTH = 390;
const ADD = href.settings.page('plugins/add');

function PluginRowItem({ row }: { readonly row: PluginRow }): ReactNode {
  const subtitle = pluginSubtitle(row);
  const source = pluginSourceLabel(row);
  return (
    <ListRow
      icon={pluginIcon(row.manifest)}
      title={row.manifest.name}
      wrapTitle
      subtitle={subtitle}
      wrapSubtitle
      subtitleTone={statusLook(row.status).tone}
      caption={source}
      label={`${row.manifest.name}, ${subtitle}, ${source}`}
      href={href.pluginSettings(row.id)}
      contextMenu={pluginMenu(row)}
      trailing={
        <Switch
          value={row.enabled}
          label={`${row.manifest.name} on, ${row.manifest.publisher}, ${source}`}
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

function Catalog({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: readonly ReactElement[];
}): ReactNode {
  const [width, setWidth] = useState(0);
  const { columns } = useGridLayout(width, PLUGIN_CARD_MIN_WIDTH, 'grid', 2);
  return (
    <View
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {columns > 1 ? (
        <Section title={title}>
          <Grid
            measuredWidth={width}
            minItemWidth={PLUGIN_CARD_MIN_WIDTH}
            cellClassName="max-w-reading"
            stretchLastRow={false}
          >
            {rows.map((row) => (
              <List key={row.key} inset>
                {row}
              </List>
            ))}
          </Grid>
        </Section>
      ) : (
        <List inset title={title}>
          {rows}
        </List>
      )}
    </View>
  );
}

function HubPlugins({
  rows,
  empty,
}: {
  readonly rows: readonly PluginRow[];
  readonly empty: boolean;
}): ReactNode {
  if (empty) {
    return (
      <Section title="Hub plugins" className="max-w-reading">
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
    <Catalog
      title="Hub plugins"
      rows={[
        <ListRow key="add" icon="plus" iconTone="primary" title="Add a plugin" href={ADD} />,
        ...rows.map((row) => <PluginRowItem key={row.id} row={row} />),
      ]}
    />
  );
}

function DevicePlugins({ rows }: { readonly rows: readonly DevicePluginRow[] }): ReactNode {
  if (rows.length === 0) return null;
  return (
    <Catalog
      title="Device plugins"
      rows={rows.map((row) => (
        <DevicePluginRowItem key={row.id} row={row} />
      ))}
    />
  );
}

function CatalogStatus({ status }: { readonly status: PluginCatalogStatus }): ReactNode {
  if (status === 'ready') return null;
  if (status === 'loading')
    return (
      <ActivityIndicator colorClassName="accent-primary" accessibilityLabel="Loading plugins" />
    );
  return (
    <Banner
      tone="warning"
      title="Plugin list unavailable"
      body="Showing any plugin information already on this device."
      wrapBody
    />
  );
}

export function PluginsScreen(): ReactNode {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const status = pluginCatalogStatus(useSyncStatus());
  const hubPlugins = useRows('plugins');
  const devices = useListedDevices();
  const hub = hubPlugins.filter((row) => matchesHubPlugin(row, query));
  const device = devicePluginRows(devices, [...DEVICE_SETTINGS, ...WATCH_SETTINGS]).filter((row) =>
    matchesDevicePlugin(row, query),
  );
  return (
    <SettingsFrame page="plugins" contentWidth="full">
      <View className="w-full max-w-reading gap-3">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search plugins"
          variant="field"
        />
        <CatalogStatus status={status} />
      </View>
      {status === 'ready' && query !== '' && hub.length === 0 && device.length === 0 ? (
        <View className="w-full max-w-reading">
          <EmptyState
            icon="search"
            title={`No plugins match “${search.trim()}”`}
            body="Search by name, publisher or source."
          />
        </View>
      ) : null}
      <HubPlugins rows={hub} empty={status === 'ready' && query === '' && hub.length === 0} />
      <DevicePlugins rows={device} />
    </SettingsFrame>
  );
}
