import type { ShellyPresenceDevice } from '@smarteverything/domain';
import type { PluginDeviceSearchItem } from '../contract';

const CONTROLS: Readonly<Record<string, readonly string[]>> = {
  'presence-schedules': [
    'Schedule enabled',
    'Days',
    'Time basis',
    'Hour',
    'Minute',
    'Schedule expression',
    'Preview schedule times',
    'Actions',
    'Add action',
    'Move earlier',
    'Remove action',
    'Save schedule',
    'Delete schedule',
  ],
  'presence-actions': [
    'Action name',
    'Enabled',
    'Event',
    'Event component ID',
    'Condition attribute',
    'Comparison',
    'Condition expression',
    'Repeat period',
    'Active hours',
    'Destination',
    'TLS verification',
    'Replace protected destinations',
    'Save action',
    'Delete action',
  ],
  'presence-scripts': [
    'Browse Shelly script library',
    'Use this source draft',
    'Script name',
    'Run on device boot',
    'Load source',
    'JavaScript source',
    'Import JavaScript',
    'Append to existing source',
    'Save source',
    'Start script',
    'Stop script',
    'Expression to evaluate',
    'Evaluate expression',
    'Delete script',
  ],
  'presence-storage': ['Key', 'Typed value', 'Save value', 'Delete value'],
};

function rows(
  page: string,
  items: readonly { readonly id: string; readonly title: string }[],
): readonly PluginDeviceSearchItem[] {
  return items.flatMap((item) => [
    {
      id: `${page}:${item.id}`,
      title: item.title,
      page,
      focus: 'edit',
      keywords: [item.title],
      icon: 'settings' as const,
      group: 'setting' as const,
      query: { item: item.id },
    },
    ...(CONTROLS[page] ?? []).map((control) => ({
      id: `${page}:${item.id}:${control}`,
      title: control,
      page,
      focus: 'edit',
      keywords: [item.title, control],
      icon: 'settings' as const,
      group: 'setting' as const,
      query: { item: item.id },
    })),
  ]);
}

export function resourceSearchItems(
  sensor: ShellyPresenceDevice,
): readonly PluginDeviceSearchItem[] {
  const resources = sensor.resources;
  if (resources === undefined) return [];
  return [
    ...rows(
      'presence-schedules',
      (resources.schedules?.jobs ?? []).map((job) => ({
        id: String(job.id),
        title: job.timespec,
      })),
    ),
    ...rows(
      'presence-actions',
      (resources.webhooks?.hooks ?? []).map((hook) => ({
        id: String(hook.id),
        title: hook.name ?? hook.event,
      })),
    ),
    ...rows(
      'presence-scripts',
      (resources.scripts?.scripts ?? []).map((script) => ({
        id: String(script.id),
        title: script.name ?? `Script ${String(script.id)}`,
      })),
    ),
    ...rows(
      'presence-storage',
      Object.keys(resources.storedValues?.items ?? {}).map((key) => ({
        id: `key:${key}`,
        title: key,
      })),
    ),
  ];
}
