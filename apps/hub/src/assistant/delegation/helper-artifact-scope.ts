import { ApiError } from '@smarteverything/domain';
import { profileIdOf, type Caller } from '../../server/auth';
import { subjectOf } from '../../server/person-scope';
import { refusal } from '../../server/person-access';
import { currentRequestSignal } from '../../server/request-signal';
import type { ConversationAuthority } from '../../harness/authority-contract';
import type { Store } from '../../store/store';
import { currentProviderToolAuthority } from '../engines/computer/tool-authority';
import { currentExecutionAuthority } from '../turn-authority';
import type { HelperPair, PairCheck } from './helper-artifact-units';

export interface ValidatedPair {
  readonly pair: HelperPair;
  readonly writer: string | null;
}

export interface HelperArtifactScope {
  readonly pair: HelperPair;
  readonly check: PairCheck;
  readonly validate: () => Promise<ValidatedPair>;
}

function initiatingHelper(caller: Caller): {
  readonly chatId: string;
  readonly authority: ConversationAuthority;
} {
  if (
    caller.kind === 'anonymous' ||
    (caller.kind === 'client' && (caller.via !== 'assistant' || caller.mcpOrigin !== undefined)) ||
    caller.pluginRequester === 'unlisted'
  )
    throw new ApiError('forbidden', 'Sharing with a parent requires an admitted helper chat.');
  const authority = caller.authority;
  const chatId = caller.chatId;
  if (
    authority === undefined ||
    chatId === undefined ||
    chatId === null ||
    authority.requester === 'unlisted'
  )
    throw new ApiError('forbidden', 'Sharing with a parent requires an admitted helper chat.');
  return { authority, chatId };
}

async function checkedPair(
  store: Store,
  check: PairCheck,
  initial: boolean,
): Promise<ValidatedPair> {
  const checked = await store.host.read('helperArtifactPair', { ...check, initial });
  if (checked.refusal !== null) throw refusal(store, subjectOf(check.caller), checked.refusal);
  for (const chat of [checked.pair.helper, checked.pair.parent])
    store.live.chatWork.assertWorkAllowed(chat.id);
  return { pair: checked.pair, writer: checked.writer };
}

function runtimeScope(initial: ValidatedPair, eventId: string): (current: ValidatedPair) => void {
  if (initial.pair.helper.engine.kind === 'dsh')
    return (current): void => {
      if (current.writer !== initial.writer)
        throw new ApiError('forbidden', 'The helper’s SmartEverything session moved.');
    };
  const native = currentProviderToolAuthority();
  if (native === undefined || currentExecutionAuthority()?.event_id !== eventId)
    throw new ApiError('forbidden', 'The helper has no current native provider tool grant.');
  return (): void => {
    native.validate(false);
  };
}

export async function helperArtifactScope(
  store: Store,
  caller: Caller,
): Promise<HelperArtifactScope> {
  const { authority, chatId } = initiatingHelper(caller);
  const check: PairCheck = { caller, chatId, profile: profileIdOf(caller), authority };
  const first = await checkedPair(store, check, true);
  const checkRuntime = runtimeScope(first, authority.event_id);
  const signal = currentRequestSignal();
  const validate = async (): Promise<ValidatedPair> => {
    signal?.throwIfAborted();
    const current = await checkedPair(store, check, false);
    if (current.pair.parent.id !== first.pair.parent.id)
      throw new ApiError('conflict', 'The helper’s parent changed while preparing the post.');
    checkRuntime(current);
    return current;
  };
  await validate();
  return { pair: first.pair, check, validate };
}
