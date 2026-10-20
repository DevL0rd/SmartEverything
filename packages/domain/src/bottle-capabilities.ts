import type { CatalogueEntry } from './capabilities';

const BOTTLE_WORDS = ['water bottle', 'bottle', 'larq', 'purevis', 'hydration'] as const;

export const BOTTLE_CAPABILITY_CATALOGUE = {
  bottle_volume: {
    label: 'Water in bottle',
    group: 'water',
    kind: 'number',
    keywords: [...BOTTLE_WORDS, 'level', 'millilitres', 'ml', 'how much water'],
  },
  bottle_state: {
    label: 'Cap',
    group: 'water',
    kind: 'enum',
    keywords: [...BOTTLE_WORDS, 'cap light', 'ring', 'state', 'uv'],
  },
  bottle_charging: {
    label: 'Cap charging',
    group: 'water',
    kind: 'enum',
    keywords: [...BOTTLE_WORDS, 'charge', 'charged', 'usb'],
  },
  bottle_link: {
    label: 'Bottle sync',
    group: 'water',
    kind: 'enum',
    keywords: [...BOTTLE_WORDS, 'asleep', 'bluetooth', 'synced'],
  },
  bottle_reliable: {
    label: 'Level trustworthy',
    group: 'water',
    kind: 'boolean',
    keywords: [...BOTTLE_WORDS, 'reliable', 'accurate', 'tilted'],
  },
  uv_clean: {
    label: 'UV clean',
    group: 'water',
    kind: 'enum',
    keywords: [...BOTTLE_WORDS, 'sterilise', 'sterilize', 'clean', 'stop cleaning'],
  },
  last_uv_clean: {
    label: 'Last UV clean',
    group: 'water',
    kind: 'text',
    keywords: [...BOTTLE_WORDS, 'cleaned', 'sterilised'],
  },
  last_drink: {
    label: 'Last drink',
    group: 'water',
    kind: 'text',
    keywords: [...BOTTLE_WORDS, 'sip', 'drank', 'drink'],
  },
  last_seen: {
    label: 'Last seen',
    group: 'system',
    kind: 'text',
    keywords: ['awake', 'woke', 'heard', 'asleep'],
  },
  hydration_reminder: {
    label: 'Drink reminder',
    group: 'water',
    kind: 'enum',
    keywords: [...BOTTLE_WORDS, 'reminder', 'nudge', 'light flash'],
  },
  reminder_interval: {
    label: 'Reminder every',
    group: 'water',
    kind: 'number',
    keywords: [...BOTTLE_WORDS, 'reminder', 'interval', 'minutes'],
  },
  reminder_from: {
    label: 'Reminders start',
    group: 'water',
    kind: 'text',
    keywords: [...BOTTLE_WORDS, 'reminder', 'window', 'from'],
  },
  reminder_to: {
    label: 'Reminders end',
    group: 'water',
    kind: 'text',
    keywords: [...BOTTLE_WORDS, 'reminder', 'window', 'until'],
  },
  reminder_colour: {
    label: 'Reminder colour',
    group: 'water',
    kind: 'color',
    keywords: [...BOTTLE_WORDS, 'reminder', 'ring colour', 'light colour'],
  },
  quiet_hours: {
    label: 'Quiet hours',
    group: 'water',
    kind: 'enum',
    keywords: [...BOTTLE_WORDS, 'do not disturb', 'dnd', 'silent', 'sleep'],
  },
  quiet_from: {
    label: 'Quiet hours start',
    group: 'water',
    kind: 'text',
    keywords: [...BOTTLE_WORDS, 'do not disturb', 'from'],
  },
  quiet_to: {
    label: 'Quiet hours end',
    group: 'water',
    kind: 'text',
    keywords: [...BOTTLE_WORDS, 'do not disturb', 'until'],
  },
  bottle_sync: {
    label: 'Sync bottle',
    group: 'water',
    kind: 'action',
    keywords: [...BOTTLE_WORDS, 'sync', 'refresh', 'update', 'read now'],
  },
  measure_level: {
    label: 'Measure level',
    group: 'water',
    kind: 'action',
    keywords: [...BOTTLE_WORDS, 'measure', 'how full', 'read level'],
  },
} as const satisfies Record<string, CatalogueEntry>;

export type BottleCapability = keyof typeof BOTTLE_CAPABILITY_CATALOGUE;
