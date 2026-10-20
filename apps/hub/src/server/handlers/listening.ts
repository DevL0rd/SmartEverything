import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { readableSpeechSources } from '../../transcripts/speech-catalogue';
import { speechPrincipal } from '../../transcripts/speech-principal';
import type { WakeTest } from '../../wake-name/wake-test';
import type { PhoneEars } from '../../listening/phone-ears';
import type { ListeningRegistry, ListeningViewer } from '../../listening/listening-registry';
import { phoneIdentityOf } from '../../phones/phone-identity';
import { clientOf, profileIdOf, roleOfCaller, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';

function viewerOf(context: ServerContext, caller: Caller): ListeningViewer {
  return {
    owner: roleOfCaller(caller) === 'owner',
    profileId: profileIdOf(context.store, caller),
  };
}

function enrollPhone(context: ServerContext, caller: Caller): Promise<void> {
  return context.hub.phones.enroll(phoneIdentityOf(context.store, caller, 'listens as a phone'));
}

export const listeningRoutes = (
  context: ServerContext,
  registry: ListeningRegistry,
  phones: PhoneEars,
  wakeTest: WakeTest,
) =>
  ({
    listSpeechSources: bound(E.listSpeechSources, ({ caller }) =>
      readableSpeechSources(context.store, speechPrincipal(context.store, caller), registry),
    ),
    readListening: bound(E.readListening, ({ caller }) => registry.view(viewerOf(context, caller))),
    updateListeningSource: bound(E.updateListeningSource, ({ params, body, caller }) =>
      registry.change(viewerOf(context, caller), params.sourceKey, body),
    ),
    watchListeningLevel: bound(E.watchListeningLevel, async ({ body, caller }) => {
      if (body.sourceKey !== null) {
        await registry.source(viewerOf(context, caller), body.sourceKey);
      }
      registry.levels.watch(clientOf(caller).id, body.sourceKey);
      return DONE_REPLY;
    }),
    watchWakeTest: bound(E.watchWakeTest, ({ body, caller }) => {
      wakeTest.watch(clientOf(caller).id, body.on);
      return DONE_REPLY;
    }),
    readPhoneListeningConfig: bound(E.readPhoneListeningConfig, async ({ caller }) => {
      await enrollPhone(context, caller);
      return phones.config(clientOf(caller).id);
    }),
    claimPhoneWake: bound(E.claimPhoneWake, async ({ body, caller }) => {
      await enrollPhone(context, caller);
      return phones.claim(clientOf(caller).id, body);
    }),
    reportPhoneListening: bound(E.reportPhoneListening, async ({ body, caller }) => {
      await enrollPhone(context, caller);
      phones.report(clientOf(caller).id, body);
      return DONE_REPLY;
    }),
  }) as const;

export type ListeningRoutes = ReturnType<typeof listeningRoutes>;
