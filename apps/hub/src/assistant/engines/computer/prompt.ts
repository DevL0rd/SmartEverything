import type { NativeManagedProject } from '@smarteverything/domain';
import { META_TOOL_NAMES } from '../../../ai-tools/tool-sets';
import { stablePrompt, turnPrompt } from '../../conversation/prompt';
import { facts } from '../../prompt-facts';
import type { ComputerRunnerDeps, Turn } from './ports';
import { managedProviderInstructions } from './project-access';
import { PRODUCT_SKILL_GUIDE } from './product-skills';

export function providerPrompt(
  deps: ComputerRunnerDeps,
  turn: Pick<Turn, 'chat' | 'grant'> & { readonly event: Pick<Turn['event'], 'client_id'> },
  project: NativeManagedProject | undefined,
): { readonly system: string; readonly context: string } {
  const { chat, event, grant } = turn;
  const context = facts(deps.store, chat, grant.hub, {
    now: deps.now(),
    clientId: event.client_id,
  });
  const system = managedProviderInstructions(
    stablePrompt({ ...context, executionHost: 'the selected computer' }, deps.runtime),
    project,
  );
  return {
    system: grant.names.has(META_TOOL_NAMES.details)
      ? `${system}\n\n${PRODUCT_SKILL_GUIDE}`
      : system,
    context: turnPrompt(context, deps.runtime),
  };
}
