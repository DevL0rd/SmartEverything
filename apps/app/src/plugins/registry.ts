import { shellyPresenceAppPlugin } from './shelly-presence';
import type { AppPlugin } from './contract';
import { adguardAppPlugin } from './adguard';
import { aibiAppPlugin } from './aibi';
import { discordAppPlugin } from './discord';
import { routerAppPlugin } from './router';
import { syncthingAppPlugin } from './syncthing';
import { wizAppPlugin } from './wiz';

export const APP_PLUGINS: readonly AppPlugin[] = [
  shellyPresenceAppPlugin,
  routerAppPlugin,
  syncthingAppPlugin,
  adguardAppPlugin,
  discordAppPlugin,
  aibiAppPlugin,
  wizAppPlugin,
];
