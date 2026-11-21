import type { AiUsageRow, UsageChoices, UsageEntry, UsageFilter } from '@smarteverything/domain';
import { ledgerChange, type LedgerChange } from '../harness/metered-change';
import type { SupplierUsageSnapshot } from '../harness/metered-usage';
import type { StoreHost } from '../store/host/host';
import { durableStoreUnit, storeUnit } from '../store/host/unit';

export type LedgerHost = Pick<StoreHost, 'write'>;

export interface LedgerAmend {
  readonly id: string;
  readonly change: LedgerChange;
}

export interface MeteredAmend {
  readonly id: string;
  readonly snapshot: SupplierUsageSnapshot;
  readonly tokensFromDsh: boolean;
}

export const LEDGER_CHOICES_UNIT = storeUnit(({ ledger }, filter: UsageFilter): UsageChoices =>
  ledger.choices(filter),
);

export const LEDGER_RECORD_UNIT = storeUnit(({ ledger }, entry: UsageEntry): AiUsageRow =>
  ledger.record(entry),
);

export const LEDGER_RECORD_DURABLE_UNIT = durableStoreUnit(
  ({ ledger }, entry: UsageEntry): AiUsageRow => ledger.record(entry, true),
);

export const LEDGER_AMEND_UNIT = durableStoreUnit(({ ledger }, amend: LedgerAmend): AiUsageRow =>
  ledger.amend(amend.id, amend.change),
);

export const LEDGER_METERED_AMEND_UNIT = durableStoreUnit(
  ({ ledger }, amend: MeteredAmend): AiUsageRow =>
    ledger.amend(amend.id, ledgerChange(amend.snapshot, ledger.get(amend.id), amend.tokensFromDsh)),
);
