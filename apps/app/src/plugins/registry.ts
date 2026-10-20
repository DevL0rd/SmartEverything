import { shellyPresenceAppPlugin } from './shelly-presence';
import type { AppPlugin } from './contract';
import { adguardAppPlugin } from './adguard';
import { aibiAppPlugin } from './aibi';
import { discordAppPlugin } from './discord';
import { larqAppPlugin } from './larq';
import { printerAppPlugin } from './printer';
import { routerAppPlugin } from './router';
import { toothbrushAppPlugin } from './toothbrush';
import { syncthingAppPlugin } from './syncthing';
import { treadmillAppPlugin } from './treadmill';
import { wizAppPlugin } from './wiz';
import { currentWidgetType } from './shared/widget-aliases';

export const APP_PLUGINS: readonly AppPlugin[] = [
  shellyPresenceAppPlugin,
  routerAppPlugin,
  syncthingAppPlugin,
  adguardAppPlugin,
  discordAppPlugin,
  aibiAppPlugin,
  wizAppPlugin,
  treadmillAppPlugin,
  toothbrushAppPlugin,
  larqAppPlugin,
  printerAppPlugin,
];

export function currentPluginWidgetType(type: string): string {
  return currentWidgetType(APP_PLUGINS, type);
}
