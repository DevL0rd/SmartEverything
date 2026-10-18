import type { ReactNode } from 'react';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import type { UsageLedgerRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { errorText } from '../../../format/errors';
import { localDayKey } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useIsOwner, useSettings } from '../../../store/selectors';
import { useAiChat } from '../data/chat-store';
import { CostsBanners } from './costs-banners';
import { BUDGET_PAGE } from './budget-meter';
import { useCostLedger, useCostSummary } from './costs-data';
import { CostsHeader } from './costs-header';
import { ledgerSections, retryLedger } from './costs-ledger';
import { useCostParams } from './costs-params';
import { windowOf, type CostWindow } from './costs-range';
import { LedgerRow } from './ledger-row';
import { LedgerSheet } from './ledger-sheet';
import type { CostFilters } from './costs-params';
import { background } from '@smarteverything/logging';

function LedgerFooter({
  ledger,
}: {
  readonly ledger: ReturnType<typeof useCostLedger>;
}): ReactNode {
  if (ledger.isFetchingNextPage || ledger.isPending) {
    return <ActivityIndicator className="py-4" />;
  }
  if (ledger.isError) {
    return (
      <View className="w-full self-center px-gutter pb-3 max-w-dashboard">
        <Banner
          tone="critical"
          title="Couldn’t load requests"
          body={errorText(ledger.error).title}
          wrapBody
          action={{
            label: 'Try again',
            onPress: () => {
              retryLedger(ledger);
            },
          }}
        />
      </View>
    );
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
  today: string,
  timeZone: string,
): Ledger {
  const ledger = useCostLedger(window, filters);
  const rows = ledger.data?.pages.flatMap((page) => page.rows) ?? [];
  return { ledger, sections: ledgerSections(rows, today, timeZone) };
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
    background(ledger.fetchNextPage(), 'next_page.fetch_failed');
  }
}

function CostsFrame({
  chatId,
  children,
}: {
  readonly chatId: string | undefined;
  readonly children: ReactNode;
}): ReactNode {
  const menu = useCostsMenu();
  const chat = useAiChat(chatId ?? null);
  return (
    <SettingsFrame
      page={COSTS_PAGE}
      {...(chat === null ? {} : { title: `Costs for “${chat.title}”` })}
      search={false}
      overflow={menu}
      maxWidth="dashboard"
      scroll={false}
      banner={<CostsBanners />}
    >
      {children}
    </SettingsFrame>
  );
}

export function CostsScreen(): ReactNode {
  const timeZone = useSettings().time_zone;
  const today = useMinuteOf((now) => localDayKey(now, timeZone));
  const state = useCostParams();
  const window = windowOf(state.params, today, timeZone);
  const summary = useCostSummary(window, state.params);
  const { ledger, sections } = useLedger(window, state.params, today, timeZone);
  const owner = useIsOwner();
  const [open, setOpen] = useState<UsageLedgerRow | null>(null);
  return (
    <CostsFrame chatId={state.params.chat}>
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
            today={today}
            summary={summary.data}
            summaryError={summary.isError ? summary.error : null}
            retry={() => {
              background(summary.refetch(), 'summary.refetch_failed');
            }}
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
    </CostsFrame>
  );
}
