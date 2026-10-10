import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  readRouterMonitorConfig,
  RouterMonitorImportError,
  type RouterMonitorImport,
} from '../router-monitor-config';
import { expandHome } from '../user-directories';

const ROUTER_MONITOR_CONFIG = z.object({
  host: z.string().trim().min(1),
  user: z.string().trim().min(1).default('admin'),
  ssh_key: z.string().trim().min(1).default('~/.ssh/id_ed25519'),
  remote_script: z.string().trim().min(1).default('/jffs/lrm-collect.sh'),
  ping_target: z.string().trim().min(1).default('8.8.8.8'),
});

export const SSH_KEY_SECRET = 'ssh_key';

export async function importRouterMonitor(): Promise<RouterMonitorImport> {
  const config = ROUTER_MONITOR_CONFIG.safeParse(await readRouterMonitorConfig());
  if (!config.success) {
    throw new RouterMonitorImportError('Router Monitor has no router address saved');
  }
  const sshKey = await readFile(expandHome(config.data.ssh_key), 'utf8').catch(() => {
    throw new RouterMonitorImportError('The SSH key Router Monitor uses could not be read');
  });
  return {
    settings: {
      host: config.data.host,
      user: config.data.user,
      remote_script: config.data.remote_script,
      ping_target: config.data.ping_target,
    },
    secrets: { [SSH_KEY_SECRET]: sshKey },
  };
}
