import { ApiError, type AiReferenceKind } from '@smarteverything/domain';
import type { ReferenceSource } from './contracts';

export function unavailableReferenceSource(kind: AiReferenceKind): ReferenceSource {
  const reason =
    kind === 'device_path'
      ? 'This runtime has no admitted bounded device workspace reference adapter. Computer home files do not grant project authority.'
      : 'The current runtime has not negotiated effective reference metadata and invocation support.';
  const fail = (): never => {
    throw new ApiError('conflict', reason);
  };
  return {
    kind,
    status: () => ({ kind, state: 'unavailable', reason }),
    open: fail,
    resolve: fail,
  };
}
