import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { AiReference, AiReferenceKind, AiReferenceSummary } from '@smarteverything/domain';
import { isUserInvocable } from '@deepseek-ai/dsh-skill';
import { referenceHash, skillLookup, skillReference } from './identity';
import { nativeReferencePackages } from './packages';
import { withNativeSkills } from './skills';
import type { HarnessPluginReadiness } from '../composition/configuration';

export async function nativeReferenceCatalogue(
  ctx: Context,
  agent: Agent,
  kind: AiReferenceKind,
  options: {
    readonly readiness: readonly HarnessPluginReadiness[];
    readonly signal?: AbortSignal | undefined;
  },
): Promise<{ readonly items: readonly AiReferenceSummary[]; readonly revision: string }> {
  const { readiness, signal } = options;
  if (kind === 'skill')
    return withNativeSkills(ctx, async (skills) => {
      const snapshot = await skills.snapshot(skillLookup(ctx, agent, signal));
      const items = snapshot.skills.filter(isUserInvocable).map((skill): AiReferenceSummary => ({
        reference: skillReference(skill),
        label: skill.name,
        subtitle: `${skill.source} · ${skill.provider}`,
        description: skill.description.slice(0, 1000),
      }));
      return { items, revision: referenceHash(items) };
    });
  const items = await relatedReferences(ctx, agent, kind, readiness);
  return { items, revision: referenceHash(items) };
}
async function relatedReferences(
  ctx: Context,
  agent: Agent,
  kind: AiReferenceKind,
  readiness: readonly HarnessPluginReadiness[],
): Promise<readonly AiReferenceSummary[]> {
  const packages = nativeReferencePackages(ctx);
  if (kind === 'plugin') {
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
export function findReferenceItem(
  items: readonly AiReferenceSummary[],
  reference: AiReference,
): AiReferenceSummary | undefined {
  const key = referenceKey(reference);
  return items.find((item) => referenceKey(item.reference) === key);
}

function referenceKey(reference: AiReference): string {
  switch (reference.kind) {
    case 'skill':
      return `skill|${reference.identity}`;
    case 'plugin':
      return `plugin|${reference.asset_id}`;
    case 'agent':
      return `agent|${reference.identity}`;
    case 'command':
      return `command|${reference.definition_id}`;
    case 'managed_path':
    case 'device_path':
    case 'chat':
      return JSON.stringify(reference);
  }
}

function commandReferences(
  ctx: Context,
  agent: Agent,
  readiness: readonly HarnessPluginReadiness[],
): readonly AiReferenceSummary[] {
  const restricted = new Set(
    nativeReferencePackages(ctx).flatMap((entry) => entry.restrictedCommands),
  );
  return ctx.commands.list(agent).flatMap((command) =>
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
