import { z } from 'zod';
import { NATIVE_HUB_CREDENTIAL_BINDING } from './hub-native';

export const NATIVE_HUB_GUEST_PATH = z.enum([
  '/api/ai/harness/transport',
  '/api/ai/harness/inference',
  '/api/ai/harness/subscription-inference',
]);
export type NativeHubGuestPath = z.infer<typeof NATIVE_HUB_GUEST_PATH>;
export const NATIVE_HUB_GUEST_TRANSPORT = z.object({
  protocol: z.literal(1),
  binding: z.lazy(() => NATIVE_HUB_CREDENTIAL_BINDING),
  deviceId: z.uuid(),
  generation: z.uuid(),
  runtimeInstance: z.uuid(),
  routeGeneration: z.int().nonnegative(),
  localUrl: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'http:' &&
      url.hostname === '127.0.0.1' &&
      Number(url.port) > 0 &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      /^\/guest\/[0-9a-f]{64}$/.test(url.pathname)
    );
  }, 'Guest transport requires an exact loopback grant'),
  expiresAt: z.iso.datetime(),
});
export type NativeHubGuestTransport = z.infer<typeof NATIVE_HUB_GUEST_TRANSPORT>;
