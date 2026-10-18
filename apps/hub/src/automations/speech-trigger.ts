import { ApiError, speechTriggerOf } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { CommittedSpeech } from '../transcripts/speech';
import { speechIsBot, speechText } from '../transcripts/speech';
import { logSpeechReadFailure } from '../transcripts/speech-failures';
import { speechPhraseMatches } from '../transcripts/speech-phrase';
import { validateSpeechSource } from '../transcripts/speech-readers';
import type { TriggerArmer } from './trigger-armers';

export function speechTriggerArmer(store: Store): TriggerArmer {
  return {
    types: ['speech'],
    arm: (automationId, trigger, fire): (() => void) => {
      if (trigger.on !== 'speech') return (): void => undefined;
      const grant = store.speech.grant(automationId);
      if (grant === undefined) return (): void => undefined;
      const speechTrigger = speechTriggerOf(trigger);
      const validate = (speech?: CommittedSpeech): void => {
        const record = store.automations.byId(automationId);
        const current = store.speech.grant(automationId);
        if (
          !record.enabled ||
          current?.revision !== grant.revision ||
          String(record.revision) !== grant.revision ||
          JSON.stringify(current.principal) !== JSON.stringify(grant.principal)
        )
          throw new ApiError('forbidden', 'The saved speech trigger authorization changed.');
        validateSpeechSource(store, grant.principal, speechTrigger.source, speech);
      };
      try {
        validate();
      } catch (cause) {
        logSpeechReadFailure(cause);
        return (): void => undefined;
      }
      return store.feed.subscribeSpeech((speech) => {
        if (
          speech.commitId <= grant.watermark ||
          (!speechTrigger.includeBots && speechIsBot(speech))
        )
          return;
        try {
          validate(speech);
        } catch (cause) {
          logSpeechReadFailure(cause);
          return;
        }
        if (!speechPhraseMatches(speechTrigger, speechText(speech))) return;
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
