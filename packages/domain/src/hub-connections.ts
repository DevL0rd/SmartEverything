import { z } from 'zod';

export const HUB_CONNECTION_PROTOCOL = 1;
export const HUB_DISCOVERY_SERVICE = '_smarteverything._tcp';
export const HUB_IDENTITY_PATH = '/.well-known/smarteverything/identity';

export const HUB_FINGERPRINT = z.string().regex(/^[0-9a-f]{64}$/);

export const HUB_TLS_IDENTITY = z.object({
  serverName: z.string().regex(/^smarteverything-[0-9a-f]{32}\.local$/),
  certificateSha256: HUB_FINGERPRINT,
  publicKeySha256: HUB_FINGERPRINT,
});

export const HUB_IDENTITY = z
  .object({
    id: HUB_FINGERPRINT,
    protocolVersion: z.literal(HUB_CONNECTION_PROTOCOL),
    name: z.string().min(1).max(63),
    tls: HUB_TLS_IDENTITY,
  })
  .refine((identity) => identity.id === identity.tls.publicKeySha256, {
    path: ['id'],
    message: 'Hub identity must equal its TLS public key SHA256',
  });

export type HubIdentity = z.infer<typeof HUB_IDENTITY>;

const ENDPOINT_URL = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return url.username === '' && url.password === '' && url.search === '' && url.hash === '';
}, 'Hub endpoints cannot contain credentials, a query or a fragment');

export const HUB_ENDPOINT = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('loopback'),
    url: ENDPOINT_URL.refine((value) =>
      ['127.0.0.1', '[::1]', 'localhost'].includes(new URL(value).hostname),
    ),
  }),
  z.object({
    kind: z.literal('lan'),
    url: ENDPOINT_URL.refine((value) => new URL(value).protocol === 'https:'),
  }),
  z.object({
    kind: z.literal('remote'),
    url: ENDPOINT_URL.refine((value) => new URL(value).protocol === 'https:'),
  }),
]);

export type HubEndpoint = z.infer<typeof HUB_ENDPOINT>;

export const HUB_DISCOVERY_STATUS = z.object({
  state: z.enum(['disabled', 'starting', 'advertising', 'unavailable']),
  detail: z.string().max(500),
});

export type HubDiscoveryStatus = z.infer<typeof HUB_DISCOVERY_STATUS>;

export const HUB_CONNECTION_METADATA = z.object({
  identity: HUB_IDENTITY,
  endpoints: z.array(HUB_ENDPOINT).max(32),
  remoteAvailable: z.boolean(),
  discovery: HUB_DISCOVERY_STATUS,
});

export type HubConnectionMetadata = z.infer<typeof HUB_CONNECTION_METADATA>;

export const HUB_PUBLIC_IDENTITY = z.object({
  service: z.literal('smarteverything'),
  identity: HUB_IDENTITY,
});

export type HubPublicIdentity = z.infer<typeof HUB_PUBLIC_IDENTITY>;

export const HUB_DISCOVERY_CANDIDATE = z.object({
  name: z.string().min(1).max(63),
  url: ENDPOINT_URL.refine((value) => new URL(value).protocol === 'https:'),
  hubId: HUB_FINGERPRINT.optional(),
  protocolVersion: z.int().positive().optional(),
});

export type HubDiscoveryCandidate = z.infer<typeof HUB_DISCOVERY_CANDIDATE>;
