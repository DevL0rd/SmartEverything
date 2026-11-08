import { useScreenQuery } from '../../../queries/use-screen-query';
import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { background } from '@smarteverything/logging';
import {
  DESKTOP_COMPUTER_IDENTITY,
  type AiHarnessHost,
  type DesktopComputerIdentity,
  type AiHarnessTarget,
} from '@smarteverything/domain';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';
import { useHarnessCatalogue } from './harness';

export const DESKTOP_IDENTITY_KEY = ['window', 'desktop-computer-identity'] as const;

type IdentityBridge = Pick<DesktopBridge, 'onServiceStatus'>;
interface IdentitySubscription {
  readonly consumers: Set<symbol>;
  readonly stop: () => void;
}
const identitySubscriptions = new WeakMap<
  QueryClient,
  WeakMap<IdentityBridge, IdentitySubscription>
>();

export function followDesktopIdentity(bridge: IdentityBridge, client: QueryClient): () => void {
  let bridges = identitySubscriptions.get(client);
  if (bridges === undefined) {
    bridges = new WeakMap();
    identitySubscriptions.set(client, bridges);
  }
  let subscription = bridges.get(bridge);
  if (subscription === undefined) {
    subscription = {
      consumers: new Set(),
      stop: bridge.onServiceStatus(() => {
        background(refreshDesktopIdentity(client), 'queries.invalidate_failed');
      }),
    };
    bridges.set(bridge, subscription);
  }
  const consumer = Symbol();
  const shared = subscription;
  const sharedBridges = bridges;
  shared.consumers.add(consumer);
  return (): void => {
    if (!shared.consumers.delete(consumer) || shared.consumers.size !== 0) return;
    shared.stop();
    sharedBridges.delete(bridge);
  };
}

async function refreshDesktopIdentity(client: QueryClient): Promise<void> {
  await client.cancelQueries({ queryKey: DESKTOP_IDENTITY_KEY });
  await client.invalidateQueries({ queryKey: DESKTOP_IDENTITY_KEY });
}

export function useDesktopHarness(): {
  readonly desktop: boolean;
  readonly target: AiHarnessTarget | null;
  readonly ready: boolean;
} {
  const bridge = desktopBridge();
  const client = useQueryClient();
  useEffect(
    () => (bridge === null ? undefined : followDesktopIdentity(bridge, client)),
    [bridge, client],
  );
  const catalogue = useHarnessCatalogue();
  const identity = useScreenQuery({
    queryKey: DESKTOP_IDENTITY_KEY,
    enabled: bridge !== null,
    retry: false,
    queryFn: async () => {
      if (bridge?.computerIdentity === undefined) throw new DesktopHarnessIdentityError();
      return DESKTOP_COMPUTER_IDENTITY.parse(await bridge.computerIdentity());
    },
  });
  const target = desktopTarget(identity.data, catalogue.data);
  return { desktop: bridge !== null, target, ready: bridge === null || target !== null };
}
export function desktopTarget(
  identity: DesktopComputerIdentity | undefined,
  catalogue:
    { readonly hosts: readonly Pick<AiHarnessHost, 'target' | 'machine_id'>[] } | undefined,
): AiHarnessTarget | null {
  if (identity === undefined) return null;
  if (identity.device_id !== null) return { kind: 'device', device_id: identity.device_id };
  if (identity.machine_id === null || catalogue === undefined) return null;
  const matches = catalogue.hosts.filter(
    (host) => host.target.kind === 'device' && host.machine_id === identity.machine_id,
  );
  return matches.length === 1 ? (matches[0]?.target ?? null) : null;
}
class DesktopHarnessIdentityError extends Error {
  override readonly name = 'DesktopHarnessIdentityError';
  constructor() {
    super('This computer’s runtime identity is unavailable. Update or reconnect this desktop.');
  }
}
