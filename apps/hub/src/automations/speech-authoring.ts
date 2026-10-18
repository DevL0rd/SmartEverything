import {
  ApiError,
  speechTriggerOf,
  type AutomationRow,
  type AutomationV2,
} from '@smarteverything/domain';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import { speechPrincipal } from '../transcripts/speech-principal';
import { admitSpeechSources } from '../transcripts/speech-readers';

export function authorSpeechAutomation(
  store: Store,
  caller: Caller,
  input: {
    readonly definition: AutomationV2;
    readonly save: () => AutomationRow;
    readonly id?: string;
  },
): AutomationRow {
  const { definition, save, id } = input;
  return store.write(() => {
    const triggers = definition.when.flatMap((trigger) =>
      trigger.on === 'speech' ? [speechTriggerOf(trigger)] : [],
    );
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
    else store.speech.save(row.id, String(row.revision), admitted);
    return row;
  });
}
