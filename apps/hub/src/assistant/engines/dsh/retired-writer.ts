import { harnessTargetKey, type DshWriterClaim } from '@smarteverything/domain';
import type { HarnessConnection } from '../../../harness/directory';

export function retiredWriter(
  connection: HarnessConnection,
  claim: DshWriterClaim,
  active: boolean,
): boolean {
  return (
    !active &&
    harnessTargetKey(connection.host.target) === harnessTargetKey(claim.target) &&
    (connection.host.runtime_instance !== claim.runtime_instance ||
      connection.host.connection_generation !== claim.connection_generation) &&
    Date.parse(claim.expires_at) <= Date.now() &&
    connection.hasSession?.(claim.session_id, claim.epoch) === false
  );
}
