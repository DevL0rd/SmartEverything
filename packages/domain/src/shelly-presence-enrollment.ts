import { z } from 'zod';
import { SHELLY_PRESENCE_DEVICE } from './shelly-presence-snapshot';
export const SHELLY_PRESENCE_ADDRESS = z
  .url({ protocol: /^https?$/ })
  .max(300)
  .refine((address) => {
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
    caPem: z.string().min(1).max(65536).nullable().default(null),
    clientCertificate: z.string().min(1).max(65536).nullable().default(null),
    clientKey: z.string().min(1).max(65536).nullable().default(null),
  })
  .refine(
    (value) => (value.clientCertificate === null) === (value.clientKey === null),
    'Provide both client certificate and client key for mutual TLS',
  );
export type ShellyTransportTls = z.output<typeof SHELLY_TRANSPORT_TLS>;
export const SHELLY_PRESENCE_ENROLL_REQUEST = z.strictObject({
  address: SHELLY_PRESENCE_ADDRESS,
  tls: SHELLY_TRANSPORT_TLS.nullable().optional(),
  password: z.string().min(1).max(300).nullable().default(null),
});
export const SHELLY_PRESENCE_ENROLL_RESULT = z.object({ device: SHELLY_PRESENCE_DEVICE });
export const SHELLY_PRESENCE_FORGET_REQUEST = z.strictObject({
  externalId: z.string().min(1).max(200),
});
export const SHELLY_PRESENCE_FORGET_RESULT = z.object({ removed: z.literal(true) });
