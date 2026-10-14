import { createHash } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { isUserInvocable } from '@deepseek-ai/dsh-skill';
import type { SkillSummary, SkillViewOptions } from '@deepseek-ai/dsh-skill';
import type { AiReference } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';

export function referenceHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function skillLookup(ctx: Context, agent: Agent, signal?: AbortSignal): SkillViewOptions {
  return { scope: agent, cwd: ctx.workingDirectory.get(agent.session), signal };
}
export async function skillReference(
  ctx: Context,
  skill: SkillSummary,
  generation: number,
  signal?: AbortSignal,
): Promise<Extract<AiReference, { kind: 'skill' }>> {
  if (!isUserInvocable(skill) || /codex/iu.test(`${skill.provider}:${skill.source}`))
    throw new HarnessRuntimeError('capability_unsupported', 'This skill is not user-invocable.');
  const resource_base = JSON.stringify(
    skill.resourceBase ?? { kind: 'opaque', description: skill.provider },
  );
  const identity = referenceHash({
    provider: skill.provider,
    source: skill.source,
    name: skill.name,
    path: skill.path,
    resource_base,
  });
  const file =
    skill.path === undefined
      ? undefined
      : await ctx.fs.stat(
          await ctx.fs.resolve(skill.path, signal === undefined ? undefined : { signal }),
          signal,
        );
  if (skill.path !== undefined && file?.type !== 'file')
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'The selected skill file is unavailable.',
    );
  const revision = referenceHash({
    skill: summaryIdentity(skill),
    version: file?.version,
    generation,
  });
  return {
    kind: 'skill',
    name: skill.name,
    provider: skill.provider,
    source: skill.source,
    identity,
    revision,
    resource_base,
  };
}

function summaryIdentity(skill: SkillSummary): unknown {
  return {
    name: skill.name,
    description: skill.description,
    whenToUse: skill.whenToUse,
    invocation: skill.invocation,
    provider: skill.provider,
    source: skill.source,
    path: skill.path,
    resourceBase: skill.resourceBase,
  };
}
