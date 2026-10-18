import type { Context } from '@deepseek-ai/cordis';
import {
  createAssistantMessage,
  createSystemMessage,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm';
import type { RequestMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import type {
  HarnessRuntimeRequest,
  AiModelRouteSelection,
  AiModelRoute,
} from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';

const AUXILIARY_IDLE_MS = 60_000;
type Auxiliary = Extract<HarnessRuntimeRequest, { kind: 'auxiliary' }>;
export async function auxiliaryText(
  ctx: Context,
  selection: AiModelRouteSelection,
  input: Auxiliary,
): Promise<string> {
  const controller = new AbortController();
  const idle = setTimeout(() => {
    controller.abort(
      new HarnessRuntimeError('source_outcome_unknown', 'The auxiliary stream went silent.'),
    );
  }, AUXILIARY_IDLE_MS);
  try {
    return await auxiliaryStream(ctx, selection, input, { controller, idle });
  } finally {
    clearTimeout(idle);
  }
}
async function auxiliaryStream(
  ctx: Context,
  selection: AiModelRouteSelection,
  input: Auxiliary,
  watch: { readonly controller: AbortController; readonly idle: NodeJS.Timeout },
): Promise<string> {
  let text = '';
  let finished = false;
  for await (const chunk of ctx.llm.stream({
    provider: selection.route_id,
    model: selection.model,
    sessionId: SessionId(input.session_id),
    ...(selection.effort === null ? {} : { reasoningEffort: ReasoningEffortId(selection.effort) }),
    messages: input.messages.map((message) => auxiliaryMessage(message, selection)),
    maxTokens: input.max_tokens,
    signal: watch.controller.signal,
  })) {
    watch.idle.refresh();
    if (chunk.type === 'text-delta') text += chunk.text;
    if (chunk.type === 'finish') {
      if (chunk.reason.kind !== 'stop' && chunk.reason.kind !== 'max-tokens')
        throw new HarnessRuntimeError(
          'operation_failed',
          'The selected supplier did not complete the auxiliary request.',
        );
      finished = true;
    }
  }
  if (!finished)
    throw new HarnessRuntimeError(
      'source_outcome_unknown',
      'Auxiliary stream ended without a native terminal outcome.',
    );
  return text;
}
function auxiliaryMessage(
  message: Auxiliary['messages'][number],
  selection: AiModelRouteSelection,
): RequestMessage {
  if (message.role === 'system') return createSystemMessage(message.text);
  if (message.role === 'assistant')
    return createAssistantMessage({
      content: [{ type: 'text', text: message.text }],
      source: { provider: selection.route_id, model: selection.model },
    });
  return { role: 'user', content: [{ type: 'text', text: message.text }] };
}

export function admitRuntimeRoute(
  selection: AiModelRouteSelection,
  lookup: (id: string) => AiModelRoute,
): void {
  const route = lookup(selection.route_id);
  if (
    route.state !== 'ready' ||
    route.capability_revision !== selection.capability_revision ||
    !route.models.some((model) => model.id === selection.model)
  )
    throw new HarnessRuntimeError(
      'route_unavailable',
      'This explicit model route is unavailable; there is no fallback.',
    );
}
