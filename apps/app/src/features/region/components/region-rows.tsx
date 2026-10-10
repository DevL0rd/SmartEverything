import type { ReactNode } from 'react';
import { REGION_PREF } from '@smarteverything/domain';
import { refreshExchangeRates } from '../../../api/exchange-rates';
import { ListRow } from '../../../components/list-row';
import { ActionRow, SelectRow } from '../../../components/rows';
import { deviceRegionSource } from '../../../platform/device-region';
import { PREFS, usePref } from '../../../store/prefs';
import { useMutationState } from '../../../store/mutation';
import { useStoreSelector } from '../../../store/store-context';
import { useMoney, useRegionPref } from '../data/use-money';
import {
  currencySubtitle,
  currencyValue,
  ratesLine,
  regionOptions,
  regionSubtitle,
} from '../model/region-text';
import { rateLine } from '../model/money';

export function RegionRow(): ReactNode {
  const pref = useRegionPref();
  const stored = usePref(PREFS.region);
  const subtitle = regionSubtitle(pref, deviceRegionSource());
  if (stored.status === 'invalid') {
    return (
      <ActionRow
        title="Reset region"
        subtitle={stored.reason}
        icon="globe"
        onPress={stored.reset}
      />
    );
  }
  return (
    <SelectRow
      title="Region"
      {...(subtitle === undefined ? {} : { subtitle })}
      icon="globe"
      options={regionOptions()}
      value={pref.region}
      searchable
      onChange={(region) => {
        stored.set(REGION_PREF.parse({ region }));
      }}
    />
  );
}

export function CurrencyRow(): ReactNode {
  const { format } = useMoney();
  return (
    <ListRow
      title="Amounts shown in"
      subtitle={currencySubtitle(format)}
      wrapSubtitle
      subtitleTone={format.notice === null ? 'variant' : 'warning'}
      icon="gauge"
      value={currencyValue(format)}
    />
  );
}

export function RatesRow(): ReactNode {
  const { format } = useMoney();
  const row = useStoreSelector((state) => state.exchangeRates);
  const line = ratesLine(row, new Date());
  const rate = rateLine(format);
  return (
    <ListRow
      title="Exchange rates"
      subtitle={rate === null ? line.subtitle : `${rate}. ${line.subtitle}`}
      wrapSubtitle
      subtitleTone={line.warning ? 'warning' : 'variant'}
      icon="trendUp"
      value={line.value}
    />
  );
}

export function RefreshRatesRow(): ReactNode {
  const refresh = useMutationState();
  return (
    <ActionRow
      title="Refresh exchange rates"
      subtitle="Fetch today’s rates now instead of waiting for the daily update"
      icon="refresh"
      onPress={() => {
        refresh.run(refreshExchangeRates, { failure: 'The exchange rates couldn’t be fetched' });
      }}
    />
  );
}
