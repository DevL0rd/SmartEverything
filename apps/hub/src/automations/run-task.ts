import type { SpeechOccurrence } from '../transcripts/speech';
import { automationDefinitionRevision } from '../store/repositories/automation-revisions';
import {
  ApiError,
  JSON_VALUE,
  jsonEquals,
  type AutomationDefinition,
} from '@smarteverything/domain';
import {
  currentExecutionAuthorities,
  validateExecutionAuthority,
  withExecutionAuthorities,
} from '../assistant/execution-authority';
import type { AutomationRecord } from '../database/port';
import { effectAuthorities } from '../harness/effect-authority';
import type { Store } from '../store/store';
import type { OwnedRunTask } from './owned-runs';
import type { ActionExecutionContext } from './run-context';
import {
  authorityEvents,
  runOwner,
  snapshotProgram,
  validateProgramSnapshot,
} from './program-snapshot';

export interface AutomationRunRequest {
  readonly occurrence?: SpeechOccurrence;
  readonly record: AutomationRecord;
  readonly definition: AutomationDefinition;
  readonly ordered?: boolean;
  readonly admit: (() => void) | undefined;
  readonly execute: (context: ActionExecutionContext) => Promise<string | null>;
}
export function ownedRunTask(store: Store, request: AutomationRunRequest): OwnedRunTask {
  const { record, definition } = request;
  const snapshot = snapshotProgram(store, definition.actions);
  const initiating = [...currentExecutionAuthorities()];
  const saved = effectAuthorities(store, 'automation', record.id);
  const validate = (): void => {
    const current = store.automations.byId(record.id);
    if (
      !jsonEquals(current.definition, JSON_VALUE.parse(record.definition)) ||
      (record.enabled && !current.enabled)
    )
      throw new ApiError(
        'conflict',
        'The automation was changed or disabled while its run was active.',
      );
    validateProgramSnapshot(store, snapshot);
    if (
      !jsonEquals(
        authorityEvents(effectAuthorities(store, 'automation', record.id)),
        authorityEvents(saved),
      )
    )
      throw new ApiError('forbidden', 'The automation’s saved authorization changed.');
    for (const authority of initiating) validateExecutionAuthority(store, authority);
    withExecutionAuthorities(initiating, () => request.admit?.());
  };
  return {
    ...(request.occurrence === undefined ? {} : { occurrence: request.occurrence }),
    ordered: request.ordered === true,
    automationId: record.id,
    revision: automationDefinitionRevision(record.definition),
    definition,
    ownerProfileId: runProfile(store, request),
    authorityIds: [
      ...new Set(
        authorityEvents([
          ...saved,
          ...initiating,
          ...snapshot.authorities.flatMap((row) => row.sources),
        ]),
      ),
    ],
    references: snapshot.scenes,
    sequences: snapshot.program.sequences,
    validate,
    execute: (context) => withExecutionAuthorities(initiating, () => request.execute(context)),
  };
}

function runProfile(store: Store, request: AutomationRunRequest): string | null {
  if (request.occurrence === undefined) return runOwner(store, 'automation', request.record.id);
  return store.speech.grant(request.record.id)?.principal.profileId ?? null;
}
