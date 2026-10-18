import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { UserMessage, Message } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SkillInvocationSource } from '@deepseek-ai/dsh-skill';
import { isUserInvocable, renderSkillContent } from '@deepseek-ai/dsh-skill';
import { z } from 'zod';
import { AI_MESSAGE_REFERENCES } from '@smarteverything/domain';
import type { AiMessageReference } from '@smarteverything/domain';
import { skillLookup } from './identity';
import { HarnessRuntimeError } from '../host/errors';
import { withNativeSkills } from './skills';

const SOURCE = z.object({ references: AI_MESSAGE_REFERENCES.optional() });
export function referencePromptSource(references: readonly AiMessageReference[]): {
  readonly kind: 'user';
  readonly references: readonly AiMessageReference[];
} {
  return { kind: 'user', references };
}
export function referenceLocatorText(references: readonly AiMessageReference[]): string {
  return `Selected reference locators (metadata only; do not infer access or expand folders): ${JSON.stringify(references.map((item) => item.reference))}. Managed paths belong to central chat storage; use read_project_files with the exact chatId/path, even on a computer. Chat locators use existing chat read tools. Commands and agents require their existing explicit invocation/delegation authority.`;
}
export function mountReferencePrompts(ctx: Context): void {
  const references = new NativePromptReferences(ctx);
  ctx.on('agent/pre-step', async ({ agent, messages, signal }, next) => {
    const decision = await next();
    if (decision.kind === 'reject') return decision;
    const selected = references.collect(messages);
    const names = new Set(
      decision.messages.flatMap((message) =>
        message.source.kind === 'skill-invocation' ? [message.source.name] : [],
      ),
    );
    const injections: UserMessage[] = [];
    for (const item of selected) {
      const reference = item.reference;
      if (reference.kind !== 'skill' || names.has(reference.name)) continue;
      injections.push(await references.skill(agent, reference, signal));
      names.add(reference.name);
    }
    signal.throwIfAborted();
    return { ...decision, messages: [...decision.messages, ...injections] };
  });
}
class NativePromptReferences {
  constructor(private readonly ctx: Context) {}
  collect(messages: readonly Message[]): readonly AiMessageReference[] {
    return messages.flatMap((message) =>
      message.source.kind === 'user' ? (SOURCE.parse(message.source).references ?? []) : [],
    );
  }
  async skill(
    agent: Agent,
    reference: Extract<AiMessageReference['reference'], { kind: 'skill' }>,
    signal: AbortSignal,
  ): Promise<UserMessage> {
    return withNativeSkills(this.ctx, async (skills) => {
      const skill = await skills.get(reference.name, skillLookup(this.ctx, agent, signal));
      if (skill === undefined || !isUserInvocable(skill))
        throw new HarnessRuntimeError(
          'capability_unsupported',
          `The selected skill ${reference.name} is no longer available.`,
        );
      const source: SkillInvocationSource = {
        kind: 'skill-invocation',
        name: skill.name,
        form: 'instructions',
      };
      return createUserMessage({
        content: [{ type: 'text', text: renderSkillContent(skill) }],
        source,
      });
    });
  }
}
