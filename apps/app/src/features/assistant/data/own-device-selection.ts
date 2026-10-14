import { useQueryClient } from '@tanstack/react-query';
import type {
  AiHarnessCatalogue,
  AiHarnessHost,
  AiHarnessPermission,
  DshEngine,
  Engine,
} from '@smarteverything/domain';
import { useHarnessCatalogue, HARNESS_CATALOGUE_KEY } from './harness';
import { useOpenRouterStatus } from './openrouter';
import { useSuggestedModels } from '../picker/model-queries';
import { ownDeviceEngine } from '../model/own-device-engine';
import { useModelPickAuthority } from '../chats/model-pick-authority';

export function useOwnDeviceSelection(
  engine: Engine,
): (
  host: AiHarnessHost,
  requireAuthority?: boolean,
  permission?: AiHarnessPermission,
) => DshEngine | null {
  const client = useQueryClient();
  const valid = useModelPickAuthority({ engine, blocked: false });
  const catalogue = useHarnessCatalogue();
  const suggested = useSuggestedModels('chat', engine.model, engine.kind === 'openrouter');
  const status = useOpenRouterStatus();
  return (host, requireAuthority = false, permission): DshEngine | null => {
    if (requireAuthority && !valid()) return null;
    if (client.getQueryState(HARNESS_CATALOGUE_KEY)?.isInvalidated === true) return null;
    const current = client.getQueryData<AiHarnessCatalogue>(HARNESS_CATALOGUE_KEY);
    if (current === undefined || current !== catalogue.data) return null;
    const registered = current.hosts.find((row) => row === host);
    return registered === undefined
      ? null
      : ownDeviceEngine(engine, registered, {
          catalogue: current,
          suggested: suggested.data,
          status: status.data,
          permission,
        });
  };
}
