import {
  API_ENDPOINTS as E,
  createHealthSourceToken,
  createMcpToken,
  hashHealthSourceToken,
  hashMcpToken,
} from '@smarteverything/domain';
import { clientOf, healthSourceOf, profileIdOf } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound, type Bound } from '../router';

type HealthRoutes = Record<
  | 'listHealthSources'
  | 'createHealthSource'
  | 'revokeHealthSource'
  | 'ingestHealth'
  | 'readHealthDaily'
  | 'readBestDay'
  | 'readHealthRecords'
  | 'readHealthRecord'
  | 'readHealthSightings'
  | 'updateFitnessSettings',
  Bound
>;

type AssistantRoutes = Record<
  'listMcpTokens' | 'createMcpToken' | 'revokeMcpToken' | 'listOAuthGrants' | 'revokeOAuthGrant',
  Bound
>;

function describe(cause: unknown): string {
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
}

function ingestRoute(context: ServerContext): Bound {
  const { store } = context;
  return bound(E.ingestHealth, ({ body, caller }) => {
    const source = healthSourceOf(caller);
    try {
      const result = store.health.ingest(body, profileIdOf(store, caller));
      store.healthSources.synced(source.id, body.grantedTypes);
      context.log.info('health.ingested', {
        sourceId: source.id,
        stored: result.stored,
        days: result.days.length,
      });
      return result;
    } catch (cause) {
      store.healthSources.failed(source.id, describe(cause));
      throw cause;
    }
  });
}

export function healthRoutes(context: ServerContext): HealthRoutes {
  const { store } = context;
  return {
    listHealthSources: bound(E.listHealthSources, () => store.healthSources.list()),
    createHealthSource: bound(E.createHealthSource, ({ body, caller }) => {
      const token = createHealthSourceToken();
      const source = store.healthSources.create(
        body.name,
        clientOf(caller).id,
        hashHealthSourceToken(token),
      );
      return { token, source };
    }),
    revokeHealthSource: bound(E.revokeHealthSource, ({ params }) =>
      store.healthSources.revoke(params.sourceId),
    ),
    ingestHealth: ingestRoute(context),
    readHealthDaily: bound(E.readHealthDaily, ({ query, caller }) =>
      store.health.dailyRange(profileIdOf(store, caller), query.from, query.to, query.metrics),
    ),
    readBestDay: bound(E.readBestDay, ({ query, caller }) =>
      store.health.bestDay(profileIdOf(store, caller), query.metric, query.lowest),
    ),
    readHealthRecords: bound(E.readHealthRecords, ({ query, caller }) =>
      store.health.records(query, profileIdOf(store, caller)),
    ),
    readHealthRecord: bound(E.readHealthRecord, ({ params, caller }) =>
      store.health.requireRecord(params.recordId, profileIdOf(store, caller)),
    ),
    readHealthSightings: bound(E.readHealthSightings, ({ query, caller }) =>
      store.health.sightings(query.since, profileIdOf(store, caller)),
    ),
    updateFitnessSettings: bound(E.updateFitnessSettings, ({ body, caller }) =>
      store.write(() => {
        store.profiles.updateFitness(profileIdOf(store, caller), body);
        return store.settings.read();
      }),
    ),
  };
}

export function assistantRoutes(context: ServerContext): AssistantRoutes {
  const { store } = context;
  return {
    listMcpTokens: bound(E.listMcpTokens, () => store.assistant.tokens()),
    createMcpToken: bound(E.createMcpToken, ({ body }) => {
      const token = createMcpToken();
      return { token, row: store.assistant.createToken(body.name, hashMcpToken(token)) };
    }),
    revokeMcpToken: bound(E.revokeMcpToken, ({ params }) =>
      store.assistant.revokeToken(params.tokenId),
    ),
    listOAuthGrants: bound(E.listOAuthGrants, () => store.assistant.grants()),
    revokeOAuthGrant: bound(E.revokeOAuthGrant, ({ params }) => {
      store.assistant.revokeGrant(params.clientId);
      return DONE_REPLY;
    }),
  };
}
