import { useHarnessCatalogue } from '../data/harness';
import { harnessEngineReason } from '../model/harness-context';
import type { Engine } from '@smarteverything/domain';
import { useIsOwner } from '../../../store/selectors';
import { NATIVE_OWNER_REASON } from './provider-access';
export function useEngineUnavailableReason(engine: Engine): string | null {
  const owner = useIsOwner();
  const harness = useHarnessCatalogue();
  if (engine.kind === 'dsh')
    return harness.error?.message ?? harnessEngineReason(engine, harness.data);
  return owner ? null : NATIVE_OWNER_REASON;
}
