import {
  API_ENDPOINTS as E,
  AI_ACTION_TYPES,
  ApiError,
  SIGNAL_SOURCES,
  type AutomationDefinition,
  type ResponseOf,
  type SignalInput,
  type SignalSourceSpec,
} from '@smarteverything/domain';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

type SignalRoutes = Record<'listSignalKinds' | 'readSignal' | 'listWakes', Bound>;

function sourceInfo(spec: SignalSourceSpec): ResponseOf<'listSignalKinds'>[number] {
  return {
    ...spec,
    kinds: spec.kinds.map((kind) => ({
      ...kind,
      fields: kind.fields === 'capabilities' ? kind.fields : [...kind.fields],
    })),
  };
}

function isOwner(caller: Caller): boolean {
  return clientOf(caller).role === 'owner';
}

function visibleTo(context: ServerContext, caller: Caller): (signal: SignalInput) => boolean {
  if (isOwner(caller)) {
    return () => true;
  }
  const profileId = profileIdOf(context.store, caller);
  return (signal) => signal.profileId === null || signal.profileId === profileId;
}

function wakesProfile(context: ServerContext, caller: Caller, asked: string | undefined): string {
  const own = profileIdOf(context.store, caller);
  if (asked === undefined || asked === own) {
    return own;
  }
  if (!isOwner(caller)) {
    throw new ApiError('forbidden', 'Only an owner can see another person’s AI wakes.');
  }
  return asked;
}

export function requireOwnerForAiActions(
  caller: Caller,
  definition: Pick<AutomationDefinition, 'actions'>,
): void {
  if (definition.actions.some((action) => AI_ACTION_TYPES.has(action.type)) && !isOwner(caller)) {
    throw new ApiError(
      'forbidden',
      'Only an owner can save automations that wake the AI or use tools.',
    );
  }
}

export function signalRoutes(context: ServerContext): SignalRoutes {
  const { store, hub } = context;
  return {
    listSignalKinds: bound(E.listSignalKinds, () => SIGNAL_SOURCES.map(sourceInfo)),
    readSignal: bound(E.readSignal, ({ query, caller }) => {
      const visible = visibleTo(context, caller);
      return hub.signals.latest(query).filter(visible).slice(0, query.limit);
    }),
    listWakes: bound(E.listWakes, ({ query, caller }) =>
      store.aiWakes.recent(wakesProfile(context, caller, query.profileId), query.limit),
    ),
  };
}
