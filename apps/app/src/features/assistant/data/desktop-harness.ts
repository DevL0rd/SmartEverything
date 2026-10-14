import { useQuery } from '@tanstack/react-query';
import {
  DESKTOP_COMPUTER_IDENTITY,
  type AiHarnessCatalogue,
  type DesktopComputerIdentity,
  type AiHarnessTarget,
} from '@smarteverything/domain';
import { desktopBridge } from '../../../design/platform';
import { useHarnessCatalogue } from './harness';

export function useDesktopHarness(): {
  readonly desktop: boolean;
  readonly target: AiHarnessTarget | null;
  readonly ready: boolean;
} {
  const bridge = desktopBridge();
  const catalogue = useHarnessCatalogue();
  const identity = useQuery({
    queryKey: ['window', 'desktop-computer-identity'],
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
function desktopTarget(
  identity: DesktopComputerIdentity | undefined,
  catalogue: AiHarnessCatalogue | undefined,
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
