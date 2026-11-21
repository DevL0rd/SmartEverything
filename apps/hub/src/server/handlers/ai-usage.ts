import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { usageFilterFor, type UsageViewer } from '../../ledger/usage-scope';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';

function viewerOf(caller: Caller): UsageViewer {
  return clientOf(caller).role === 'owner'
    ? { role: 'owner' }
    : { role: 'member', profileId: profileIdOf(caller) };
}

export const aiUsageRoutes = ({ store }: ServerContext) =>
  ({
    readUsageTotals: bound(E.readUsageTotals, ({ query, caller }) =>
      store.host.read('mcpUsageTotals', usageFilterFor(query, viewerOf(caller))),
    ),
    readUsageSeries: bound(E.readUsageSeries, ({ query, caller }) =>
      store.host.read('mcpUsageReport', {
        filter: usageFilterFor(query, viewerOf(caller)),
        bucket: query.bucket,
        split: query.split ?? null,
      }),
    ),
    readUsageSummary: bound(E.readUsageSummary, async ({ query, caller }) => {
      const filter = usageFilterFor(query, viewerOf(caller));
      const [totals, series] = await Promise.all([
        store.host.read('mcpUsageTotals', filter),
        store.host.read('mcpUsageReport', {
          filter,
          bucket: query.bucket,
          split: query.split ?? null,
        }),
      ]);
      return { totals, series };
    }),
    listUsageLedger: bound(E.listUsageLedger, ({ query, caller }) =>
      store.host.read('mcpUsageLedger', {
        filter: usageFilterFor(query, viewerOf(caller)),
        cursor: query.cursor,
        limit: query.limit,
      }),
    ),
    readUsageChoices: bound(E.readUsageChoices, ({ query, caller }) =>
      store.host.read('ledgerChoices', usageFilterFor(query, viewerOf(caller))),
    ),
  }) as const;
