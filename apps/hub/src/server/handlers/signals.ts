import {
  API_ENDPOINTS as E,
  AUTOMATION_RUNTIME_SIGNAL_SOURCES,
  ApiError,
  type ResponseOf,
  type SignalInput,
  type SignalSourceSpec,
} from '@smarteverything/domain';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { installedSignalSources } from '../../signals/sources/installed';
import { triggerCatalogueView } from '../../signals/trigger-catalogue-view';
import { deviceScopeOf } from '../person-scope';
import { bound } from '../router';

function sourceInfo(spec: SignalSourceSpec): ResponseOf<'listSignalKinds'>[number] {
  return {
    ...spec,
    kinds: spec.kinds.map((kind) => ({
      ...kind,
      fields: typeof kind.fields === 'string' ? kind.fields : [...kind.fields],
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
    listTriggerCatalogue: bound(E.listTriggerCatalogue, ({ query, caller }) =>
      triggerCatalogueView(context.store, deviceScopeOf(context.store, caller), query),
    ),
    listWakes: bound(E.listWakes, ({ query, caller }) =>
      context.store.aiWakes.recent(wakesProfile(context, caller, query.profileId), query.limit),
    ),
  }) as const;
