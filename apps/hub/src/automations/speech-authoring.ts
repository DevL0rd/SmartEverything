import { ApiError, type AutomationDefinition, type AutomationRow } from '@smarteverything/domain';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import { automationDefinitionRevision } from '../store/repositories/automation-revisions';
import { speechPrincipal } from '../transcripts/speech-principal';
import { admitSpeechSources } from '../transcripts/speech-readers';

export function authorSpeechAutomation(
  store: Store,
  caller: Caller,
  input: {
    readonly definition: AutomationDefinition;
    readonly save: () => AutomationRow;
    readonly id?: string;
  },
): AutomationRow {
  const { definition, save, id } = input;
  return store.write(() => {
    const triggers = definition.triggers.filter((trigger) => trigger.type === 'speech');
    const prior = id === undefined ? undefined : store.speech.grant(id);
    if (triggers.length === 0 && prior === undefined) return save();
    const principal = speechPrincipal(store, caller);
    if (
      prior !== undefined &&
      (prior.principal.profileId !== principal.profileId || prior.principal.role !== principal.role)
    )
      throw new ApiError(
        'forbidden',
        'Only the initiating profile may change or reauthorize this speech automation.',
      );
    const admitted = admitSpeechSources(store, principal, triggers);
    const row = save();
    if (triggers.length === 0) store.speech.remove(row.id);
    else {
      const revision = automationDefinitionRevision(row.definition);
      store.speech.save(row.id, revision, admitted);
    }
    return row;
  });
}
