import { HARNESS_RUNTIME_RECEIPT } from '@smarteverything/domain';
import type {
  DshWriterClaim,
  HarnessRuntimeRequest,
  HarnessRuntimeReceipt,
} from '@smarteverything/domain';
import type { HarnessRuntime } from '../host/runtime';
import type { HarnessControlPersistence } from './contracts';
import { HarnessRuntimeError } from '../host/errors';

export async function prepareRuntimeConfiguration(
  runtime: HarnessRuntime,
  persistence: HarnessControlPersistence,
  close: (id: string) => Promise<void>,
  protectedSessions: readonly string[],
): Promise<void> {
  const sessions = runtime.configurationSessions(protectedSessions);
  for (const session of sessions) {
    await close(session.id);
    if (persistence.boundClaim(session.id) !== undefined)
      throw new HarnessRuntimeError(
        'source_outcome_unknown',
        'Configuration preparation did not release its native writer.',
        session.id,
      );
  }
  await runtime.reconcileConfiguration();
}

export async function configurationPreparationReceipt(
  id: string,
  request: Extract<HarnessRuntimeRequest, { kind: 'configuration_prepare' }>,
  claim: DshWriterClaim | undefined,
  prepare: () => Promise<void>,
): Promise<HarnessRuntimeReceipt> {
  if (claim !== undefined && claim.epoch !== request.expected_epoch)
    throw new HarnessRuntimeError(
      'ownership_lost',
      'Configuration preparation names a stale session epoch.',
    );
  await prepare();
  return HARNESS_RUNTIME_RECEIPT.parse({
    operation_id: id,
    session_id: request.session_id,
    epoch: request.expected_epoch,
    state: 'preflighted',
    durable_seq: -1,
  });
}

export function isConfigurationPreparation(
  request: HarnessRuntimeRequest,
): request is Extract<
  HarnessRuntimeRequest,
  { kind: 'open' | 'preflight' | 'configuration_prepare' }
> {
  return (
    request.kind === 'open' ||
    request.kind === 'preflight' ||
    request.kind === 'configuration_prepare'
  );
}
