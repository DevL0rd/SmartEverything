import { z } from 'zod';

export const SHELLY_PRESENCE_PLUGIN_ID = 'shelly-presence';
export const SHELLY_PRESENCE_STREAM = 'shelly-presence.snapshot';
export const SHELLY_PRESENCE_OPERATION_CAPABILITY = 'raw:shelly.operation';
export const SHELLY_PRESENCE_DETECTION_CAPABILITY = 'raw:shelly.detection_enabled';
export const SHELLY_PRESENCE_PAGES = [
  {
    id: 'presence-room',
    title: 'Room and zones',
    keywords: ['map', 'room', 'zones', 'blind spots', 'ignore curtains'],
  },
  {
    id: 'presence-detection',
    title: 'Detection and mounting',
    keywords: ['radar', 'mount', 'height', 'sensitivity', 'calibrate'],
  },
  {
    id: 'presence-tuning',
    title: 'Fine-tuning',
    keywords: ['threshold', 'motion', 'stillness', 'tracking'],
  },
  {
    id: 'presence-light',
    title: 'Light and indicator',
    keywords: ['lux', 'dark', 'bright', 'led', 'night'],
  },
  {
    id: 'presence-network',
    title: 'Network',
    keywords: ['wifi', 'bluetooth', 'address', 'signal'],
  },
  {
    id: 'presence-connectivity',
    title: 'Integrations',
    keywords: ['mqtt', 'cloud', 'matter', 'zigbee', 'websocket'],
  },
  {
    id: 'presence-device',
    title: 'Device',
    keywords: ['firmware', 'restart', 'reset', 'clock', 'security'],
  },
  {
    id: 'presence-schedules',
    title: 'On-device schedules',
    keywords: ['timer', 'cron', 'sunrise', 'sunset'],
  },
  {
    id: 'presence-actions',
    title: 'On-device actions',
    keywords: ['webhook', 'condition', 'destination'],
  },
  { id: 'presence-scripts', title: 'Scripts', keywords: ['script', 'code', 'evaluate', 'run'] },
  {
    id: 'presence-components',
    title: 'Components',
    keywords: ['virtual', 'bthome', 'bluetooth', 'sensor'],
  },
  { id: 'presence-storage', title: 'Stored values', keywords: ['kvs', 'key', 'value', 'storage'] },
  {
    id: 'presence-diagnostics',
    title: 'Diagnostics',
    keywords: ['fault', 'errors', 'connection', 'refresh', 'log'],
  },
] as const;
export const SHELLY_PRESENCE_PAGE = z.enum(SHELLY_PRESENCE_PAGES.map((page) => page.id));
export type ShellyPresencePage = z.output<typeof SHELLY_PRESENCE_PAGE>;

export function shellyPresenceExternalId(id: string): string {
  return `${SHELLY_PRESENCE_PLUGIN_ID}:${id}`;
}
export function shellyZoneExternalId(id: string, zone: number, generation: number): string {
  const base = `${shellyPresenceExternalId(id)}:presencezone:${String(zone)}`;
  return generation === 0 ? base : `${base}:generation:${String(generation)}`;
}
