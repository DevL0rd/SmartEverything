import type { AiChatRow, AiHarnessSession } from '@smarteverything/domain';
import { useChatHarness } from './harness';
import { contextUsage, type ContextUsage } from '../model/context-usage';

export function useContextUsage(chat: AiChatRow): ContextUsage {
  const native = chat.engine.kind === 'dsh' || chat.engine.kind === 'openrouter';
  const session = useChatHarness(chat.id, native);
  return contextUsage(
    native ? selectedContext(chat, session.data?.context) : undefined,
    chat.context_percent,
    native,
  );
}

function selectedContext(
  chat: AiChatRow,
  context: AiHarnessSession['context'],
): AiHarnessSession['context'] {
  if (
    chat.engine.kind === 'dsh' &&
    context !== undefined &&
    (context.provider !== chat.engine.model_route_id || context.model !== chat.engine.model)
  )
    return undefined;
  return context;
}
