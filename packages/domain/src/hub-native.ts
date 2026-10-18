import { z } from 'zod';
import {
  HUB_DISCOVERY_CANDIDATE,
  HUB_ENDPOINT,
  HUB_FINGERPRINT,
  HUB_IDENTITY,
} from './hub-connections';
import type {
  NativeHubResourceOpen,
  NativeHubResource,
  NativeHubResourceDownload,
  NativeHubResourceDownloadResult,
} from './hub-native-resources';
export {
  HUB_REQUEST_TIMEOUT_MS,
  HUB_STREAM_IDLE_TIMEOUT_MS,
  HUB_ROUTE_PROBE_TIMEOUT_MS,
  HUB_ROUTE_DOCUMENT_BYTES,
  HUB_ROUTE_LAN_PROBES,
} from './hub-transport-limits';
import type { HubPairingNetwork } from './hub-pairing';
export {
  HUB_PAIRING_INSPECTION,
  HUB_PAIRING_INSPECTION_ID,
  HUB_PAIRING_OBSERVATION,
  HUB_PAIRING_SCOPE_PREFIX,
  HUB_PAIRING_INSPECTION_DEADLINE_MS,
  HUB_PAIRING_CERTIFICATE_MAX_BYTES,
  HUB_PAIRING_CANDIDATE_URL,
} from './hub-pairing';
export type { HubPairingInspection, HubPairingObservation, HubPairingNetwork } from './hub-pairing';

const SCOPE_ID = z.string().min(1);
const CANONICAL_ORIGIN = z.url({ protocol: /^https?$/ }).refine((value) => {
  const url = new URL(value);
  return value === url.origin;
}, 'Canonical hub origin must be an origin without a path, credentials, query or fragment');

export const NATIVE_HUB_CREDENTIAL_BINDING = z.strictObject({
  scopeId: SCOPE_ID,
  canonicalOrigin: CANONICAL_ORIGIN,
  hubId: HUB_FINGERPRINT,
  principalId: z.string().min(1),
  credentialKind: z.enum(['client', 'server', 'health-source', 'node']),
  credentialGeneration: z.int().nonnegative(),
});
export type NativeHubCredentialBinding = z.infer<typeof NATIVE_HUB_CREDENTIAL_BINDING>;

export const NATIVE_HUB_TRUST = z.strictObject({
  scopeId: SCOPE_ID,
  identity: HUB_IDENTITY,
  endpoints: z
    .array(HUB_ENDPOINT)
    .min(1)
    .refine(
      (endpoints) =>
        new Set(endpoints.map((endpoint) => new URL(endpoint.url).origin)).size ===
        endpoints.length,
      'Hub endpoint origins must be unique',
    ),
  lanAddresses: z.array(z.union([z.ipv4(), z.ipv6()])),
});
export type NativeHubTrust = z.infer<typeof NATIVE_HUB_TRUST>;

export const NATIVE_HUB_ROUTE_CONFIGURATION = z
  .strictObject({
    trust: NATIVE_HUB_TRUST,
    canonicalOrigin: CANONICAL_ORIGIN,
    bindings: z.array(NATIVE_HUB_CREDENTIAL_BINDING).min(1),
  })
  .refine(
    (configuration) =>
      configuration.bindings.every(
        (binding) =>
          binding.scopeId === configuration.trust.scopeId &&
          binding.canonicalOrigin === configuration.canonicalOrigin &&
          binding.hubId === configuration.trust.identity.id,
      ),
    'Credential bindings must match the configured scope, canonical origin and hub identity',
  );
export type NativeHubRouteConfiguration = z.infer<typeof NATIVE_HUB_ROUTE_CONFIGURATION>;

const ROUTE_SNAPSHOT = {
  scopeId: SCOPE_ID,
  canonicalOrigin: CANONICAL_ORIGIN,
  hubId: HUB_FINGERPRINT,
  routeGeneration: z.int().nonnegative(),
  networkGeneration: z.int().nonnegative(),
  detail: z.string(),
};
export const NATIVE_HUB_ROUTE_SNAPSHOT = z.discriminatedUnion('readiness', [
  z.object({ ...ROUTE_SNAPSHOT, readiness: z.literal('pending') }),
  z.object({ ...ROUTE_SNAPSHOT, readiness: z.literal('ready'), endpoint: HUB_ENDPOINT }),
  z.object({ ...ROUTE_SNAPSHOT, readiness: z.literal('unavailable') }),
]);
export type NativeHubRouteSnapshot = z.infer<typeof NATIVE_HUB_ROUTE_SNAPSHOT>;

export interface NativeHubRouteAuthority {
  configure(configuration: NativeHubRouteConfiguration): Promise<NativeHubRouteSnapshot>;
  clear(scopeId: string): Promise<void>;
  refresh(scopeId: string): Promise<NativeHubRouteSnapshot>;
  state(scopeId: string): Promise<NativeHubRouteSnapshot>;
  subscribe(listener: (state: NativeHubRouteSnapshot) => void): () => void;
}

export const NATIVE_HUB_REQUEST = z.strictObject({
  scopeId: SCOPE_ID,
  binding: NATIVE_HUB_CREDENTIAL_BINDING.optional(),
  routeGeneration: z.int().nonnegative().optional(),
  url: z.url({ protocol: /^https?$/ }),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  headers: z.record(z.string().min(1), z.string()),
  body: z.string().nullable(),
});
export type NativeHubRequest = z.infer<typeof NATIVE_HUB_REQUEST>;

export const NATIVE_HUB_RESPONSE = z.object({
  status: z.int().min(100).max(599),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
});
export type NativeHubResponse = z.infer<typeof NATIVE_HUB_RESPONSE>;

export const NATIVE_HUB_DISCOVERY = z.object({
  generation: z.int().nonnegative(),
  state: z.enum(['idle', 'searching', 'permission-required', 'unsupported', 'unavailable']),
  detail: z.string(),
  candidates: z.array(HUB_DISCOVERY_CANDIDATE),
});
export type NativeHubDiscovery = z.infer<typeof NATIVE_HUB_DISCOVERY>;

export interface NativeHubCapabilities {
  readonly http: boolean;
  readonly websocket: boolean;
  readonly media: boolean;
  readonly routeAuthority?: boolean;
  readonly background?: boolean;
  readonly image?: boolean;
  readonly httpMedia?: boolean;
  readonly mse?: boolean;
  readonly html?: boolean;
  readonly download?: boolean;
  readonly pairingInspection?: boolean;
}
export const NATIVE_HUB_CAPABILITIES: z.ZodType<NativeHubCapabilities> = z.strictObject({
  http: z.boolean(),
  websocket: z.boolean(),
  media: z.boolean(),
  routeAuthority: z.exactOptional(z.boolean()),
  background: z.exactOptional(z.boolean()),
  image: z.exactOptional(z.boolean()),
  httpMedia: z.exactOptional(z.boolean()),
  mse: z.exactOptional(z.boolean()),
  html: z.exactOptional(z.boolean()),
  download: z.exactOptional(z.boolean()),
  pairingInspection: z.exactOptional(z.boolean()),
});

export const NATIVE_HUB_SOCKET_OPEN = z.strictObject({
  scopeId: SCOPE_ID,
  binding: NATIVE_HUB_CREDENTIAL_BINDING.optional(),
  routeGeneration: z.int().nonnegative().optional(),
  id: z.string().min(1),
  url: z.url({ protocol: /^wss?$/ }),
  protocols: z.array(z.string().min(1)),
});
export type NativeHubSocketOpen = z.infer<typeof NATIVE_HUB_SOCKET_OPEN>;
export const NATIVE_HUB_SOCKET_DATA = z.union([z.string(), z.array(z.int().min(0).max(255))]);
export const NATIVE_HUB_SOCKET_SEND = z.strictObject({
  id: z.string().min(1),
  data: NATIVE_HUB_SOCKET_DATA,
});
export type NativeHubSocketSend = z.infer<typeof NATIVE_HUB_SOCKET_SEND>;
export const NATIVE_HUB_SOCKET_EVENT = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('open'), protocol: z.string() }),
  z.object({ id: z.string(), kind: z.literal('message'), data: NATIVE_HUB_SOCKET_DATA }),
  z.object({
    id: z.string(),
    kind: z.literal('close'),
    code: z.int(),
    reason: z.string(),
  }),
]);
export type NativeHubSocketEvent = z.infer<typeof NATIVE_HUB_SOCKET_EVENT>;
export interface NativeHubNetwork extends HubPairingNetwork {
  readonly capabilities: NativeHubCapabilities;
  readonly routeAuthority?: NativeHubRouteAuthority;
  openResource?(request: NativeHubResourceOpen): Promise<NativeHubResource>;
  releaseResource?(id: string): Promise<void>;
  downloadResource?(request: NativeHubResourceDownload): Promise<NativeHubResourceDownloadResult>;
  configureTrust(trust: NativeHubTrust): Promise<void>;
  clearTrust(scopeId: string): Promise<void>;
  request?(request: NativeHubRequest): Promise<NativeHubResponse>;
  startDiscovery(): Promise<NativeHubDiscovery>;
  stopDiscovery(): Promise<void>;
  subscribeDiscovery(listener: (state: NativeHubDiscovery) => void): () => void;
  startNetwork(): Promise<NativeHubNetworkChange>;
  stopNetwork(): Promise<void>;
  subscribeNetwork(listener: (state: NativeHubNetworkChange) => void): () => void;
  openSocket?(request: NativeHubSocketOpen): Promise<void>;
  sendSocket?(request: NativeHubSocketSend): Promise<void>;
  closeSocket?(id: string): Promise<void>;
  subscribeSockets?(listener: (state: NativeHubSocketEvent) => void): () => void;
}

export const NATIVE_HUB_NETWORK_CHANGE = z.object({
  generation: z.int().nonnegative(),
  state: z.enum(['watching', 'unsupported', 'unavailable']),
  detail: z.string(),
});
export type NativeHubNetworkChange = z.infer<typeof NATIVE_HUB_NETWORK_CHANGE>;
