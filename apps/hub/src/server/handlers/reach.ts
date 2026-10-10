import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { presenceOf, type PresenceSources } from '../../reach/presence';
import { ReachRefusedError } from '../../reach/reach-errors';
import { mayManage, type Asker } from '../../reach/reach-guards';
import type { ReachRules } from '../../reach/reach-rules';
import type { ReachService } from '../../reach/reach-service';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

export interface Reach {
  readonly service: ReachService;
  readonly rules: ReachRules;
  readonly presence: PresenceSources;
}

export type ReachRoutes = Record<
  | 'readPresence'
  | 'callPerson'
  | 'speak'
  | 'startConversation'
  | 'notifyPerson'
  | 'listOutreach'
  | 'endOutreach'
  | 'declineOutreach'
  | 'readReachSettings'
  | 'updateReachSettings',
  Bound
>;

function askerOf(context: ServerContext, caller: Caller): Asker {
  const client = clientOf(caller);
  return {
    profileId: profileIdOf(context.store, caller),
    role: client.role,
    clientId: client.id,
    chatId: caller.kind === 'client' ? (caller.chatId ?? null) : null,
  };
}

function personOf(asker: Asker, asked: string | undefined): string {
  if (asked === undefined || asked === asker.profileId) {
    return asker.profileId;
  }
  if (asker.role !== 'owner') {
    throw new ApiError('forbidden', 'Only an owner can see or change another person’s reach.');
  }
  return asked;
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

function reachingRoutes(
  context: ServerContext,
  reach: Reach,
): Pick<ReachRoutes, 'callPerson' | 'speak' | 'startConversation' | 'notifyPerson'> {
  const { service } = reach;
  const ask = (caller: Caller): Asker => askerOf(context, caller);
  return {
    callPerson: bound(E.callPerson, ({ body, caller }) =>
      refusing(() => service.call(ask(caller), body)),
    ),
    speak: bound(E.speak, ({ body, caller }) => refusing(() => service.speak(ask(caller), body))),
    startConversation: bound(E.startConversation, ({ body, caller }) =>
      refusing(() => service.startConversation(ask(caller), body)),
    ),
    notifyPerson: bound(E.notifyPerson, ({ body, caller }) =>
      refusing(() => service.notify(ask(caller), body)),
    ),
  };
}

function outreachRoutes(
  context: ServerContext,
  reach: Reach,
): Pick<ReachRoutes, 'listOutreach' | 'endOutreach' | 'declineOutreach'> {
  const { store } = context;
  const { service } = reach;
  return {
    listOutreach: bound(E.listOutreach, ({ query, caller }) =>
      store.aiOutreach.recent(personOf(askerOf(context, caller), query.personId), query.limit),
    ),
    endOutreach: bound(E.endOutreach, ({ params, caller }) =>
      refusing(() => {
        mayManage(askerOf(context, caller), store.aiOutreach.byId(params.outreachId));
        return service.hangUp(params.outreachId);
      }),
    ),
    declineOutreach: bound(E.declineOutreach, ({ params, caller }) =>
      refusing(() => service.ringing.decline(params.outreachId, clientOf(caller).id)),
    ),
  };
}

function ruleRoutes(
  context: ServerContext,
  reach: Reach,
): Pick<ReachRoutes, 'readPresence' | 'readReachSettings' | 'updateReachSettings'> {
  return {
    readPresence: bound(E.readPresence, ({ query, caller }) => {
      const asker = askerOf(context, caller);
      return presenceOf(reach.presence, personOf(asker, query.personId), asker.profileId);
    }),
    readReachSettings: bound(E.readReachSettings, ({ caller }) =>
      reach.rules.settings(askerOf(context, caller).profileId),
    ),
    updateReachSettings: bound(E.updateReachSettings, ({ body, caller }) => {
      const asker = askerOf(context, caller);
      if ((body.cameras !== undefined || body.wakeOff !== undefined) && asker.role !== 'owner') {
        throw new ApiError(
          'forbidden',
          'Only an owner chooses which cameras the AI may talk through and listen on.',
        );
      }
      return reach.rules.save(personOf(asker, body.personId), body);
    }),
  };
}

export function reachRoutes(context: ServerContext, reach: Reach): ReachRoutes {
  return {
    ...reachingRoutes(context, reach),
    ...outreachRoutes(context, reach),
    ...ruleRoutes(context, reach),
  };
}
