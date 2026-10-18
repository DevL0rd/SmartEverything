import type { AiModelRoute, Engine } from '@smarteverything/domain';
import { commandIntent } from '../commands/intent';
import { requestsReferences } from '../references/intent';

export function draftNeedsChat(engine: Engine | null, text: string): boolean {
  const own = engine?.kind === 'dsh' || engine?.kind === 'openrouter';
  const mentions = own || engine?.kind === 'claude';
  return (own && commandIntent(text).kind !== 'text') || (mentions && requestsReferences(text));
}

export interface SuggestionContext {
  readonly climate: boolean;
  readonly health: boolean;
  readonly cameras: boolean;
  readonly computer: boolean;
}

const COMPUTER_SUGGESTION = 'Summarise what changed in ~/repo today';
const CAPABILITIES_SUGGESTION = 'What can you do?';
const LIGHTS_SUGGESTION = 'Dim the living room at sunset';

export function draftSuggestions(context: SuggestionContext): readonly string[] {
  const first = context.climate ? 'How’s the air at home?' : 'What’s on at home right now?';
  if (context.computer) {
    return [COMPUTER_SUGGESTION, first, LIGHTS_SUGGESTION, CAPABILITIES_SUGGESTION];
  }
  const third = context.cameras
    ? 'What did the door camera see today?'
    : context.health
      ? 'Log my dinner'
      : 'Make a bedtime routine';
  return [first, LIGHTS_SUGGESTION, third, CAPABILITIES_SUGGESTION];
}

export function engineUsesOpenRouter(engine: Engine, routes: readonly AiModelRoute[]): boolean {
  if (engine.kind === 'openrouter') return true;
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
  if (readiness.loading) return 'Loading your default model…';
  if (readiness.needsKey) return KEY_NEEDED_STATUS;
  return readiness.blocked;
}

export function runLineOf(host: string, access: string | null): string {
  return access === null ? `Running on ${host}` : `Running on ${host} · ${access}`;
}

export function sendFailureNotice(host: string): string {
  return `Couldn’t send. ${host} didn’t answer. Your message is still here.`;
}

export const MACHINE_UNAVAILABLE_NOTICE =
  'Couldn’t send. The selected machine isn’t available. Your message is still here.';

export type StartOutcome =
  | { readonly kind: 'sent'; readonly chatId: string }
  | { readonly kind: 'failed'; readonly stage: 'create' | 'send'; readonly cause: unknown };

export interface StartSteps {
  readonly create: () => Promise<{ readonly id: string }>;
  readonly send: (chatId: string) => Promise<unknown>;
  readonly remove: (chatId: string) => Promise<void>;
}

export async function startChatWithMessage(steps: StartSteps): Promise<StartOutcome> {
  let created: { readonly id: string };
  try {
    created = await steps.create();
  } catch (cause) {
    return { kind: 'failed', stage: 'create', cause };
  }
  try {
    await steps.send(created.id);
    return { kind: 'sent', chatId: created.id };
  } catch (cause) {
    await steps.remove(created.id);
    return { kind: 'failed', stage: 'send', cause };
  }
}
