import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { usageFilterFor, type UsageViewer } from '../../ledger/usage-scope';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

type UsageRoutes = Record<
  | 'readUsageTotals'
  | 'readUsageSeries'
  | 'readUsageSummary'
  | 'listUsageLedger'
  | 'readUsageChoices',
  Bound
>;

export function viewerOf(store: Store, caller: Caller): UsageViewer {
  return clientOf(caller).role === 'owner'
    ? { role: 'owner' }
    : { role: 'member', profileId: profileIdOf(store, caller) };
}

export function aiUsageRoutes(context: ServerContext): UsageRoutes {
  const { store } = context;
  const { ledger } = store;
  return {
    readUsageTotals: bound(E.readUsageTotals, ({ query, caller }) =>
      ledger.totals(usageFilterFor(query, viewerOf(store, caller))),
    ),
    readUsageSeries: bound(E.readUsageSeries, ({ query, caller }) =>
      ledger.report(
        usageFilterFor(query, viewerOf(store, caller)),
        query.bucket,
        query.split ?? null,
      ),
    ),
    readUsageSummary: bound(E.readUsageSummary, ({ query, caller }) => {
      const filter = usageFilterFor(query, viewerOf(store, caller));
      return {
        totals: ledger.totals(filter),
        series: ledger.report(filter, query.bucket, query.split ?? null),
      };
    }),
    listUsageLedger: bound(E.listUsageLedger, ({ query, caller }) =>
      ledger.ledger({
        filter: usageFilterFor(query, viewerOf(store, caller)),
        cursor: query.cursor,
        limit: query.limit,
      }),
    ),
    readUsageChoices: bound(E.readUsageChoices, ({ query, caller }) =>
      ledger.choices(usageFilterFor(query, viewerOf(store, caller))),
    ),
  };
}
