import type { BuiltinPlugin } from './contract';
import { adguardPlugin } from './adguard';
import { aibiPlugin } from './aibi';
import { discordPlugin } from './discord';
import { routerPlugin } from './router';
import { syncthingPlugin } from './syncthing';

export const BUILTIN_PLUGINS: readonly BuiltinPlugin[] = [
  routerPlugin,
  syncthingPlugin,
  adguardPlugin,
  discordPlugin,
  aibiPlugin,
];
