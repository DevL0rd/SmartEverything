import { z } from 'zod';
export const SHELLY_DISCOVERY_RESULT = z.object({
  available: z.boolean(),
  reason: z.string().max(300).nullable(),
  candidates: z
    .array(
      z.object({
        name: z.string().max(100),
        address: z.url(),
        host: z.string().max(300),
        generation: z.string().max(10).nullable(),
      }),
    )
    .max(64),
});
export type ShellyDiscoveryResult = z.output<typeof SHELLY_DISCOVERY_RESULT>;
