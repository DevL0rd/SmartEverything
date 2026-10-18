import { pluginStreamKey } from '@smarteverything/domain';
import {
  SHELLY_ACTIONS,
  SHELLY_PLUGIN_ID,
  SHELLY_SETTING_ROWS,
  SHELLY_SNAPSHOT_STREAM,
  shellyOperation,
  type ShellyAction,
  type ShellyDevice,
} from '@smarteverything/shelly';
import type { Device, StoreState } from '../../store/state';
import type { PluginDeviceSearchItem } from '../contract';
import { isListedAction } from './action-list';
import { managedInstance } from './component-instances';
import { recordOf } from './form-model';
import { actionAvailable } from './presence-operation';
import { PRESENCE_INVENTORY } from './presence-data';
import { PRESENCE_PAGE_ICONS } from './presence-pages';
import { RESOURCE_CREATE_ACTIONS } from './resource-pages';

type Query = Readonly<Record<string, string>>;

const NEW_ITEM: Query = { item: 'new' };

function iconOf(page: string): PluginDeviceSearchItem['icon'] {
  return PRESENCE_PAGE_ICONS[page] ?? 'settings';
}

function queryOf(action: ShellyAction): Query | null {
  if (action === 'add_zone') return { focus: 'add-zone' };
  if (RESOURCE_CREATE_ACTIONS.includes(action)) return NEW_ITEM;
  return isListedAction(action) ? { action } : null;
}

function settingItems(sensor: ShellyDevice): readonly PluginDeviceSearchItem[] {
  const available = new Set(
    sensor.features.filter((feature) => feature.available).map((feature) => feature.id),
  );
  return SHELLY_SETTING_ROWS.filter(
    (row) => available.has(row.id) && row.kind !== 'stored_values',
  ).map((row) => ({
    id: row.id,
    title: row.title,
    page: row.page,
    focus: row.group,
    keywords: [...row.keywords],
    icon: iconOf(row.page),
    group: 'setting',
  }));
}

function actionItems(sensor: ShellyDevice): readonly PluginDeviceSearchItem[] {
  return SHELLY_ACTIONS.filter((action) => actionAvailable(sensor, action)).flatMap((action) => {
    const query = queryOf(action);
    if (query === null) return [];
    const { title, page, group, keywords } = shellyOperation(action);
    return [
      {
        id: action,
        title,
        page,
        focus: group,
        keywords: [...keywords, title],
        icon: iconOf(page),
        group: 'action' as const,
        query,
      },
    ];
  });
}

function namedItems(sensor: ShellyDevice): readonly PluginDeviceSearchItem[] {
  const zones = sensor.zones.map((zone) => ({
    id: `zone:${zone.key}`,
    title: zone.config.name ?? (zone.main ? 'Main zone' : zone.key),
    page: 'presence-room',
    focus: 'zones',
    keywords: ['zone', 'presence'],
    icon: iconOf('presence-room'),
    group: 'setting' as const,
    query: { zone: String(zone.config.id) },
  }));
  const components = sensor.components
    .filter((component) => managedInstance(component.component))
    .map((component) => {
      const name = recordOf(component.config)?.['name'];
      return {
        id: `component:${component.key}`,
        title: typeof name === 'string' && name !== '' ? name : component.key,
        page: 'presence-components',
        focus: 'edit',
        keywords: [component.key, component.component],
        icon: iconOf('presence-components'),
        group: 'setting' as const,
        query: { component: component.key },
      };
    });
  return [...zones, ...components];
}

export function presenceSearch(
  device: Device,
  streams: StoreState['tables']['plugin_streams'],
): readonly PluginDeviceSearchItem[] {
  const row = streams.byId[pluginStreamKey(SHELLY_PLUGIN_ID, SHELLY_SNAPSHOT_STREAM)];
  if (row === undefined) return [];
  const inventory = PRESENCE_INVENTORY.read(row);
  if (inventory.state !== 'ready') return [];
  const sensor = inventory.value.devices.find((item) => item.externalId === device.external_id);
  if (sensor === undefined) return [];
  return [...settingItems(sensor), ...actionItems(sensor), ...namedItems(sensor)];
}
