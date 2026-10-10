import { NativeModule, requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import { AppUpdateNeededError } from './health-connect';

const MESSAGE = z.strictObject({ json: z.string() });
const CLOSED = z.strictObject({ code: z.number(), reason: z.string() });

interface AssistantCallEvents {
  readonly onAssistantMessage: (payload: unknown) => void;
  readonly onAssistantClosed: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class AssistantCallNative extends NativeModule<AssistantCallEvents> {
  openAssistantCall(serverUrl: string, token: string): Promise<void>;
  beginAssistantCall(
    callId: string,
    source: string,
    device: string,
    chatId: string | null,
  ): Promise<void>;
  answerAssistantCall(
    callId: string,
    source: string,
    device: string,
    chatId: string | null,
    answering: string,
  ): Promise<void>;
  muteAssistantCall(callId: string, muted: boolean): Promise<void>;
  endAssistantCall(callId: string | null): Promise<void>;
  assistantCallLevel(): number;
}

type AssistantCallName =
  | 'openAssistantCall'
  | 'beginAssistantCall'
  | 'answerAssistantCall'
  | 'muteAssistantCall'
  | 'endAssistantCall'
  | 'assistantCallLevel'
  | 'addListener';

const native = requireOptionalNativeModule<AssistantCallNative>('AssistantCall');

function callFor(operation: AssistantCallName): AssistantCallNative {
  if (native === null || typeof Reflect.get(native, operation) !== 'function') {
    throw new AppUpdateNeededError(`assistant calls (${operation})`);
  }
  return native;
}

export function assistantCallLinked(): boolean {
  return native !== null;
}

export async function openAssistantCall(serverUrl: string, token: string): Promise<void> {
  await callFor('openAssistantCall').openAssistantCall(serverUrl, token);
}

export async function beginAssistantCall(
  callId: string,
  source: string,
  device: string,
  chatId: string | null,
): Promise<void> {
  await callFor('beginAssistantCall').beginAssistantCall(callId, source, device, chatId);
}

export interface AnsweredCall {
  readonly callId: string;
  readonly source: string;
  readonly device: string;
  readonly chatId: string | null;
  readonly answering: string;
}

export async function answerAssistantCall(call: AnsweredCall): Promise<void> {
  await callFor('answerAssistantCall').answerAssistantCall(
    call.callId,
    call.source,
    call.device,
    call.chatId,
    call.answering,
  );
}

export async function muteAssistantCall(callId: string, muted: boolean): Promise<void> {
  await callFor('muteAssistantCall').muteAssistantCall(callId, muted);
}

export async function endAssistantCall(callId: string | null): Promise<void> {
  await callFor('endAssistantCall').endAssistantCall(callId);
}

export function assistantCallLevel(): number {
  return callFor('assistantCallLevel').assistantCallLevel();
}

export interface AssistantCallListeners {
  readonly message: (json: string) => void;
  readonly closed: (code: number, reason: string) => void;
}

export function addAssistantCallListeners(listeners: AssistantCallListeners): {
  readonly remove: () => void;
} {
  const module = callFor('addListener');
  const message = module.addListener('onAssistantMessage', (payload) => {
    listeners.message(MESSAGE.parse(payload).json);
  });
  const closed = module.addListener('onAssistantClosed', (payload) => {
    const parsed = CLOSED.parse(payload);
    listeners.closed(parsed.code, parsed.reason);
  });
  return {
    remove: (): void => {
      message.remove();
      closed.remove();
    },
  };
}
