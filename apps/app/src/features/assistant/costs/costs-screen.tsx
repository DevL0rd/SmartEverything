import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import type { UsageLedgerRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ErrorState } from '../../../components/error-state';
import type { MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { localDayKey } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useIsOwner, useSettings } from '../../../store/selectors';
import { CostsBanners } from './costs-banners';
import { BUDGET_PAGE } from './budget-meter';
import { useCostLedger, useCostSummary } from './costs-data';
import { CostsHeader } from './costs-header';
import { ledgerSections } from './costs-ledger';
import { useCostParams } from './costs-params';
import { windowOf, type CostWindow } from './costs-range';
import { LedgerRow } from './ledger-row';
import { LedgerSheet } from './ledger-sheet';
import type { CostFilters } from './costs-params';

function LedgerFooter({
  ledger,
}: {
  readonly ledger: ReturnType<typeof useCostLedger>;
}): ReactNode {
  if (ledger.isError) {
    return (
      <View className="px-gutter">
        <ErrorState error={ledger.error} retry={() => void ledger.fetchNextPage()} />
      </View>
    );
  }
  if (ledger.isFetchingNextPage || ledger.isPending) {
    return <ActivityIndicator className="py-4" />;
  }
  const shown = ledger.data.pages.some((page) => page.rows.length > 0);
  return shown && !ledger.hasNextPage ? (
    <Text variant="caption" tone="faint" align="center" className="py-4">
      That’s every request in these dates.
    </Text>
  ) : null;
}

interface Ledger {
  readonly ledger: ReturnType<typeof useCostLedger>;
  readonly sections: ReturnType<typeof ledgerSections>;
}

function useLedger(
  window: CostWindow,
  filters: CostFilters,
  now: number,
  timeZone: string,
): Ledger {
  const ledger = useCostLedger(window, filters);
  const rows = ledger.data?.pages.flatMap((page) => page.rows) ?? [];
  return { ledger, sections: ledgerSections(rows, now, timeZone) };
}

const COSTS_PAGE = 'assistant/costs';

function useCostsMenu(): readonly MenuItem[] {
  const router = useRouter();
  return [
    {
      label: 'AI budget',
      icon: 'gauge',
      onPress: (): void => {
        router.push(href.settings.page(BUDGET_PAGE));
      },
    },
    {
      label: 'OpenRouter settings',
      icon: 'settings',
      onPress: (): void => {
        router.push(href.settings.page('assistant'));
      },
    },
  ];
}

function loadMore(ledger: Ledger['ledger']): void {
  if (ledger.hasNextPage && !ledger.isFetchingNextPage) {
    void ledger.fetchNextPage();
  }
}

export function CostsScreen(): ReactNode {
  const menu = useCostsMenu();
  const timeZone = useSettings().time_zone;
  const now = useMinute();
  const state = useCostParams();
  const window = windowOf(state.params, now, timeZone);
  const summary = useCostSummary(window, state.params);
  const { ledger, sections } = useLedger(window, state.params, now, timeZone);
  const owner = useIsOwner();
  const [open, setOpen] = useState<UsageLedgerRow | null>(null);
  return (
    <SettingsFrame
      page={COSTS_PAGE}
      search={false}
      overflow={menu}
      maxWidth="dashboard"
      scroll={false}
      banner={<CostsBanners />}
    >
      <VirtualList
        sections={summary.data?.totals.sum.count === 0 ? [] : sections}
        keyOf={(row) => row.id}
        renderItem={(row) => (
          <LedgerRow row={row} timeZone={timeZone} showPerson={owner} onOpen={setOpen} />
        )}
        header={
          <CostsHeader
            state={state}
            window={window}
            today={localDayKey(now, timeZone)}
            summary={summary.data}
            summaryError={summary.isError ? summary.error : null}
            retry={() => void summary.refetch()}
          />
        }
        footer={<LedgerFooter ledger={ledger} />}
        onEndReached={() => {
          loadMore(ledger);
        }}
      />
      <LedgerSheet
        row={open}
        timeZone={timeZone}
        onClose={() => {
          setOpen(null);
        }}
      />
    </SettingsFrame>
  );
}
