import { NativeModule, requireOptionalNativeModule } from 'expo';
import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { z } from 'zod';
import {
  HUB_PAIRING_INSPECTION,
  HUB_PAIRING_INSPECTION_ID,
  HUB_PAIRING_OBSERVATION,
  NATIVE_HUB_DISCOVERY,
  NATIVE_HUB_NETWORK_CHANGE,
  NATIVE_HUB_REQUEST,
  NATIVE_HUB_RESOURCE_OPEN,
  NATIVE_HUB_RESOURCE,
  NATIVE_HUB_RESOURCE_ID,
  NATIVE_HUB_RESOURCE_DOWNLOAD,
  NATIVE_HUB_RESOURCE_DOWNLOAD_RESULT,
  NATIVE_HUB_ROUTE_CONFIGURATION,
  NATIVE_HUB_ROUTE_SNAPSHOT,
  NATIVE_HUB_RESPONSE,
  NATIVE_HUB_SOCKET_EVENT,
  NATIVE_HUB_SOCKET_OPEN,
  NATIVE_HUB_SOCKET_SEND,
  NATIVE_HUB_TRUST,
  type NativeHubCapabilities,
  type NativeHubDiscovery,
  type NativeHubNetwork,
  type NativeHubRouteAuthority,
  type NativeHubRequest,
  type NativeHubResponse,
  type NativeHubTrust,
} from '@smarteverything/domain';
interface HubNetworkEvents {
  readonly onDiscovery: (payload: unknown) => void;
  readonly onNetwork: (payload: unknown) => void;
  readonly onRoute: (payload: unknown) => void;
  readonly onSocket: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}
declare class HubNetworkNative extends NativeModule<HubNetworkEvents> {
  inspectCandidate(json: string): Promise<unknown>;
  cancelInspection(requestId: string): Promise<void>;
  resourcesReady(): boolean;
  openResource(json: string): Promise<unknown>;
  releaseResource(id: string): Promise<void>;
  downloadResource(json: string): Promise<unknown>;
  reserveServerActivation(order: number): unknown;
  activateServerEnrollment(canonical: string, principal: string, intent: string): Promise<unknown>;
  claimServerEnrollment(canonical: string, principal: string, scope: string): Promise<unknown>;
  captureServerEnrollment(canonical: string, principal: string): Promise<unknown>;
  configureRoutes(json: string, enrollment: string): Promise<unknown>;
  clearServerCredential(principal?: string): Promise<void>;
  clearRoutes(scopeId: string): Promise<void>;
  refreshRoutes(scopeId: string): Promise<unknown>;
  routeState(scopeId: string): Promise<unknown>;
  configureTrust(json: string): Promise<void>;
  clearTrust(scopeId: string): Promise<void>;
  request(json: string): Promise<unknown>;
  startDiscovery(): Promise<unknown>;
  stopDiscovery(): Promise<void>;
  startNetwork(): Promise<unknown>;
  stopNetwork(): Promise<void>;
  openSocket(json: string): Promise<void>;
  sendSocket(json: string): Promise<void>;
  closeSocket(id: string): Promise<void>;
}
const native = requireOptionalNativeModule<HubNetworkNative>('HubNetwork');
const hasPairingInspection =
  native !== null &&
  typeof native.inspectCandidate === 'function' &&
  typeof native.cancelInspection === 'function';
const hasRouteAuthority =
  native !== null &&
  typeof native.configureRoutes === 'function' &&
  typeof native.clearRoutes === 'function' &&
  typeof native.refreshRoutes === 'function' &&
  typeof native.routeState === 'function' &&
  typeof native.clearServerCredential === 'function' &&
  typeof native.activateServerEnrollment === 'function' &&
  typeof native.reserveServerActivation === 'function' &&
  typeof native.claimServerEnrollment === 'function' &&
  typeof native.captureServerEnrollment === 'function';
const hasResourceApi =
  hasRouteAuthority &&
  typeof native.resourcesReady === 'function' &&
  typeof native.openResource === 'function' &&
  typeof native.releaseResource === 'function' &&
  typeof native.downloadResource === 'function';
function resourcesReady(): boolean {
  return hasResourceApi && native.resourcesReady();
}
export const nativeHubCapabilities: NativeHubCapabilities = {
  http:
    native !== null &&
    typeof native.request === 'function' &&
    typeof native.configureTrust === 'function',
  websocket:
    native !== null &&
    typeof native.openSocket === 'function' &&
    typeof native.sendSocket === 'function' &&
    typeof native.closeSocket === 'function',
  media: false,
  pairingInspection: hasPairingInspection,
  routeAuthority: hasRouteAuthority,
  background: hasRouteAuthority,
  get image(): boolean {
    return resourcesReady();
  },
  get httpMedia(): boolean {
    return resourcesReady();
  },
  mse: false,
  html: false,
  get download(): boolean {
    return resourcesReady();
  },
};
class HubNativeUnavailableError extends Error {
  override readonly name = 'HubNativeUnavailableError';
  constructor() {
    super('This app build cannot use pinned local hub transport; use a verified remote endpoint.');
  }
}
function moduleForHub(): HubNetworkNative {
  if (native === null) throw new HubNativeUnavailableError();
  return native;
}
export async function configureNativeHubTrust(trust: NativeHubTrust): Promise<void> {
  if (!nativeHubCapabilities.http) throw new HubNativeUnavailableError();
  await moduleForHub().configureTrust(JSON.stringify(NATIVE_HUB_TRUST.parse(trust)));
}
const SERVER_ENROLLMENT = z.strictObject({
  canonicalOrigin: z.url(),
  principalId: z.string().regex(/^[0-9a-f]{64}$/),
  scopeId: z.string().max(200),
  epoch: z.int().nonnegative(),
});
const enrollments = new Set<string>();
const claiming = new Map<string, symbol>();
function enrollmentText(value: unknown): string {
  const text = z.string().parse(value);
  const input: unknown = JSON.parse(text);
  return JSON.stringify(SERVER_ENROLLMENT.parse(input));
}
async function serverPrincipal(token: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, token);
}
export interface NativeServerActivationIntent {
  readonly order: number;
  readonly isCurrent: () => boolean;
}
const ACTIVATION = z.strictObject({
  owner: z.int().positive(),
  order: z.int().positive(),
  stamp: z.int().positive(),
});
function activationText(order: number): string {
  const text = z.string().parse(moduleForHub().reserveServerActivation(order));
  const input: unknown = JSON.parse(text);
  return JSON.stringify(ACTIVATION.parse(input));
}
export function supersedeNativeServerActivation(order: number): void {
  if (hasRouteAuthority) activationText(order);
}
export async function activateNativeServerEnrollment(
  url: string,
  token: string,
  intent: NativeServerActivationIntent,
): Promise<void> {
  if (!hasRouteAuthority || !intent.isCurrent()) return;
  const activation = activationText(intent.order);
  const principal = await serverPrincipal(token);
  if (!intent.isCurrent()) return;
  enrollmentText(
    await moduleForHub().activateServerEnrollment(new URL(url).origin, principal, activation),
  );
}
export async function claimNativeServerEnrollment(
  scopeId: string,
  url: string,
  principal: string,
): Promise<void> {
  if (!hasRouteAuthority) return;
  const run = Symbol();
  claiming.set(scopeId, run);
  try {
    enrollmentText(
      await moduleForHub().claimServerEnrollment(new URL(url).origin, principal, scopeId),
    );
    if (claiming.get(scopeId) !== run) throw new HubNativeUnavailableError();
    enrollments.add(scopeId);
  } finally {
    if (claiming.get(scopeId) === run) claiming.delete(scopeId);
  }
}
export async function captureNativeServerEnrollment(
  url: string,
  token: string,
): Promise<string | null> {
  if (!hasRouteAuthority) return null;
  return enrollmentText(
    await moduleForHub().captureServerEnrollment(new URL(url).origin, await serverPrincipal(token)),
  );
}
export async function clearNativeServerCredential(token: string): Promise<void> {
  if (native === null || typeof native.clearServerCredential !== 'function') return;
  if (hasRouteAuthority) await native.clearServerCredential(await serverPrincipal(token));
  else await native.clearServerCredential();
}
export async function clearNativeHubTrust(scopeId: string): Promise<void> {
  if (native !== null && typeof native.clearTrust === 'function') await native.clearTrust(scopeId);
}
export async function nativeHubRequest(request: NativeHubRequest): Promise<NativeHubResponse> {
  if (!nativeHubCapabilities.http) throw new HubNativeUnavailableError();
  return NATIVE_HUB_RESPONSE.parse(
    await moduleForHub().request(JSON.stringify(NATIVE_HUB_REQUEST.parse(request))),
  );
}
export async function startNativeHubDiscovery(): Promise<NativeHubDiscovery> {
  if (native === null || typeof native.startDiscovery !== 'function')
    return {
      generation: 0,
      state: 'unsupported',
      detail: 'Local discovery requires a supported Android or Linux desktop build.',
      candidates: [],
    };
  return NATIVE_HUB_DISCOVERY.parse(await native.startDiscovery());
}
export async function stopNativeHubDiscovery(): Promise<void> {
  if (native !== null && typeof native.stopDiscovery === 'function') await native.stopDiscovery();
}
function subscribe(event: keyof HubNetworkEvents, listener: (value: unknown) => void): () => void {
  if (
    native === null ||
    (event === 'onRoute' && !hasRouteAuthority) ||
    (event === 'onNetwork' && typeof native.startNetwork !== 'function') ||
    (event === 'onSocket' && !nativeHubCapabilities.websocket) ||
    (event === 'onDiscovery' && typeof native.startDiscovery !== 'function')
  )
    return () => undefined;
  const subscription = native.addListener(event, listener);
  return () => {
    subscription.remove();
  };
}
export function subscribeNativeHubDiscovery(
  listener: (state: NativeHubDiscovery) => void,
): () => void {
  return subscribe('onDiscovery', (value) => {
    listener(NATIVE_HUB_DISCOVERY.parse(value));
  });
}
const routeAuthority: NativeHubRouteAuthority = {
  configure: async (configuration) => {
    if (!enrollments.has(configuration.trust.scopeId)) throw new HubNativeUnavailableError();
    const binding = configuration.bindings[0];
    if (binding === undefined) throw new HubNativeUnavailableError();
    const enrollment = enrollmentText(
      await moduleForHub().captureServerEnrollment(
        configuration.canonicalOrigin,
        binding.principalId,
      ),
    );
    return NATIVE_HUB_ROUTE_SNAPSHOT.parse(
      await moduleForHub().configureRoutes(
        JSON.stringify(NATIVE_HUB_ROUTE_CONFIGURATION.parse(configuration)),
        enrollment,
      ),
    );
  },
  clear: async (scopeId) => {
    claiming.delete(scopeId);
    enrollments.delete(scopeId);
    await moduleForHub().clearRoutes(scopeId);
  },
  refresh: async (scopeId) =>
    NATIVE_HUB_ROUTE_SNAPSHOT.parse(await moduleForHub().refreshRoutes(scopeId)),
  state: async (scopeId) =>
    NATIVE_HUB_ROUTE_SNAPSHOT.parse(await moduleForHub().routeState(scopeId)),
  subscribe: (listener) =>
    subscribe('onRoute', (value) => {
      listener(NATIVE_HUB_ROUTE_SNAPSHOT.parse(value));
    }),
};
export const nativeHubNetwork: NativeHubNetwork = {
  capabilities: nativeHubCapabilities,
  ...(hasPairingInspection
    ? {
        inspectCandidate: async (request) =>
          HUB_PAIRING_OBSERVATION.parse(
            await moduleForHub().inspectCandidate(
              JSON.stringify(HUB_PAIRING_INSPECTION.parse(request)),
            ),
          ),
        cancelInspection: async (requestId) =>
          moduleForHub().cancelInspection(HUB_PAIRING_INSPECTION_ID.parse(requestId)),
      }
    : {}),
  ...(hasRouteAuthority ? { routeAuthority } : {}),
  ...(hasResourceApi
    ? {
        openResource: async (request) =>
          NATIVE_HUB_RESOURCE.parse(
            await moduleForHub().openResource(
              JSON.stringify(NATIVE_HUB_RESOURCE_OPEN.parse(request)),
            ),
          ),
        releaseResource: async (id) =>
          moduleForHub().releaseResource(NATIVE_HUB_RESOURCE_ID.parse(id)),
        downloadResource: async (request) =>
          NATIVE_HUB_RESOURCE_DOWNLOAD_RESULT.parse(
            await moduleForHub().downloadResource(
              JSON.stringify(NATIVE_HUB_RESOURCE_DOWNLOAD.parse(request)),
            ),
          ),
      }
    : {}),
  configureTrust: configureNativeHubTrust,
  clearTrust: clearNativeHubTrust,
  request: nativeHubRequest,
  startDiscovery: startNativeHubDiscovery,
  stopDiscovery: stopNativeHubDiscovery,
  subscribeDiscovery: subscribeNativeHubDiscovery,
  startNetwork: async () =>
    native === null || typeof native.startNetwork !== 'function'
      ? {
          generation: 0,
          state: 'unsupported',
          detail: 'Native network events are unavailable in this build.',
        }
      : NATIVE_HUB_NETWORK_CHANGE.parse(await native.startNetwork()),
  stopNetwork: async () => {
    if (native !== null && typeof native.stopNetwork === 'function') await native.stopNetwork();
  },
  subscribeNetwork: (listener) =>
    subscribe('onNetwork', (value) => {
      listener(NATIVE_HUB_NETWORK_CHANGE.parse(value));
    }),
  openSocket: async (request) => {
    if (!nativeHubCapabilities.websocket) throw new HubNativeUnavailableError();
    await moduleForHub().openSocket(JSON.stringify(NATIVE_HUB_SOCKET_OPEN.parse(request)));
  },
  sendSocket: async (request) => {
    if (!nativeHubCapabilities.websocket) throw new HubNativeUnavailableError();
    await moduleForHub().sendSocket(JSON.stringify(NATIVE_HUB_SOCKET_SEND.parse(request)));
  },
  closeSocket: async (id) => {
    if (native !== null && typeof native.closeSocket === 'function') await native.closeSocket(id);
  },
  subscribeSockets: (listener) =>
    subscribe('onSocket', (value) => {
      listener(NATIVE_HUB_SOCKET_EVENT.parse(value));
    }),
};
