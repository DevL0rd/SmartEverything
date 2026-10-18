import {
  API_ENDPOINTS as E,
  AUTOMATION_RUNTIME_SIGNAL_SOURCES,
  ApiError,
  automationSignalErrorV2,
  type AutomationV2,
  type ResponseOf,
  type SignalInput,
  type SignalSourceSpec,
} from '@smarteverything/domain';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { reachesAi } from '../../automations/ai-steps';
import { installedSignalSources } from '../../signals/sources/installed';
import type { Store } from '../../store/store';
import { bound } from '../router';

function sourceInfo(spec: SignalSourceSpec): ResponseOf<'listSignalKinds'>[number] {
  return {
    ...spec,
    kinds: spec.kinds.map((kind) => ({
      ...kind,
      fields: kind.fields === 'capabilities' ? kind.fields : [...kind.fields],
      match: kind.match.map((entry) => ({
        ...entry,
        values: entry.values === null ? null : [...entry.values],
      })),
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
  store: Pick<Store, 'automations'>,
  caller: Caller,
  definition: Pick<AutomationV2, 'steps'>,
): void {
  if (reachesAi(store, definition) && !isOwner(caller)) {
    throw new ApiError(
      'forbidden',
      'Only an owner can save automations that wake the AI or use tools.',
    );
  }
}

export function requireKnownSignals(
  store: Pick<Store, 'plugins'>,
  definition: Pick<AutomationV2, 'when'>,
): void {
  const error = automationSignalErrorV2(installedSignalSources(store), definition);
  if (error !== null) {
    throw new ApiError('invalid_request', `${error.name}: ${error.message}`);
  }
}

export const signalRoutes = (context: ServerContext) =>
  ({
    listSignalKinds: bound(E.listSignalKinds, ({ query }) =>
      installedSignalSources(context.store)
        .filter(
          (spec) =>
            query.automationRuntime ||
            !AUTOMATION_RUNTIME_SIGNAL_SOURCES.some((runtime) => runtime.source === spec.source),
        )
        .map(sourceInfo),
    ),
    readSignal: bound(E.readSignal, ({ query, caller }) => {
      const visible = visibleTo(context, caller);
      return context.hub.signals.latest(query).filter(visible).slice(0, query.limit);
    }),
    listWakes: bound(E.listWakes, ({ query, caller }) =>
      context.store.aiWakes.recent(wakesProfile(context, caller, query.profileId), query.limit),
    ),
  }) as const;
