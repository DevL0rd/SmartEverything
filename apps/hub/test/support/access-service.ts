import { HubConnections } from '../../src/network/connections';
import { OwnerAlerts } from '../../src/extensions/owner-alerts';
import { AccessService } from '../../src/server/access';
import type { TestStore } from './store';

export const PAIRING_PUBLIC_URL = 'https://home.example.com';

export function accessServiceFor(opened: TestStore, now: () => Date): AccessService {
  opened.store.settings.setPublicUrl(PAIRING_PUBLIC_URL);
  opened.store.settings.recordPublicUrlCheck(PAIRING_PUBLIC_URL, { verified: true });
  return new AccessService({
    connections: new HubConnections(
      {
        identity: {
          id: 'ab'.repeat(32),
          protocolVersion: 1,
          name: 'Home',
          tls: {
            serverName: `smarteverything-${'ab'.repeat(16)}.local`,
            certificateSha256: 'cd'.repeat(32),
            publicKeySha256: 'ab'.repeat(32),
          },
        },
        key: '',
        cert: '',
      },
      opened.store,
    ),
    store: opened.store,
    dataDirectory: opened.directory,
    now,
    clientWithdrawn: (): void => undefined,
    clientPaused: (): void => undefined,
    alerts: new OwnerAlerts(),
    scopesChanged: (): void => undefined,
  });
}
