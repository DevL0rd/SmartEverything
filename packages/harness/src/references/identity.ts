import { createHash } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SkillSummary, SkillViewOptions } from '@deepseek-ai/dsh-skill';
import type { AiReference } from '@smarteverything/domain';

export function referenceHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function skillLookup(ctx: Context, agent: Agent, signal?: AbortSignal): SkillViewOptions {
  return { scope: agent, cwd: ctx.workingDirectory.get(agent.session), signal };
}

export function skillReference(skill: SkillSummary): Extract<AiReference, { kind: 'skill' }> {
  const resource_base = JSON.stringify(
    skill.resourceBase ?? { kind: 'opaque', description: skill.provider },
  );
  return {
    kind: 'skill',
    name: skill.name,
    provider: skill.provider,
    source: skill.source,
    identity: referenceHash({
      provider: skill.provider,
      source: skill.source,
      name: skill.name,
      path: skill.path,
      resource_base,
    }),
    revision: referenceHash({
      description: skill.description,
      whenToUse: skill.whenToUse,
      invocation: skill.invocation,
    }),
    resource_base,
  };
}
