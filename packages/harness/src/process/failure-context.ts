import type { HarnessFailureContext } from '../host/events';
import type { NativeForward } from './native-forward';

export function settledFailureContext(
  forward: Pick<NativeForward, 'settledInput'>,
  context: HarnessFailureContext | undefined,
): HarnessFailureContext {
  return async (input, write): Promise<void> => {
    const confirmed = await forward.settledInput(input.sessionId, input.turn);
    if (context === undefined) write(confirmed ? undefined : true);
    else
      await context(
        { ...input, ...(confirmed ? {} : { publicationFailed: true as const }) },
        write,
      );
  };
}
