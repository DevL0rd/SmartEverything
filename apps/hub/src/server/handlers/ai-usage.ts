import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { usageFilterFor, type UsageViewer } from '../../ledger/usage-scope';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound } from '../router';

function viewerOf(store: Store, caller: Caller): UsageViewer {
  return clientOf(caller).role === 'owner'
    ? { role: 'owner' }
    : { role: 'member', profileId: profileIdOf(store, caller) };
}

export const aiUsageRoutes = ({ store }: ServerContext) =>
  ({
    readUsageTotals: bound(E.readUsageTotals, ({ query, caller }) =>
      store.ledger.totals(usageFilterFor(query, viewerOf(store, caller))),
    ),
    readUsageSeries: bound(E.readUsageSeries, ({ query, caller }) =>
      store.ledger.report(
        usageFilterFor(query, viewerOf(store, caller)),
        query.bucket,
        query.split ?? null,
      ),
    ),
    readUsageSummary: bound(E.readUsageSummary, ({ query, caller }) => {
      const filter = usageFilterFor(query, viewerOf(store, caller));
      return {
        totals: store.ledger.totals(filter),
        series: store.ledger.report(filter, query.bucket, query.split ?? null),
      };
    }),
    listUsageLedger: bound(E.listUsageLedger, ({ query, caller }) =>
      store.ledger.ledger({
        filter: usageFilterFor(query, viewerOf(store, caller)),
        cursor: query.cursor,
        limit: query.limit,
      }),
    ),
    readUsageChoices: bound(E.readUsageChoices, ({ query, caller }) =>
      store.ledger.choices(usageFilterFor(query, viewerOf(store, caller))),
    ),
  }) as const;
