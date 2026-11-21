import type {
  UsageBucket,
  UsageFilter,
  UsageLedgerPage,
  UsageSeries,
  UsageSplit,
  UsageTotals,
} from '@smarteverything/domain';
import type { LedgerRequest } from '../../../ledger/ledger';
import { storeUnit } from '../../../store/host/unit';

export interface UsageReportAsk {
  readonly filter: UsageFilter;
  readonly bucket: UsageBucket;
  readonly split: UsageSplit | null;
}

export const MCP_USAGE_TOTALS_UNIT = storeUnit((store, filter: UsageFilter): UsageTotals =>
  store.ledger.totals(filter),
);

export const MCP_USAGE_REPORT_UNIT = storeUnit(
  (store, { filter, bucket, split }: UsageReportAsk): UsageSeries =>
    store.ledger.report(filter, bucket, split),
);

export const MCP_USAGE_LEDGER_UNIT = storeUnit((store, request: LedgerRequest): UsageLedgerPage =>
  store.ledger.ledger(request),
);
