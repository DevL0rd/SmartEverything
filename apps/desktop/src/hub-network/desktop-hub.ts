import { session } from 'electron';
import { buildContentSecurityPolicy } from '../csp.js';
import { enforceContentSecurityPolicy } from '../protocol.js';
import type { ServiceController } from '../service/controller.js';
import { registerHubNetworkIpc, type HubNetworkRegistration } from './ipc.js';

export async function registerDesktopHub(
  controller: ServiceController,
  startUrl: string,
): Promise<HubNetworkRegistration> {
  let serverUrl = (await controller.server())?.url ?? null;
  let mediaOrigin: string | undefined;
  const enforce = (): void => {
    enforceContentSecurityPolicy(
      session.defaultSession,
      buildContentSecurityPolicy(serverUrl, mediaOrigin),
    );
  };
  enforce();
  controller.onConnection((server) => {
    serverUrl = server?.url ?? null;
    enforce();
  });
  return registerHubNetworkIpc(startUrl, (origin): void => {
    mediaOrigin = origin;
    enforce();
  });
}
