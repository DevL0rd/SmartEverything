import type { DshSessionEvent } from '@smarteverything/domain';
import { helperInputId, projectDelivery } from '@smarteverything/harness/process';
import type { Store } from '../../../store/store';
import type { NativeReactionInput } from './helper-reaction-read';

export function activeHelperInput(history: readonly DshSessionEvent[], eventId: string): boolean {
  const entered = history.some(
    (record) =>
      record.type === 'user/message' &&
      record.surfaceOp === 'append' &&
      helperInputId(record.data) === eventId,
  );
  if (!entered) return false;
  const projection = projectDelivery(history, eventId);
  return projection.entered && projection.end === null;
}

export async function nativeHelperReactionInput(
  store: Pick<Store, 'host'>,
  input: NativeReactionInput,
): Promise<boolean> {
  const history = await store.host.read('assistantHelperReactionRead', input);
  return history !== null && activeHelperInput(history, input.event.id);
}
