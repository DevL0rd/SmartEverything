import { z } from 'zod';
import { HUB_TLS_IDENTITY } from './hub-connections';

export const HUB_PAIRING_INSPECTION_DEADLINE_MS = 4000;
export const HUB_PAIRING_SCOPE_PREFIX = 'pairing:';
export const HUB_PAIRING_CERTIFICATE_MAX_BYTES = 16 * 1024;
export const HUB_PAIRING_INSPECTION_ID = z.string().min(1).max(100);
export const HUB_PAIRING_CANDIDATE_URL = z
  .url({ protocol: /^https$/ })
  .max(200)
  .refine((value) => {
    const url = new URL(value);
    const address = url.hostname.replace(/^\[|\]$/g, '');
    return (
      z.union([z.ipv4(), z.ipv6()]).safeParse(address).success &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === '' &&
      url.pathname === '/' &&
      !value.slice('https://'.length).includes('/')
    );
  }, 'Pairing inspection requires an exact literal-IP HTTPS origin');

export const HUB_PAIRING_INSPECTION = z.strictObject({
  requestId: HUB_PAIRING_INSPECTION_ID,
  generation: z.int().nonnegative(),
  url: HUB_PAIRING_CANDIDATE_URL,
  serverName: HUB_TLS_IDENTITY.shape.serverName.optional(),
});
export type HubPairingInspection = z.infer<typeof HUB_PAIRING_INSPECTION>;

export const HUB_PAIRING_OBSERVATION = z
  .strictObject({
    kind: z.literal('observed'),
    requestId: HUB_PAIRING_INSPECTION_ID,
    generation: z.int().nonnegative(),
    url: HUB_PAIRING_CANDIDATE_URL,
    address: z.union([z.ipv4(), z.ipv6()]),
    port: z.int().min(1).max(65535),
    tls: HUB_TLS_IDENTITY,
    validFrom: z.iso.datetime(),
    validTo: z.iso.datetime(),
  })
  .refine((value) => {
    const url = new URL(value.url);
    const address = value.address.includes(':') ? `[${value.address}]` : value.address;
    return (
      url.hostname === new URL(`https://${address}`).hostname &&
      Number(url.port === '' ? '443' : url.port) === value.port &&
      Date.parse(value.validFrom) < Date.parse(value.validTo)
    );
  }, 'Observed address, port and validity must match the inspected candidate');
export type HubPairingObservation = z.infer<typeof HUB_PAIRING_OBSERVATION>;

export interface HubPairingNetwork {
  inspectCandidate?(request: HubPairingInspection): Promise<HubPairingObservation>;
  cancelInspection?(requestId: string): Promise<void>;
}
