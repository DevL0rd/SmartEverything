import { randomBytes } from 'node:crypto';
import type { HubGuestBroker } from '@smarteverything/hub/client-network/guest-broker';

type GrantPort = Pick<HubGuestBroker, 'grant' | 'closeOwner'>;

export interface DriveHubTarget {
  readonly canonicalOrigin: string;
  readonly nodeToken: string;
}

export interface HelperGrant {
  readonly fs: string;
  readonly uploads: string;
  readonly secret: string;
  close(): void;
}

function helperOwner(runId: string): string {
  return `drive-helper:${runId}`;
}
function davOwner(placementId: string): string {
  return `drive-dav:${placementId}`;
}

export function openHelperGrant(
  port: GrantPort,
  target: DriveHubTarget,
  runId: string,
): HelperGrant {
  const owner = helperOwner(runId);
  const secret = randomBytes(32).toString('hex');
  const common = { owner, token: target.nodeToken, secret } as const;
  port.closeOwner(owner);
  return {
    fs: port.grant({
      ...common,
      kind: 'fs',
      url: new URL('/drive/fs', target.canonicalOrigin).href,
    }),
    uploads: port.grant({
      ...common,
      kind: 'uploads',
      url: new URL('/drive/uploads', target.canonicalOrigin).href,
    }),
    secret,
    close: (): void => {
      port.closeOwner(owner);
    },
  };
}

export function openFileGrant(
  port: GrantPort,
  target: DriveHubTarget,
  owner: string,
  itemId: string,
): string {
  return port.grant({
    owner,
    kind: 'file',
    token: target.nodeToken,
    url: new URL(`/media/drive/${encodeURIComponent(itemId)}/file`, target.canonicalOrigin).href,
  });
}

export function openPlacementDavGrant(
  port: GrantPort,
  target: DriveHubTarget,
  placementId: string,
  rootId: string,
): string {
  const owner = davOwner(placementId);
  port.closeOwner(owner);
  return port.grant({
    owner,
    kind: 'dav',
    token: target.nodeToken,
    url: new URL(`/dav/${encodeURIComponent(rootId)}`, target.canonicalOrigin).href,
  });
}

export function closePlacementDavGrant(port: GrantPort, placementId: string): void {
  port.closeOwner(davOwner(placementId));
}
