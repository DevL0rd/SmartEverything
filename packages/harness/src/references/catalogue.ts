import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AiReference, AiReferenceKind, AiReferenceSummary } from '@smarteverything/domain';
import { isUserInvocable } from '@deepseek-ai/dsh-skill';
import { referenceHash, skillLookup, skillReference } from './identity';
import { nativeReferencePackages } from './packages';
import type { HarnessPluginReadiness } from '../composition/configuration';

export async function nativeReferenceCatalogue(
  ctx: Context,
  agent: Agent,
  kind: AiReferenceKind,
  options: {
    readonly generation: number;
    readonly readiness: readonly HarnessPluginReadiness[];
    readonly signal?: AbortSignal | undefined;
  },
): Promise<{
  readonly items: readonly AiReferenceSummary[];
  readonly revision: string;
  readonly complete: boolean;
}> {
  const { generation, readiness, signal } = options;
  if (kind === 'skill') {
    const snapshot = await ctx.skills.snapshot(skillLookup(ctx, agent, signal));
    const items: AiReferenceSummary[] = [];
    for (const skill of snapshot.skills) {
      if (!isUserInvocable(skill) || /codex/iu.test(`${skill.provider}:${skill.source}`)) continue;
      items.push({
        reference: await skillReference(ctx, skill, generation, signal),
        label: skill.name,
        subtitle: `${skill.source} · ${skill.provider}`,
        description: skill.description.slice(0, 1000),
      });
    }
    return {
      items,
      revision: referenceHash({ items, generation, complete: snapshot.complete }),
      complete: snapshot.complete,
    };
  }
  const items = await relatedReferences(ctx, agent, kind);
  return { items, revision: referenceHash(items), complete: true };
}
async function relatedReferences(
  ctx: Context,
  agent: Agent,
  kind: AiReferenceKind,
): Promise<readonly AiReferenceSummary[]> {
  const packages = nativeReferencePackages(ctx);
  if (kind === 'plugin') {
    for (const entry of packages) await entry.asset.verify();
    return packages.map((entry) => ({
      reference: {
        kind: 'plugin' as const,
        asset_id: entry.asset.asset.id,
        revision: referenceHash(entry.asset.asset),
      },
      label: entry.name,
      subtitle: 'Installed package',
      description: entry.description.slice(0, 1000),
    }));
  }
  if (kind === 'agent')
    return packages.flatMap((entry) =>
      entry.agents
        .filter((helper) => ctx.tools.get(helper.tool, agent) !== undefined)
        .map((helper) => ({
          reference: {
            kind: 'agent' as const,
            identity: helper.identity,
            revision: referenceHash({ asset: entry.asset.asset, helper }),
          },
          label: helper.name,
          subtitle: entry.name,
          description: helper.description.slice(0, 1000),
        })),
    );
  if (kind === 'command') return commandReferences(ctx, agent, readiness);
  return [];
}
export function exactReferenceItem(
  items: readonly AiReferenceSummary[],
  reference: AiReference,
): AiReferenceSummary | undefined {
  return items.find((item) => JSON.stringify(item.reference) === JSON.stringify(reference));
}

function commandReferences(
  ctx: Context,
  agent: Agent,
  readiness: readonly HarnessPluginReadiness[],
): readonly AiReferenceSummary[] {
  const restricted = new Set(
    nativeReferencePackages(ctx).flatMap((entry) => entry.restrictedCommands),
  );
  return ctx.commands
    .list(agent)
    .flatMap((command) =>
      command.definitionId === undefined || restricted.has(command.definitionId)
        ? []
        : [
            {
              reference: {
                kind: 'command' as const,
                definition_id: command.definitionId,
                revision: referenceHash({ command, readiness }),
              },
              label: `/${command.name}`,
              subtitle: 'Native command · explicit invocation required',
              description: command.description.slice(0, 1000),
            },
          ],
    );
}
