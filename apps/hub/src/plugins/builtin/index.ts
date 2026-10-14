import { shellyPresencePlugin } from './shelly-presence';
import type { BuiltinPlugin } from './contract';
import { adguardPlugin } from './adguard';
import { aibiPlugin } from './aibi';
import { discordPlugin } from './discord';
import { routerPlugin } from './router';
import { syncthingPlugin } from './syncthing';

export const BUILTIN_PLUGINS: readonly BuiltinPlugin[] = [
  shellyPresencePlugin,
  routerPlugin,
  syncthingPlugin,
  adguardPlugin,
  discordPlugin,
  aibiPlugin,
];
