import { z } from 'zod';
import type { HarnessHost } from '../host/contracts';
import {
  AI_HARNESS_PERMISSION_WRITE,
  HARNESS_DESIRED_CONFIGURATION,
  NATIVE_HUB_GUEST_TRANSPORT,
} from '@smarteverything/domain';

export const HARNESS_BOOT = z
  .strictObject({
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
    inbound_execution: z.boolean(),
    permission: AI_HARNESS_PERMISSION_WRITE,
    configuration_sync: z.boolean().optional(),
    configuration: HARNESS_DESIRED_CONFIGURATION.optional(),
    hub_transport: NATIVE_HUB_GUEST_TRANSPORT.optional(),
  })
  .superRefine((boot, context) => {
    const transport = boot.hub_transport;
    if (
      transport !== undefined &&
      (transport.binding.canonicalOrigin !== new URL(boot.hub_url).origin ||
        transport.deviceId !== boot.device_id ||
        transport.generation !== boot.generation ||
        transport.runtimeInstance !== boot.runtime_instance ||
        !['client', 'node'].includes(transport.binding.credentialKind))
    )
      context.addIssue({
        code: 'custom',
        path: ['hub_transport'],
        message: 'Guest transport must match the canonical hub and exact runtime credential.',
      });
  })
  .superRefine((boot, context) => {
    const url = new URL(boot.hub_url);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      context.addIssue({
        code: 'custom',
        path: ['hub_url'],
        message: 'Remote hubs require HTTPS.',
      });
    if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '')
      context.addIssue({
        code: 'custom',
        path: ['hub_url'],
        message: 'Hub URL must not contain credentials, query or fragment.',
      });
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
