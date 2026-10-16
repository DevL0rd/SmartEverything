import {
  MAX_AUTOMATION_DEPTH,
  MAX_AUTOMATION_NODES,
  ApiError,
  AUTOMATION_DEFINITION,
  walkActions,
  actionBlocks,
  type Action,
  type AutomationSequenceDefinition,
  type AutomationSequenceRow,
  type AutomationInput,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

export interface AutomationProgram {
  readonly actions: readonly Action[];
  readonly sequences: ReadonlyMap<string, AutomationSequenceRow>;
}
export function automationProgram(
  store: Pick<Store, 'automationSequences'>,
  actions: readonly Action[],
  ownSequenceId?: string,
): AutomationProgram {
  const sequences = new Map<string, AutomationSequenceRow>();
  let count = 0;
  const visit = (block: readonly Action[], stack: readonly string[], depth: number): void => {
    if (depth > MAX_AUTOMATION_DEPTH)
      throw new ApiError('invalid_request', 'Sequence expansion exceeds maximum depth.');
    for (const action of block) {
      count += 1 + (action.type === 'choose' ? action.branches.length : 0);
      if (count > MAX_AUTOMATION_NODES)
        throw new ApiError('invalid_request', 'Sequence expansion exceeds maximum nodes.');
      for (const child of actionBlocks(action)) visit(child, stack, depth + 1);
      if (action.type !== 'sequence') continue;
      if (stack.includes(action.sequenceId))
        throw new ApiError('invalid_request', 'Sequence reference cycles are not allowed.');
      const sequence = store.automationSequences.byId(action.sequenceId);
      validateParameters(sequence.definition, action.parameters);
      sequences.set(sequence.id, sequence);
      visit(sequence.definition.actions, [...stack, sequence.id], depth + 1);
    }
  };
  visit(actions, ownSequenceId === undefined ? [] : [ownSequenceId], 1);
  return { actions, sequences };
}
export function programActions(program: AutomationProgram): readonly Action[] {
  return [
    program.actions,
    ...[...program.sequences.values()].map((sequence) => sequence.definition.actions),
  ].flatMap(walkActions);
}
export function validateParameters(
  definition: AutomationSequenceDefinition,
  parameters: Readonly<Record<string, AutomationInput>>,
): void {
  const expected = definition.parameters;
  if (expected.length !== Object.keys(parameters).length)
    throw new ApiError('invalid_request', 'Sequence arguments must match its declared parameters.');
  for (const parameter of expected) {
    if (parameters[parameter.name]?.binding.kind !== parameter.kind)
      throw new ApiError(
        'invalid_request',
        `Sequence parameter ${parameter.name} requires kind ${parameter.kind}.`,
      );
  }
}

export function validateSequenceConsumers(
  store: Store,
  id: string,
  definition: AutomationSequenceDefinition,
): void {
  const automations = store.automations.list().flatMap((row) => {
    const parsed = AUTOMATION_DEFINITION.safeParse(row.definition);
    return parsed.success ? [parsed.data.actions] : [];
  });
  const blocks = [
    ...automations,
    ...store.automationSequences
      .list()
      .filter((row) => row.id !== id)
      .map((row) => row.definition.actions),
  ];
  for (const action of blocks.flatMap(walkActions)) {
    if (action.type === 'sequence' && action.sequenceId === id)
      validateParameters(definition, action.parameters);
  }
}
