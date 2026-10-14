import { SHELLY_PRESENCE_PAGES, type DeviceRow } from '@smarteverything/domain';
import type { DevicePageContribution } from '../../app-shell/device-page-types';
import type { IconName } from '../../components/icon';

export const PRESENCE_PAGE_ICONS: Readonly<Record<string, IconName>> = {
  'presence-room': 'grid',
  'presence-detection': 'motion',
  'presence-tuning': 'customize',
  'presence-light': 'sun',
  'presence-network': 'wifi',
  'presence-connectivity': 'link',
  'presence-device': 'settings',
  'presence-schedules': 'calendar',
  'presence-actions': 'automations',
  'presence-scripts': 'fileText',
  'presence-components': 'layers',
  'presence-storage': 'box',
  'presence-diagnostics': 'activity',
};

export function presencePages(device: DeviceRow): readonly DevicePageContribution[] {
  if (!device.external_id.startsWith('shelly-presence:') || device.parent_id !== null) return [];
  return SHELLY_PRESENCE_PAGES.map((page) => ({
    id: page.id,
    title: page.title,
    subtitle: page.keywords.join(', '),
    icon: PRESENCE_PAGE_ICONS[page.id] ?? 'settings',
    keywords: page.keywords,
    settings: [],
  }));
}
