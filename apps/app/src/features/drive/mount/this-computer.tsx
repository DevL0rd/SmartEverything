import type { ReactNode } from 'react';
import { DESKTOP_COMPUTER_IDENTITY, type DesktopPlatform } from '@smarteverything/domain';
import { desktopBridge, type DesktopBridge } from '../../../design/platform';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { IDENTITY_KEY } from '../sync/this-computer-card';

export interface ThisComputer {
  readonly deviceId: string;
  readonly platform: DesktopPlatform;
}

class ThisComputerUnknownError extends Error {
  override readonly name = 'ThisComputerUnknownError';
  constructor() {
    super('This computer’s identity is unavailable. Update or reconnect this desktop.');
  }
}

function useThisComputerId(bridge: DesktopBridge): string | null {
  const identity = useScreenQuery({
    queryKey: IDENTITY_KEY,
    retry: false,
    queryFn: async () => {
      if (bridge.computerIdentity === undefined) throw new ThisComputerUnknownError();
      return DESKTOP_COMPUTER_IDENTITY.parse(await bridge.computerIdentity());
    },
  });
  return identity.data?.device_id ?? null;
}

function OnDesktop({
  bridge,
  children,
}: {
  readonly bridge: DesktopBridge;
  readonly children: (computer: ThisComputer) => ReactNode;
}): ReactNode {
  const deviceId = useThisComputerId(bridge);
  return deviceId === null ? null : children({ deviceId, platform: bridge.platform });
}

export function ThisComputerOnly({
  children,
}: {
  readonly children: (computer: ThisComputer) => ReactNode;
}): ReactNode {
  const bridge = desktopBridge();
  return bridge === null ? null : <OnDesktop bridge={bridge}>{children}</OnDesktop>;
}
