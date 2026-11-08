import type { HarnessRuntimeOptions } from '@smarteverything/harness';
import { withExecutionAuthority } from '../assistant/turn-authority';
import type { Store } from '../store/store';

type FailureContext = NonNullable<HarnessRuntimeOptions['failureContext']>;
type FailureInput = Parameters<FailureContext>[0];
type FailureWriter = Parameters<FailureContext>[1];

export function harnessFailureContext(
  store: Pick<Store, 'harnessRecovery'>,
): (input: FailureInput, write: FailureWriter) => void {
  return ({ sessionId, turn, publicationFailed }, work): void => {
    if (publicationFailed === true) {
      withExecutionAuthority(undefined, () => {
        work(true);
      });
      return;
    }
    const authorities = store.harnessRecovery.turnAuthorities(sessionId, turn);
    const authority =
      authorities.find((source) => source.repair_origin !== undefined) ?? authorities[0];
    withExecutionAuthority(authority, work);
  };
}
