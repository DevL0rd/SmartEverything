import type { HarnessRuntimeOptions } from '@smarteverything/harness';
import { withExecutionAuthority } from '../assistant/turn-authority';
import type { Store } from '../store/store';

type FailureContext = NonNullable<HarnessRuntimeOptions['failureContext']>;
type FailureInput = Parameters<FailureContext>[0];
type FailureWriter = Parameters<FailureContext>[1];

export function harnessFailureContext(
  store: Pick<Store, 'host'>,
): (input: FailureInput, write: FailureWriter) => Promise<void> {
  return async ({ sessionId, turn, publicationFailed }, work): Promise<void> => {
    if (publicationFailed === true) {
      withExecutionAuthority(undefined, () => {
        work(true);
      });
      return;
    }
    const authorities = await store.host.call(
      'harnessRecovery',
      'turnAuthorities',
      sessionId,
      turn,
    );
    const authority =
      authorities.find((source) => source.repair_origin !== undefined) ?? authorities[0];
    withExecutionAuthority(authority, work);
  };
}
