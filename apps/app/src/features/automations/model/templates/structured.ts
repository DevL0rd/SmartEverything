import type { NodeKindLookup } from '@smarteverything/domain';
import type { AutomationV3 } from '@smarteverything/domain';
import type { GraphProblem } from '@smarteverything/flow/graph/problem-types';
import { structureAutomation } from '../../data/graph-adapter';
import type { SlotValues, Template } from './parameters';

export class TemplateStructureError extends Error {
  override readonly name = 'TemplateStructureError';

  constructor(
    readonly templateId: string,
    readonly problems: readonly GraphProblem[],
  ) {
    super(
      `Template ${templateId} does not turn into steps: ${problems.map((found) => found.message).join(' ')}`,
    );
  }
}

export function templateTree(
  entry: Template,
  values: SlotValues | undefined,
  kinds: NodeKindLookup,
): AutomationV3 {
  const found = structureAutomation(entry.build(values), kinds);
  if (found.kind === 'unstructured') throw new TemplateStructureError(entry.id, found.problems);
  return found.value.tree;
}
