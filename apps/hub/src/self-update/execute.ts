import { RECOVERY_RESULT, type HubUpdateRecoveryResult } from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import { runUpdateCommand, UpdateBusyError, UpdateUnavailableError } from './command';

export async function recoverHubUpdate(
  layout: HubLayout,
  runId: string,
  holdSeconds: number,
): Promise<HubUpdateRecoveryResult> {
  try {
    return RECOVERY_RESULT.parse(
      await runUpdateCommand(layout, { action: 'recover', id: runId, holdSeconds }),
    );
  } catch (cause) {
    if (cause instanceof UpdateBusyError) return { status: 'refused', refusal: 'busy' };
    if (cause instanceof UpdateUnavailableError)
      return { status: 'refused', refusal: 'unavailable' };
    throw cause;
  }
}

export async function rollbackHubUpdate(
  layout: HubLayout,
  runId: string,
): Promise<HubUpdateRecoveryResult> {
  try {
    return RECOVERY_RESULT.parse(
      await runUpdateCommand(layout, { action: 'rollback', artifact: 'hub', id: runId }),
    );
  } catch (cause) {
    if (cause instanceof UpdateBusyError) return { status: 'refused', refusal: 'busy' };
    if (cause instanceof UpdateUnavailableError)
      return { status: 'refused', refusal: 'unavailable' };
    throw cause;
  }
}

export async function keepHubUpdate(
  layout: HubLayout,
  runId: string,
): Promise<HubUpdateRecoveryResult> {
  try {
    return RECOVERY_RESULT.parse(await runUpdateCommand(layout, { action: 'keep', id: runId }));
  } catch (cause) {
    if (cause instanceof UpdateBusyError) return { status: 'refused', refusal: 'busy' };
    if (cause instanceof UpdateUnavailableError)
      return { status: 'refused', refusal: 'unavailable' };
    throw cause;
  }
}
