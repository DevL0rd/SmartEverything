import type {
  ShellyPresenceDevice,
  ShellyPresenceField,
  ShellyPresenceOperationDescriptor,
} from '@smarteverything/domain';
import type { PluginDeviceSearchItem } from '../contract';
import { PRESENCE_PAGE_ICONS } from './presence-pages';
import { ACTION_FORMS } from './action-forms';

export function fieldSearchItems(
  sensor: ShellyPresenceDevice,
  field: ShellyPresenceField,
): readonly PluginDeviceSearchItem[] {
  const item: PluginDeviceSearchItem = {
    id: field.id,
    title: field.title,
    page: field.page,
    focus: field.focus,
    keywords: field.keywords,
    icon: PRESENCE_PAGE_ICONS[field.page] ?? 'settings',
    group: 'setting',
    query: { field: field.id },
  };
  if (field.component === 'presencezone')
    return sensor.zones.map((zone) => ({
      ...item,
      id: `${field.id}:${zone.key}`,
      title: `${zone.config.name ?? zone.key} · ${field.title}`,
      query: { ...item.query, zone: String(zone.config.id) },
    }));
  const components = sensor.components.filter(
    (component) => component.component === field.component,
  );
  if (
    [
      'boolean',
      'number',
      'enum',
      'text',
      'button',
      'group',
      'bthomedevice',
      'bthomesensor',
    ].includes(field.component)
  )
    return components.map((component) => ({
      ...item,
      id: `${field.id}:${component.key}`,
      query: { ...item.query, component: component.key },
    }));
  return [item];
}

export function operationSearchItems(
  operation: ShellyPresenceOperationDescriptor,
): readonly PluginDeviceSearchItem[] {
  const item: PluginDeviceSearchItem = {
    id: operation.action,
    title: operation.title,
    page: operation.page,
    focus: operation.focus,
    keywords: operation.keywords,
    icon: PRESENCE_PAGE_ICONS[operation.page] ?? 'settings',
    group: 'action',
    query: { action: operation.action },
  };
  const fields = ACTION_FORMS.find((form) => form.action === operation.action)?.fields ?? [];
  return [
    item,
    ...fields.map((field) => ({
      ...item,
      id: `${item.id}:${field.path}`,
      title: field.title,
      group: 'setting' as const,
      keywords: [...item.keywords, field.title],
      query: { action: operation.action, param: field.path },
    })),
  ];
}
