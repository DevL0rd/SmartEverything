import type { BuiltinPlugin } from './contract';
import { adguardPlugin } from './adguard';
import { routerPlugin } from './router';
import { syncthingPlugin } from './syncthing';

export const BUILTIN_PLUGINS: readonly BuiltinPlugin[] = [routerPlugin, syncthingPlugin, adguardPlugin];
