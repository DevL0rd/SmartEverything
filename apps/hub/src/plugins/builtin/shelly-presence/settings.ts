import { z } from 'zod';
import type { PluginContext } from '../contract';

export const SHELLY_SETTINGS = z.strictObject({ paused: z.boolean().default(false) });
export type ShellySettings = z.output<typeof SHELLY_SETTINGS>;
export const SHELLY_SETTINGS_FORM = {
  paused: {
    type: 'boolean',
    title: 'Pause Shelly connections',
    description: 'Stop local traffic to enrolled sensors.',
  },
} as const;

export type ShellyContext = Pick<
  PluginContext<ShellySettings>,
  | 'records'
  | 'secrets'
  | 'tools'
  | 'devices'
  | 'data'
  | 'search'
  | 'settings'
  | 'settingsChanged'
  | 'signal'
  | 'clients'
  | 'viewers'
  | 'log'
>;
