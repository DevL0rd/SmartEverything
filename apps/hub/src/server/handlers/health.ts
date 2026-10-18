import {
  API_ENDPOINTS as E,
  ApiError,
  createMcpToken,
  hashMcpToken,
  type HealthSourceRow,
} from '@smarteverything/domain';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type RouteOf } from '../router';
import { failureLine } from '@smarteverything/logging';

function syncingSourceOf(context: ServerContext, caller: Caller): HealthSourceRow {
  const source = context.store.healthSources.find(clientOf(caller).id);
  if (source === undefined) {
    throw new ApiError(
      'forbidden',
      'This phone is not syncing health data; connect it again in the Fitness settings.',
    );
  }
  return source;
}

function ingestRoute(context: ServerContext): RouteOf<'ingestHealth'> {
  const { store } = context;
  return bound(E.ingestHealth, ({ body, caller }) => {
    const { client_id: clientId } = syncingSourceOf(context, caller);
    try {
      const result = store.health.ingest(body, profileIdOf(store, caller));
      store.healthSources.synced(clientId, body.grantedTypes);
      context.log.info('health.ingested', {
        clientId,
        stored: result.stored,
        days: result.days.length,
      });
      return result;
    } catch (cause) {
      store.healthSources.failed(clientId, failureLine(cause));
      throw cause;
    }
  });
}

export const healthRoutes = (context: ServerContext) =>
  ({
    listHealthSources: bound(E.listHealthSources, () => context.store.healthSources.list()),
    createHealthSource: bound(E.createHealthSource, ({ body, caller }) =>
      context.store.healthSources.register(clientOf(caller).id, body.name),
    ),
    revokeHealthSource: bound(E.revokeHealthSource, ({ params }) => {
      context.store.healthSources.remove(params.clientId);
      return DONE_REPLY;
    }),
    ingestHealth: ingestRoute(context),
    readHealthDaily: bound(E.readHealthDaily, ({ query, caller }) =>
      context.store.health.dailyRange(
        profileIdOf(context.store, caller),
        query.from,
        query.to,
        query.metrics,
      ),
    ),
    readBestDay: bound(E.readBestDay, ({ query, caller }) =>
      context.store.health.bestDay(profileIdOf(context.store, caller), query.metric, query.lowest),
    ),
    readHealthRecords: bound(E.readHealthRecords, ({ query, caller }) =>
      context.store.health.records(query, profileIdOf(context.store, caller)),
    ),
    readHealthRecord: bound(E.readHealthRecord, ({ params, caller }) =>
      context.store.health.requireRecord(params.recordId, profileIdOf(context.store, caller)),
    ),
    readHealthSightings: bound(E.readHealthSightings, ({ query, caller }) =>
      context.store.health.sightings(query.since, profileIdOf(context.store, caller)),
    ),
    updateFitnessSettings: bound(E.updateFitnessSettings, ({ body, caller }) =>
      context.store.write(() => {
        context.store.profiles.updateFitness(profileIdOf(context.store, caller), body);
        return context.store.settings.read();
      }),
    ),
  }) as const;

export const assistantRoutes = ({ store }: ServerContext) =>
  ({
    listMcpTokens: bound(E.listMcpTokens, () => store.oauth.personalTokens()),
    createMcpToken: bound(E.createMcpToken, ({ body }) => {
      const token = createMcpToken();
      return { token, row: store.oauth.createPersonalToken(body.name, hashMcpToken(token)) };
    }),
    revokeMcpToken: bound(E.revokeMcpToken, ({ params }) =>
      store.oauth.revokePersonalToken(params.tokenId),
    ),
    listOAuthGrants: bound(E.listOAuthGrants, () => store.oauth.grants()),
    revokeOAuthGrant: bound(E.revokeOAuthGrant, ({ params }) => {
      store.oauth.revokeGrant(params.clientId);
      return DONE_REPLY;
    }),
  }) as const;
