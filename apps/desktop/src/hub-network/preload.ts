import { ipcRenderer } from 'electron';
import { HUB_CONNECTION_METADATA, DESKTOP_COMPUTER_IDENTITY } from '@smarteverything/domain';
import {
  NATIVE_HUB_ROUTE_CONFIGURATION,
  NATIVE_HUB_ROUTE_SNAPSHOT,
  NATIVE_HUB_DISCOVERY,
  NATIVE_HUB_NETWORK_CHANGE,
  NATIVE_HUB_REQUEST,
  NATIVE_HUB_RESOURCE_OPEN,
  NATIVE_HUB_RESOURCE,
  NATIVE_HUB_RESOURCE_ID,
  NATIVE_HUB_RESOURCE_DOWNLOAD,
  NATIVE_HUB_RESOURCE_DOWNLOAD_RESULT,
  NATIVE_HUB_RESPONSE,
  NATIVE_HUB_SOCKET_EVENT,
  NATIVE_HUB_SOCKET_OPEN,
  NATIVE_HUB_SOCKET_SEND,
  NATIVE_HUB_TRUST,
  type NativeHubNetwork,
  type NativeHubResourceOpen,
  type NativeHubResourceDownload,
  type NativeHubResourceDownloadResult,
  type NativeHubRouteAuthority,
} from '../../../../packages/domain/src/hub-native';
import type { DesktopComputerIdentity, DesktopServer } from '@smarteverything/domain';
import {
  HUB_PAIRING_INSPECTION,
  HUB_PAIRING_INSPECTION_ID,
  HUB_PAIRING_OBSERVATION,
  type HubPairingNetwork,
} from '../../../../packages/domain/src/hub-pairing';
function subscribe(channel: string, forward: (value: unknown) => void): () => void {
  const receive = (_event: unknown, value: unknown): void => {
    forward(value);
  };
  ipcRenderer.on(channel, receive);
  return () => {
    ipcRenderer.removeListener(channel, receive);
  };
}
const authoritySupported: unknown = ipcRenderer.sendSync('desktop:hub-authority-supported');
const resourceSupported: unknown = ipcRenderer.sendSync('desktop:hub-resource-supported');
const capabilities = {
  http: true,
  websocket: true,
  media: false,
  routeAuthority: authoritySupported === true,
  background: authoritySupported === true,
  image: resourceSupported === true,
  httpMedia: resourceSupported === true,
  mse: false,
  html: false,
  download: resourceSupported === true,
  guest: false,
  pairingInspection: true,
};
const routeAuthority: NativeHubRouteAuthority = {
  configure: async (value) =>
    NATIVE_HUB_ROUTE_SNAPSHOT.parse(
      await ipcRenderer.invoke(
        'desktop:hub-authority-configure',
        NATIVE_HUB_ROUTE_CONFIGURATION.parse(value),
      ),
    ),
  clear: async (scopeId) => {
    await ipcRenderer.invoke('desktop:hub-authority-clear', scopeId);
  },
  refresh: async (scopeId) =>
    NATIVE_HUB_ROUTE_SNAPSHOT.parse(
      await ipcRenderer.invoke('desktop:hub-authority-refresh', scopeId),
    ),
  state: async (scopeId) =>
    NATIVE_HUB_ROUTE_SNAPSHOT.parse(
      await ipcRenderer.invoke('desktop:hub-authority-state', scopeId),
    ),
  subscribe: (listener) =>
    subscribe('desktop:hub-authority', (value) => {
      listener(NATIVE_HUB_ROUTE_SNAPSHOT.parse(value));
    }),
};
export const hubNetwork: NativeHubNetwork & HubPairingNetwork = {
  capabilities,
  inspectCandidate: async (value) =>
    HUB_PAIRING_OBSERVATION.parse(
      await ipcRenderer.invoke('desktop:hub-pairing-inspect', HUB_PAIRING_INSPECTION.parse(value)),
    ),
  cancelInspection: async (requestId) => {
    await ipcRenderer.invoke(
      'desktop:hub-pairing-cancel',
      HUB_PAIRING_INSPECTION_ID.parse(requestId),
    );
  },
  ...(resourceSupported === true
    ? {
        openResource: async (value: NativeHubResourceOpen) =>
          NATIVE_HUB_RESOURCE.parse(
            await ipcRenderer.invoke(
              'desktop:hub-resource-open',
              NATIVE_HUB_RESOURCE_OPEN.parse(value),
            ),
          ),
        releaseResource: async (id: string): Promise<void> => {
          await ipcRenderer.invoke(
            'desktop:hub-resource-release',
            NATIVE_HUB_RESOURCE_ID.parse(id),
          );
        },
        downloadResource: async (
          value: NativeHubResourceDownload,
        ): Promise<NativeHubResourceDownloadResult> => {
          return NATIVE_HUB_RESOURCE_DOWNLOAD_RESULT.parse(
            await ipcRenderer.invoke(
              'desktop:hub-resource-download',
              NATIVE_HUB_RESOURCE_DOWNLOAD.parse(value),
            ),
          );
        },
      }
    : {}),
  ...(authoritySupported === true ? { routeAuthority } : {}),
  configureTrust: async (trust) => {
    await ipcRenderer.invoke('desktop:hub-configure-trust', NATIVE_HUB_TRUST.parse(trust));
  },
  clearTrust: async (scopeId) => {
    await ipcRenderer.invoke('desktop:hub-clear-trust', scopeId);
  },
  request: async (request) =>
    NATIVE_HUB_RESPONSE.parse(
      await ipcRenderer.invoke('desktop:hub-request', NATIVE_HUB_REQUEST.parse(request)),
    ),
  startDiscovery: async () =>
    NATIVE_HUB_DISCOVERY.parse(await ipcRenderer.invoke('desktop:hub-discovery-start')),
  stopDiscovery: async () => {
    await ipcRenderer.invoke('desktop:hub-discovery-stop');
  },
  subscribeDiscovery: (listener) =>
    subscribe('desktop:hub-discovery', (value) => {
      listener(NATIVE_HUB_DISCOVERY.parse(value));
    }),
  startNetwork: async () =>
    NATIVE_HUB_NETWORK_CHANGE.parse(await ipcRenderer.invoke('desktop:hub-network-start')),
  stopNetwork: async () => {
    await ipcRenderer.invoke('desktop:hub-network-stop');
  },
  subscribeNetwork: (listener) =>
    subscribe('desktop:hub-network', (value) => {
      listener(NATIVE_HUB_NETWORK_CHANGE.parse(value));
    }),
  openSocket: async (request) => {
    await ipcRenderer.invoke('desktop:hub-socket-open', NATIVE_HUB_SOCKET_OPEN.parse(request));
  },
  sendSocket: async (request) => {
    await ipcRenderer.invoke('desktop:hub-socket-send', NATIVE_HUB_SOCKET_SEND.parse(request));
  },
  closeSocket: async (id) => {
    await ipcRenderer.invoke('desktop:hub-socket-close', id);
  },
  subscribeSockets: (listener) =>
    subscribe('desktop:hub-socket', (value) => {
      listener(NATIVE_HUB_SOCKET_EVENT.parse(value));
    }),
};
export async function server(): Promise<DesktopServer> {
  const value: unknown = await ipcRenderer.invoke('desktop:server');
  if (
    typeof value !== 'object' ||
    value === null ||
    !('url' in value) ||
    !('token' in value) ||
    typeof value.url !== 'string' ||
    typeof value.token !== 'string'
  )
    throw new Error('desktop:server answers a URL and token');
  return {
    url: value.url,
    token: value.token,
    ...('connection' in value && value.connection !== undefined
      ? { connection: HUB_CONNECTION_METADATA.parse(value.connection) }
      : {}),
  };
}

export async function computerIdentity(): Promise<DesktopComputerIdentity> {
  return DESKTOP_COMPUTER_IDENTITY.parse(
    await ipcRenderer.invoke('desktop:computer-identity', undefined),
  );
}
