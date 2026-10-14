import {
  SHELLY_PRESENCE_FIELDS,
  SHELLY_PRESENCE_OPERATIONS,
  SHELLY_PRESENCE_SNAPSHOT,
  SHELLY_PRESENCE_PLUGIN_ID,
  SHELLY_PRESENCE_STREAM,
  pluginStreamKey,
  type ShellyPresenceDevice,
} from '@smarteverything/domain';
import type { PluginDeviceSearchItem } from '../contract';
import type { Device, StoreState } from '../../store/state';
import { fieldSearchItems } from './search-items';
import { targetedOperationSearch } from './search-targets';
import { resourceSearchItems } from './search-resources';
import { presenceActionAvailable, presenceFeature } from './availability';

const MAP_CONTROLS = [
  'Paint',
  'Erase',
  'Select',
  'Undo',
  'Redo',
  'Zoom in',
  'Zoom out',
  'Fit',
  'Show other areas',
  'Use keyboard grid',
  'Cursor x',
  'Cursor y',
  'Position cursor',
  'Paint cell',
  'Erase cell',
  'Add segment',
  'Remove segment',
  'X start',
  'Y start',
  'X end',
  'Y end',
  'Back to zones',
];

export function presenceSearch(
  device: Device,
  streams: StoreState['tables']['plugin_streams'],
): readonly PluginDeviceSearchItem[] {
  const row = streams.byId[pluginStreamKey(SHELLY_PRESENCE_PLUGIN_ID, SHELLY_PRESENCE_STREAM)];
  if (row === undefined) return [];
  const parsed = SHELLY_PRESENCE_SNAPSHOT.safeParse(row.value);
  if (!parsed.success) return [];
  const sensor = parsed.data.devices.find((item) => item.externalId === device.external_id);
  if (sensor === undefined) return [];
  const fields = SHELLY_PRESENCE_FIELDS.filter(
    (field) => presenceFeature(sensor, field.id) !== undefined,
  ).flatMap((field) => fieldSearchItems(sensor, field));
  const actions = SHELLY_PRESENCE_OPERATIONS.filter((operation) =>
    presenceActionAvailable(sensor, operation.action),
  ).flatMap((operation) => targetedOperationSearch(sensor, operation));
  const map = MAP_CONTROLS.map((title) => ({
    id: `map:${title}`,
    title,
    page: 'presence-room',
    focus: 'zone-map',
    keywords: ['map', 'zone', title],
    icon: 'grid' as const,
    group: 'setting' as const,
    query: { zone: sensor.zones.find((zone) => zone.main)?.key ?? 'new' },
  }));
  const additional = additionalControls(sensor);
  return [...fields, ...actions, ...map, ...additional, ...resourceSearchItems(sensor)];
}

function additionalControls(sensor: ShellyPresenceDevice): readonly PluginDeviceSearchItem[] {
  const deviceControls = [
    'Choose firmware file',
    'Upload selected firmware',
    'Abort upload session',
    'Accepted bytes',
  ].map((title) => ({
    id: `firmware:${title}`,
    title,
    page: 'presence-device',
    focus: 'firmware-upload',
    keywords: ['firmware', title],
    icon: 'upload' as const,
    group: 'action' as const,
  }));
  const diagnostics = [
    'Sensor identity',
    'Device health',
    'Export device information',
    'Export device logs',
    'Export saved log file',
    'Saved device logs',
  ].map((title) => ({
    id: `diagnostics:${title}`,
    title,
    page: 'presence-diagnostics',
    focus: 'health',
    keywords: ['diagnostics', title],
    icon: 'activity' as const,
    group: 'setting' as const,
    ...(title.includes('log')
      ? {
          query: {
            action:
              title.includes('saved') || title === 'Saved device logs'
                ? 'device_log_files'
                : 'device_logs',
          },
        }
      : {}),
  }));
  return [...deviceControls, ...diagnostics, ...componentControls(sensor)];
}
function componentControls(sensor: ShellyPresenceDevice): readonly PluginDeviceSearchItem[] {
  return [
    'Component type',
    'Component ID',
    'Component name',
    'Value',
    'Toggle value',
    'Metadata',
    'Display name',
    'Number control step',
    'Icon',
    'Display style',
    'Unit',
    'Visible',
    'Display order',
    'Labels',
    'Button icon',
    'Images',
    'Clear appearance overrides',
    'Ordered group members',
    'Move earlier',
    'Read known Bluetooth objects',
  ].flatMap((title) =>
    sensor.components
      .filter((entry) =>
        [
          'boolean',
          'number',
          'enum',
          'text',
          'button',
          'group',
          'bthomedevice',
          'bthomesensor',
        ].includes(entry.component),
      )
      .map((entry) => ({
        id: `${entry.key}:${title}`,
        title,
        page: 'presence-components',
        focus: 'edit',
        keywords: [entry.key, title],
        icon: 'layers' as const,
        group: 'setting' as const,
        query: { component: entry.key, control: title },
      })),
  );
}
