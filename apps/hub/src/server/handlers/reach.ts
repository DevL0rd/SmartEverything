import { API_ENDPOINTS as E, ApiError, type PluginOrigin } from '@smarteverything/domain';
import { pluginOriginOf } from '../../ai-tools/plugin-turn';
import { presenceOf, type PresenceSources } from '../../reach/presence';
import { ReachRefusedError } from '../../reach/reach-errors';
import type { Asker } from '../../reach/reach-guards';
import type { AppSpeech } from '../../reach/app-speech';
import { speechTextShown } from '../../reach/speech-text';
import type { ReachRules } from '../../reach/reach-rules';
import type { ReachService } from '../../reach/reach-service';
import { clientOf, ownerOrSelf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';

export interface Reach {
  readonly service: ReachService;
  readonly rules: ReachRules;
  readonly speech: AppSpeech;
  readonly presence: PresenceSources;
}

function originOf(caller: Caller): PluginOrigin | null {
  return caller.kind === 'client' ? pluginOriginOf(caller) : null;
}

function askerOf(context: ServerContext, caller: Caller): Asker {
  const client = clientOf(caller);
  return {
    profileId: profileIdOf(context.store, caller),
    role: client.role,
    clientId: client.id,
    chatId: caller.kind === 'client' ? (caller.chatId ?? null) : null,
    origin: originOf(caller),
  };
}

function personOf(asker: Asker, asked: string | undefined): string {
  const person = asked ?? asker.profileId;
  ownerOrSelf(asker.role, person === asker.profileId);
  return person;
}

async function refusing<T>(work: () => T | Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (cause) {
    if (cause instanceof ReachRefusedError) {
      throw new ApiError('conflict', cause.message);
    }
    throw cause;
  }
}

const reachingRoutes = (context: ServerContext, { service }: Reach) =>
  ({
    callPerson: bound(E.callPerson, ({ body, caller }) =>
      refusing(() => service.call(askerOf(context, caller), body)),
    ),
    speak: bound(E.speak, ({ body, caller }) =>
      refusing(() => service.speak(askerOf(context, caller), body)),
    ),
    startConversation: bound(E.startConversation, ({ body, caller }) =>
      refusing(() => service.startConversation(askerOf(context, caller), body)),
    ),
    notifyPerson: bound(E.notifyPerson, ({ body, caller }) =>
      refusing(() => service.notify(askerOf(context, caller), body)),
    ),
  }) as const;

const outreachRoutes = (context: ServerContext, { service, speech }: Reach) =>
  ({
    listOutreach: bound(E.listOutreach, ({ query, caller }) =>
      context.store.aiOutreach.recent(
        personOf(askerOf(context, caller), query.personId),
        query.limit,
      ),
    ),
    endOutreach: bound(E.endOutreach, ({ params, caller }) =>
      refusing(() => {
        const asker = askerOf(context, caller);
        const row = context.store.aiOutreach.byId(params.outreachId);
        ownerOrSelf(asker.role, asker.profileId === row.profile_id);
        return service.hangUp(params.outreachId);
      }),
    ),
    muteOutreach: bound(E.muteOutreach, ({ params, body, caller }) =>
      refusing(() => {
        const asker = askerOf(context, caller);
        const row = context.store.aiOutreach.byId(params.outreachId);
        ownerOrSelf(asker.role, asker.profileId === row.profile_id);
        return service.mute(params.outreachId, body.muted);
      }),
    ),
    readAiSpeech: bound(E.readAiSpeech, ({ params, caller }) => {
      const { id } = clientOf(caller);
      return { ...speech.fetch(id, params.speechId), showText: speechTextShown(context.store, id) };
    }),
    declineOutreach: bound(E.declineOutreach, ({ params, caller }) =>
      refusing(() => service.ringing.decline(params.outreachId, clientOf(caller).id)),
    ),
  }) as const;

const ruleRoutes = (context: ServerContext, { presence, rules }: Reach) =>
  ({
    readPresence: bound(E.readPresence, ({ query, caller }) => {
      const asker = askerOf(context, caller);
      return presenceOf(presence, personOf(asker, query.personId), asker.profileId);
    }),
    readReachSettings: bound(E.readReachSettings, ({ caller }) =>
      rules.settings(askerOf(context, caller).profileId),
    ),
    updateReachSettings: bound(E.updateReachSettings, ({ body, caller }) => {
      const asker = askerOf(context, caller);
      if ((body.cameras !== undefined || body.wakeOff !== undefined) && asker.role !== 'owner') {
        throw new ApiError(
          'forbidden',
          'Only an owner chooses which cameras the AI may talk through and listen on.',
        );
      }
      return rules.save(personOf(asker, body.personId), body);
    }),
  }) as const;

export const reachRoutes = (context: ServerContext, reach: Reach) =>
  ({
    ...reachingRoutes(context, reach),
    ...outreachRoutes(context, reach),
    ...ruleRoutes(context, reach),
  }) as const;

export type ReachRoutes = ReturnType<typeof reachRoutes>;
