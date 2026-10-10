import type { AppPlugin } from './contract';
import { adguardAppPlugin } from './adguard';
import { routerAppPlugin } from './router';
import { syncthingAppPlugin } from './syncthing';

export const APP_PLUGINS: readonly AppPlugin[] = [routerAppPlugin, syncthingAppPlugin, adguardAppPlugin];
