import { logSpeechReadFailure } from '../transcripts/speech-failures';
import { speechPhraseMatches } from '../transcripts/speech-phrase';
import { ApiError } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { automationDefinitionRevision } from '../store/repositories/automation-revisions';
import type { CommittedSpeech } from '../transcripts/speech';
import { speechIsBot, speechText } from '../transcripts/speech';
import { validateSpeechSource } from '../transcripts/speech-readers';
import type { TriggerArmer } from './trigger-armers';

export function speechTriggerArmer(store: Store): TriggerArmer {
  return {
    types: ['speech'],
    arm: (automationId, trigger, fire): (() => void) => {
      if (trigger.type !== 'speech') return (): void => undefined;
      const grant = store.speech.grant(automationId);
      if (grant === undefined) return (): void => undefined;
      const validate = (speech?: CommittedSpeech): void => {
        const record = store.automations.byId(automationId);
        const current = store.speech.grant(automationId);
        if (
          !record.enabled ||
          current?.revision !== grant.revision ||
          automationDefinitionRevision(record.definition) !== grant.revision ||
          JSON.stringify(current.principal) !== JSON.stringify(grant.principal)
        )
          throw new ApiError('forbidden', 'The saved speech trigger authorization changed.');
        validateSpeechSource(store, grant.principal, trigger.source, speech);
      };
      try {
        validate();
      } catch (cause) {
        logSpeechReadFailure(cause);
        return (): void => undefined;
      }
      return store.feed.subscribeSpeech((speech) => {
        if (speech.commitId <= grant.watermark || (!trigger.includeBots && speechIsBot(speech)))
          return;
        try {
          validate(speech);
        } catch (cause) {
          logSpeechReadFailure(cause);
          return;
        }
        if (!speechPhraseMatches(trigger, speechText(speech))) return;
        fire(null, {
          validate: (): void => {
            validate(speech);
          },
          occurrence: { automationId, revision: grant.revision, commitId: speech.commitId },
        });
      });
    },
  };
}
