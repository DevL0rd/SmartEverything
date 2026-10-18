import { z } from 'zod';
import type { HarnessHost } from '../host/contracts';
import {
  AI_HARNESS_PERMISSION_WRITE,
  HARNESS_DESIRED_CONFIGURATION,
} from '@smarteverything/domain';

export const HARNESS_BOOT = z.strictObject({
  type: z.literal('harness_boot'),
  protocol: z.literal(1),
  device_id: z.uuid(),
  generation: z.uuid(),
  runtime_instance: z.uuid(),
  name: z.string().min(1).max(200),
  hub_url: z.url(),
  token: z.string().min(1).max(1000),
  home_directory: z.string().min(1).max(4096),
  state_directory: z.string().min(1).max(4096),
  platform: z.enum(['linux', 'macos', 'windows']),
  permission: AI_HARNESS_PERMISSION_WRITE,
  configuration_sync: z.boolean().optional(),
  configuration: HARNESS_DESIRED_CONFIGURATION.optional(),
});
export type HarnessBoot = z.infer<typeof HARNESS_BOOT>;

export function processHarnessHost(boot: HarnessBoot): HarnessHost {
  return {
    target: { kind: 'device', device_id: boot.device_id },
    name: boot.name,
    platform: boot.platform,
    homeDirectory: boot.home_directory,
    stateDirectory: boot.state_directory,
  };
}
