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

async function syncingSourceOf(context: ServerContext, caller: Caller): Promise<HealthSourceRow> {
  const source = await context.store.host.call('healthSources', 'find', clientOf(caller).id);
  if (source === undefined) {
    context.log.warn('health.ingest_refused', {
      clientId: clientOf(caller).id,
      reason: 'phone_not_registered_as_health_source',
      registeredSources: (await context.store.host.call('healthSources', 'list')).length,
    });
    throw new ApiError(
      'forbidden',
      'This phone is not syncing health data; connect it again in the Fitness settings.',
    );
  }
  return source;
}

function ingestRoute(context: ServerContext): RouteOf<'ingestHealth'> {
  const { store } = context;
  return bound(E.ingestHealth, async ({ body, caller }) => {
    const { client_id: clientId } = await syncingSourceOf(context, caller);
    try {
      const result = await store.host.write('ingestHealth', {
        clientId,
        profileId: profileIdOf(caller),
        body,
      });
      context.log.info('health.ingested', {
        clientId,
        stored: result.stored,
        days: result.days.length,
      });
      return result;
    } catch (cause) {
      await store.host.call('healthSources', 'failed', clientId, failureLine(cause));
      throw cause;
    }
  });
}

export const healthRoutes = (context: ServerContext) =>
  ({
    listHealthSources: bound(E.listHealthSources, () =>
      context.store.host.call('healthSources', 'list'),
    ),
    createHealthSource: bound(E.createHealthSource, ({ body, caller }) =>
      context.store.host.call('healthSources', 'register', clientOf(caller).id, body.name),
    ),
    revokeHealthSource: bound(E.revokeHealthSource, async ({ params }) => {
      await context.store.host.call('healthSources', 'remove', params.clientId);
      return DONE_REPLY;
    }),
    ingestHealth: ingestRoute(context),
    readHealthDaily: bound(E.readHealthDaily, ({ query, caller }) =>
      context.store.host.call(
        'health',
        'dailyRange',
        profileIdOf(caller),
        query.from,
        query.to,
        query.metrics,
      ),
    ),
    readBestDay: bound(E.readBestDay, ({ query, caller }) =>
      context.store.host.call('health', 'bestDay', profileIdOf(caller), query.metric, query.lowest),
    ),
    readHealthRecords: bound(E.readHealthRecords, ({ query, caller }) =>
      context.store.host.call('health', 'records', query, profileIdOf(caller)),
    ),
    readHealthRecord: bound(E.readHealthRecord, ({ params, caller }) =>
      context.store.host.call('health', 'requireRecord', params.recordId, profileIdOf(caller)),
    ),
    readHealthSightings: bound(E.readHealthSightings, ({ query, caller }) =>
      context.store.host.call('health', 'sightings', query.since, profileIdOf(caller)),
    ),
    updateFitnessSettings: bound(E.updateFitnessSettings, ({ body, caller }) =>
      context.store.host.write('updateFitnessSettings', { profileId: profileIdOf(caller), body }),
    ),
  }) as const;

export const assistantRoutes = ({ store }: ServerContext) =>
  ({
    listMcpTokens: bound(E.listMcpTokens, () => store.host.call('oauth', 'personalTokens')),
    createMcpToken: bound(E.createMcpToken, async ({ body }) => {
      const token = createMcpToken();
      return {
        token,
        row: await store.host.call('oauth', 'createPersonalToken', {
          name: body.name,
          tokenHash: hashMcpToken(token),
          localOnly: false,
          access: body.access,
        }),
      };
    }),
    revokeMcpToken: bound(E.revokeMcpToken, ({ params }) =>
      store.host.call('oauth', 'revokePersonalToken', params.tokenId),
    ),
    listOAuthGrants: bound(E.listOAuthGrants, () => store.host.call('oauth', 'grants')),
    revokeOAuthGrant: bound(E.revokeOAuthGrant, async ({ params }) => {
      await store.host.call('oauth', 'revokeGrant', params.clientId);
      return DONE_REPLY;
    }),
  }) as const;
