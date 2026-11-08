import type { AiModelRoute, Engine } from '@smarteverything/domain';
import { commandIntent } from '../commands/intent';
import { requestsReferences } from '../references/intent';

export function draftNeedsChat(engine: Engine | null, text: string): boolean {
  const own = engine?.kind === 'dsh';
  const mentions = own || engine?.kind === 'claude';
  return (own && commandIntent(text).kind !== 'text') || (mentions && requestsReferences(text));
}

export function engineUsesOpenRouter(engine: Engine, routes: readonly AiModelRoute[]): boolean {
  if (engine.kind !== 'dsh') return false;
  return routes.find((route) => route.id === engine.model_route_id)?.auth.provider === 'openrouter';
}

export interface DraftReadiness {
  readonly loading: boolean;
  readonly runtimeStopped: boolean;
  readonly needsKey: boolean;
  readonly blocked: string | null;
}

export const KEY_NEEDED_STATUS = 'This model needs an OpenRouter key';

export function draftStatusOf(readiness: DraftReadiness): string | null {
  if (readiness.runtimeStopped) return 'This computer’s runtime isn’t running';
  if (readiness.loading) return 'Loading the model for new chats…';
  if (readiness.needsKey) return KEY_NEEDED_STATUS;
  return readiness.blocked;
}

export function sendFailureNotice(host: string): string {
  return `Couldn’t send. ${host} didn’t answer. Your message is still here.`;
}

export const MACHINE_UNAVAILABLE_NOTICE =
  'Couldn’t send. The selected machine isn’t available. Your message is still here.';

export type StartOutcome =
  | { readonly kind: 'sent'; readonly chatId: string }
  | { readonly kind: 'failed'; readonly stage: 'create'; readonly cause: unknown }
  | {
      readonly kind: 'failed';
      readonly stage: 'send';
      readonly cause: unknown;
      readonly chatId: string;
    };

export interface StartSteps {
  readonly create: () => Promise<{ readonly id: string }>;
  readonly send: (chatId: string) => Promise<unknown>;
  readonly chatId: string | null;
  readonly created: (chatId: string) => void;
}

export async function startChatWithMessage(steps: StartSteps): Promise<StartOutcome> {
  let chatId = steps.chatId;
  try {
    if (chatId === null) {
      chatId = (await steps.create()).id;
      steps.created(chatId);
    }
  } catch (cause) {
    return { kind: 'failed', stage: 'create', cause };
  }
  try {
    await steps.send(chatId);
    return { kind: 'sent', chatId };
  } catch (cause) {
    return { kind: 'failed', stage: 'send', cause, chatId };
  }
}

export function createDraftChatStarter(): (
  requestId: string,
  steps: StartSteps,
) => Promise<StartOutcome> {
  const pending = new Map<string, Promise<StartOutcome>>();
  return (requestId, steps): Promise<StartOutcome> => {
    const existing = pending.get(requestId);
    if (existing !== undefined) return existing;
    const request = startChatWithMessage(steps).finally(() => {
      pending.delete(requestId);
    });
    pending.set(requestId, request);
    return request;
  };
}
