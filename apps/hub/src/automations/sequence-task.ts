import type { AutomationSequenceRow } from '@smarteverything/domain';
import {
  currentExecutionAuthorities,
  validateExecutionAuthority,
  withExecutionAuthorities,
} from '../assistant/execution-authority';
import type { Store } from '../store/store';
import type { OwnedRunTask } from './owned-runs';
import {
  authorityEvents,
  runOwner,
  snapshotProgram,
  validateProgramSnapshot,
} from './program-snapshot';

export function ownedSequenceTask(
  store: Store,
  sequence: AutomationSequenceRow,
  execute: OwnedRunTask['execute'],
  admit: () => void,
): OwnedRunTask {
  const snapshot = snapshotProgram(store, sequence.definition.actions, sequence);
  const initiating = [...currentExecutionAuthorities()];
  const validate = (): void => {
    validateProgramSnapshot(store, snapshot);
    for (const authority of initiating) validateExecutionAuthority(store, authority);
    withExecutionAuthorities(initiating, admit);
  };
  return {
    automationId: sequence.id,
    targetType: 'sequence',
    revision: sequence.revision,
    definition: sequence.definition,
    ownerProfileId: runOwner(store, 'sequence', sequence.id),
    authorityIds: [
      ...new Set(
        authorityEvents([...initiating, ...snapshot.authorities.flatMap((row) => row.sources)]),
      ),
    ],
    references: snapshot.scenes,
    sequences: snapshot.program.sequences,
    validate,
    execute: (context) => withExecutionAuthorities(initiating, () => execute(context)),
  };
}
