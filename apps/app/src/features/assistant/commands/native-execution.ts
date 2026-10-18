import { Logger, background } from '@smarteverything/logging';
import { errorFields } from '../../../design/log-tally';
import { CommandBindingError } from './types';
import { z } from 'zod';
import { randomUUID } from 'expo-crypto';
import {
  ApiError,
  AI_NATIVE_COMMAND_ENDPOINTS as E,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
} from '@smarteverything/domain';
import type { QueryCacheNotifyEvent } from '@tanstack/react-query';
import { nativeReceiptOutcome, nativeScopeKey } from './native-adapter';
import {
  retainNativeReceipt,
  saveNativeReceipt,
  retireNativeReceipt,
  discardNativeReceipt,
  type NativeLocalReceipt,
} from './receipt-storage';
import type { CommandExecution, CommandOutcome } from './types';
const log = new Logger('app.native-commands');

interface Observation {
  readonly input: CommandExecution;
  readonly request: AiNativeCommandWrite;
  readonly local: NativeLocalReceipt;
}
export async function executeNativeCommand(input: CommandExecution): Promise<CommandOutcome> {
  if (input.scope.kind !== 'native')
    throw new CommandBindingError(
      'Couldn’t run the command. Refresh commands and try again.',
      'native',
      input.scope.kind,
    );
  const request = {
    scope: input.scope.value,
    operation_id: randomUUID(),
    command_job_id: randomUUID(),
    definition_id: input.command.id,
    arguments: input.arguments,
    attachments: input.attachments,
  };
  input.ownNativeJob(request.command_job_id);
  const local = await retainNativeReceipt(input.scopeKey, request);
  if (!currentBinding(input)) {
    await discardNativeReceipt(local);
    return {
      status: 'rejected',
      text: 'The chat changed before sending. Your draft is kept; try again.',
    };
  }
  return observeCommand({ input, request, local });
}
interface ActiveObservation extends Observation {
  readonly current: () => boolean;
  readonly write: (action: () => Promise<void>) => Promise<void>;
}
function observeCommand(binding: Observation): Promise<CommandOutcome> {
  return new Promise((resolve) => {
    const { input } = binding;
    let finished = false;
    let observing = true;
    const observation = {
      ...binding,
      current: (): boolean => observing,
      write: serializedReceiptWrites(),
    };
    let admitted = false;
    const finish = (outcome: CommandOutcome): void => {
      if (finished) return;
      finished = true;
      observing = false;
      unsubscribe();
      input.signal.removeEventListener('abort', abort);
      resolve(outcome);
    };
    const fail = (): void => {
      if (!observing) return;
      observing = false;
      background(uncertain(observation).then(finish), 'native_execution.uncertain_failed');
    };
    const read = receiptReader(observation, finish, fail);
    const unsubscribe = input.client.getQueryCache().subscribe((event) => {
      if (!observing || !relevantNotice(event, observation)) return;
      if (!currentBinding(input)) fail();
      else if (admitted) read();
    });
    const abort = (): void => {
      fail();
    };
    input.signal.addEventListener('abort', abort, { once: true });
    void submitNative(observation)
      .then(async (receipt) => {
        if (!observation.current()) return;
        const outcome = await observeReceipt(observation, receipt);
        if (!observation.current()) return;
        admitted = true;
        if (outcome === null) read();
        else finish(outcome);
      })
      .catch((cause: unknown): void => {
        submissionFailed(observation, cause, finish, fail);
      });
  });
}
function receiptReader(
  observation: ActiveObservation,
  finish: (outcome: CommandOutcome) => void,
  fail: () => void,
): () => void {
  let reading = false;
  let dirty = false;
  return (): void => {
    if (!observation.current()) return;
    dirty = true;
    if (reading) return;
    reading = true;
    background(
      (async (): Promise<void> => {
        while (dirty && observation.current()) {
          dirty = false;
          const receipt = await observation.input.authority.client.call(
            E.readAiChatNativeCommandReceipt,
            {
              params: {
                chatId: observation.input.chatId,
                operationId: observation.request.operation_id,
              },
            },
          );
          if (!observation.current()) return;
          const outcome = await observeReceipt(observation, receipt);
          if (!observation.current()) return;
          if (outcome !== null) {
            finish(outcome);
            return;
          }
        }
      })()
        .catch(fail)
        .finally(() => {
          reading = false;
        }),
      'native_execution.task_failed',
    );
  };
}
async function submitNative(observation: Observation): Promise<AiNativeCommandReceipt> {
  return observation.input.authority.client.call(E.executeAiChatNativeCommand, {
    params: { chatId: observation.input.chatId },
    body: observation.request,
  });
}
async function observeReceipt(
  observation: ActiveObservation,
  receipt: AiNativeCommandReceipt,
): Promise<CommandOutcome | null> {
  const { input, request, local } = observation;
  assertReceipt(request, receipt);
  if (!currentBinding(input)) return uncertain(observation);
  const outcome = nativeReceiptOutcome(receipt);
  if (outcome?.status === 'unknown' && receipt.status !== 'unknown') return uncertain(observation);
  await observation.write(() => saveNativeReceipt(local, receipt));
  if (!observation.current() || !currentBinding(input)) return uncertain(observation);
  if (outcome === null)
    input.progress(
      receipt.status === 'pending' ? 'admitted' : 'running',
      receipt.text ?? 'Running command…',
    );
  return outcome;
}
function assertReceipt(request: AiNativeCommandWrite, receipt: AiNativeCommandReceipt): void {
  if (
    receipt.operation_id !== request.operation_id ||
    receipt.command_job_id !== request.command_job_id ||
    receipt.definition_id !== request.definition_id ||
    nativeScopeKey(receipt.scope) !== nativeScopeKey(request.scope) ||
    receipt.scope.connection_generation !== request.scope.connection_generation ||
    receipt.scope.catalogue_revision !== request.scope.catalogue_revision
  )
    throw new CommandBindingError(
      'The command result didn’t match. Refresh commands and try again.',
      JSON.stringify([request.operation_id, request.command_job_id, request.scope]),
      JSON.stringify([receipt.operation_id, receipt.command_job_id, receipt.scope]),
    );
}
function relevantNotice(event: QueryCacheNotifyEvent, observation: Observation): boolean {
  if (event.type !== 'updated' || event.action.type !== 'success') return false;
  const key = z.array(z.unknown()).parse(event.query.queryKey);
  const stateKey = observation.request.scope.runtime === 'codex' ? 'codex-state' : 'state';
  if (key[0] !== 'window') return false;
  if (key[1] === 'ai-provider') return key[2] === observation.input.chatId && key[3] === stateKey;
  return (
    key[1] === 'computer-runtime' &&
    key[2] === observation.request.scope.device_id &&
    key[3] === observation.request.scope.runtime
  );
}
async function uncertain(observation: ActiveObservation): Promise<CommandOutcome> {
  const text =
    'Couldn’t confirm the command ran. Check before running it again. Your draft is kept.';
  try {
    await observation.write(() => retireNativeReceipt(observation.local, text));
  } catch (error) {
    log.warn('receipt.retire_failed', {
      chatId: observation.input.chatId,
      ...errorFields(error),
    });
    return {
      status: 'unknown',
      text: `${text} Couldn’t save the result on this device.`,
    };
  }
  return { status: 'unknown', text };
}

function currentBinding(input: CommandExecution): boolean {
  return input.authority.current() && !input.signal.aborted;
}

function submissionFailed(
  observation: ActiveObservation,
  cause: unknown,
  finish: (outcome: CommandOutcome) => void,
  fail: () => void,
): void {
  if (!observation.current()) return;
  if (
    cause instanceof ApiError &&
    ['conflict', 'forbidden', 'invalid_request', 'not_found'].includes(cause.code)
  ) {
    void observation
      .write(() => discardNativeReceipt(observation.local))
      .then(() => {
        if (observation.current()) finish({ status: 'rejected', text: cause.message });
      })
      .catch(fail);
  } else fail();
}
function serializedReceiptWrites(): (action: () => Promise<void>) => Promise<void> {
  let pending = Promise.resolve();
  return (action): Promise<void> => {
    const next = pending.then(action, action);
    pending = next;
    return next;
  };
}
