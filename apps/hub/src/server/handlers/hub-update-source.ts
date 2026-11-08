import {
  API_ENDPOINTS as E,
  ApiError,
  type HubUpdateAcceptance,
  type HubUpdateSourceCheck,
  type HubUpdateSourceStart,
  type HubUpdateSourceSave,
  type HubUpdateSourceSaved,
} from '@smarteverything/domain';
import { directClient, type Caller } from '../auth';
import { bound, type Routes } from '../router';

function directOwner(caller: Caller): string | undefined {
  const client = directClient(caller);
  return client?.role === 'owner' ? client.id : undefined;
}

interface HubUpdateSourceService {
  readonly check: (ownerClient: string | undefined) => Promise<HubUpdateSourceCheck>;
  readonly save: (
    ownerClient: string,
    request: HubUpdateSourceSave,
  ) => Promise<HubUpdateSourceSaved>;
  readonly start: (
    ownerClient: string,
    request: HubUpdateSourceStart,
  ) => Promise<HubUpdateAcceptance>;
}

export type HubUpdateSourceRoutes = Routes<
  'checkHubUpdateSource' | 'startHubUpdateSource' | 'saveHubUpdateSource'
>;

export function hubUpdateSourceRoutes(
  service: HubUpdateSourceService,
  checkRequested: () => void,
): {
  readonly routes: HubUpdateSourceRoutes;
  readonly settleChecks: () => Promise<void>;
} {
  const checks = new Map<string | undefined, Promise<HubUpdateSourceCheck>>();
  const routes: HubUpdateSourceRoutes = {
    checkHubUpdateSource: bound(E.checkHubUpdateSource, ({ caller }) => {
      checkRequested();
      const owner = directOwner(caller);
      const current = checks.get(owner);
      if (current !== undefined) return current;
      const pending = service.check(owner).finally(() => {
        checks.delete(owner);
      });
      checks.set(owner, pending);
      return pending;
    }),
    saveHubUpdateSource: bound(E.saveHubUpdateSource, ({ caller, body }) => {
      const owner = directOwner(caller);
      if (owner === undefined)
        throw new ApiError('forbidden', 'Only the owner can save pending work in the app.');
      return service.save(owner, body);
    }),
    startHubUpdateSource: bound(E.startHubUpdateSource, ({ caller, body }) => {
      const owner = directOwner(caller);
      if (owner === undefined)
        throw new ApiError('forbidden', 'Only the owner can approve a Git update in the app.');
      return service.start(owner, body);
    }),
  };
  return {
    routes,
    settleChecks: async (): Promise<void> => {
      await Promise.allSettled(checks.values());
    },
  };
}
