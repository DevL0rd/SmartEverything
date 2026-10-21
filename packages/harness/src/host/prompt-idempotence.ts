import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { ContextFormed } from '@deepseek-ai/dsh-llm';
import { Logger } from '@smarteverything/logging';

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'runtime-context': { kind: 'runtime-context' } & ContextFormed;
  }
}

const log = new Logger('hub.harness');

export function mountPromptIdempotence(ctx: Context): void {
  ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
    const decision = await next();
    if (decision.kind === 'reject') return decision;
    const known = new Set(agent.session.deriveMessages().map((message) => message.id));
    const fresh = decision.messages.filter(
      (message) => message.source.kind !== 'user' || !known.has(message.id),
    );
    if (fresh.length === decision.messages.length) return decision;
    log.info('session.duplicate_prompt_skipped', {
      session_id: agent.session.id,
      message_ids: messages.filter((message) => known.has(message.id)).map((message) => message.id),
    });
    return { ...decision, messages: fresh.length > 0 ? fresh : [resumeWithoutInput()] };
  });
}

function resumeWithoutInput(): ReturnType<typeof createUserMessage> {
  return createUserMessage({ content: [], source: { kind: 'runtime-context' } });
}
