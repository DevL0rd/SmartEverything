import type { CatalogueEntry } from './capabilities';

export const PHONE_CAPABILITY_CATALOGUE = {
  charger: {
    label: 'Charger',
    group: 'power',
    kind: 'enum',
    keywords: ['plugged', 'wireless', 'usb', 'dock', 'charging'],
  },
  charge_full_at: {
    label: 'Full at',
    group: 'power',
    kind: 'text',
    keywords: ['charged', 'time to full', 'charging'],
  },
  battery_temperature: {
    label: 'Battery temperature',
    group: 'sensor',
    kind: 'number',
    keywords: ['hot', 'warm', 'heat'],
  },
  power_save: {
    label: 'Battery saver',
    group: 'power',
    kind: 'boolean',
    keywords: ['power saving', 'low power'],
  },
  thermal_state: {
    label: 'Heat',
    group: 'system',
    kind: 'enum',
    keywords: ['hot', 'throttling', 'thermal', 'overheating'],
  },
  ring_volume: {
    label: 'Ring volume',
    group: 'media',
    kind: 'number',
    keywords: ['ringtone', 'ringer volume', 'loud'],
  },
  alarm_volume: {
    label: 'Alarm volume',
    group: 'media',
    kind: 'number',
    keywords: ['alarm clock', 'loud'],
  },
  notification_volume: {
    label: 'Notification volume',
    group: 'media',
    kind: 'number',
    keywords: ['alerts', 'sounds', 'loud'],
  },
  in_call: {
    label: 'In a call',
    group: 'system',
    kind: 'boolean',
    keywords: ['phone call', 'talking'],
  },
  auto_brightness: {
    label: 'Auto brightness',
    group: 'lighting',
    kind: 'boolean',
    keywords: ['adaptive', 'screen'],
  },
  ringing: {
    label: 'Ringing',
    group: 'system',
    kind: 'boolean',
    keywords: ['find my phone', 'locating'],
  },
  notification_count: {
    label: 'Notifications',
    group: 'system',
    kind: 'number',
    keywords: ['unread', 'alerts'],
  },
  next_alarm: {
    label: 'Next alarm',
    group: 'system',
    kind: 'text',
    keywords: ['wake up', 'clock'],
  },
} as const satisfies Record<string, CatalogueEntry>;
