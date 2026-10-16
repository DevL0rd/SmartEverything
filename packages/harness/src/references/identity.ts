import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
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
  _ctx: Context,
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
  const version = await skillFileVersion(skill.path, signal);
  const revision = referenceHash({
    skill: summaryIdentity(skill),
    version,
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

async function skillFileVersion(
  path: string | undefined,
  signal?: AbortSignal,
): Promise<string | undefined> {
  signal?.throwIfAborted();
  if (path === undefined) return undefined;
  const file = await stat(path, { bigint: true });
  signal?.throwIfAborted();
  if (!file.isFile())
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'The selected skill file is unavailable.',
    );
  return referenceHash([file.dev, file.ino, file.size, file.mtimeNs, file.ctimeNs].map(String));
}
