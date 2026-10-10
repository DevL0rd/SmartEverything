import { z } from 'zod';
import {
  readRouterMonitorConfig,
  RouterMonitorImportError,
  type RouterMonitorImport,
} from '../router-monitor-config';
import { PASSWORD_SECRET } from './settings';

const ROUTER_MONITOR_ADGUARD = z.object({
  adguard: z.object({
    url: z.url({ protocol: /^https?$/ }),
    username: z.string().trim().min(1),
    password: z.string().min(1),
  }),
});

export async function importAdGuardFromRouterMonitor(): Promise<RouterMonitorImport> {
  const config = ROUTER_MONITOR_ADGUARD.safeParse(await readRouterMonitorConfig());
  if (!config.success) {
    throw new RouterMonitorImportError('Router Monitor has no AdGuard Home sign-in saved');
  }
  const { url, username, password } = config.data.adguard;
  return {
    settings: { url, user: username },
    secrets: { [PASSWORD_SECRET]: password },
  };
}
