import { z } from 'zod';
import { SHELLY_DEVICE } from './read';

export const SHELLY_ADDRESS = z.url({ protocol: /^https?$/ }).refine((address) => {
  const url = new URL(address);
  return (
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    url.hash === '' &&
    (url.pathname === '' || url.pathname === '/')
  );
}, 'Use a local device origin without credentials or a path');
export const SHELLY_TRANSPORT_TLS = z
  .strictObject({
    caPem: z.string().min(1).nullable().default(null),
    clientCertificate: z.string().min(1).nullable().default(null),
    clientKey: z.string().min(1).nullable().default(null),
  })
  .refine(
    (value) => (value.clientCertificate === null) === (value.clientKey === null),
    'Provide both client certificate and client key for mutual TLS',
  );
export type ShellyTransportTls = z.output<typeof SHELLY_TRANSPORT_TLS>;
export const SHELLY_ENROLL_REQUEST = z.strictObject({
  address: SHELLY_ADDRESS,
  tls: SHELLY_TRANSPORT_TLS.nullable().optional(),
  password: z.string().min(1).nullable().default(null),
});
export const SHELLY_ENROLL_RESULT = z.object({ device: SHELLY_DEVICE });
export const SHELLY_FORGET_RESULT = z.object({ removed: z.literal(true) });
export const SHELLY_DISCOVERY_RESULT = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
  candidates: z.array(
    z.object({
      name: z.string(),
      address: z.url(),
      host: z.string(),
      generation: z.string().nullable(),
    }),
  ),
});
export type ShellyDiscoveryResult = z.output<typeof SHELLY_DISCOVERY_RESULT>;
