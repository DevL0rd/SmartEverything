import {
  EXCHANGE_RATES_SOURCE,
  REGIONS,
  REGION_CODES,
  exchangeRatesStatusOf,
  resolveRegion,
  type DeviceRegionSource,
  type ExchangeRatesRow,
  type RegionCode,
  type RegionPref,
} from '@smarteverything/domain';
import type { SelectOption } from '../../../components/select-picker';
import type { MoneyFormat } from './money';
import { noticeText } from './money';

function regionLabel(code: RegionCode): string {
  const region = REGIONS[code];
  return `${region.name} · ${region.currency}`;
}

export function regionOptions(): readonly SelectOption<string>[] {
  return [
    { value: 'auto', label: 'Automatic' },
    ...REGION_CODES.map((code) => ({ value: code, label: regionLabel(code) })),
  ];
}

export function regionSubtitle(pref: RegionPref, device: DeviceRegionSource): string | undefined {
  if (pref.region !== 'auto') {
    return undefined;
  }
  const resolution = resolveRegion(pref, device);
  if (resolution.kind === 'undetected') {
    return resolution.detection.status === 'unsupported'
      ? `Detected ${resolution.detection.code}, which the app can’t show prices for yet`
      : 'Couldn’t detect a region on this device';
  }
  return `Detected ${regionLabel(resolution.region)}`;
}

export function currencyValue(format: MoneyFormat): string {
  return format.currency;
}

export function currencySubtitle(format: MoneyFormat): string {
  if (format.notice !== null) {
    return noticeText(format.notice);
  }
  return format.currency === 'USD'
    ? 'Costs are stored in US dollars, so nothing is converted.'
    : 'Costs are stored in US dollars and converted for display.';
}

export interface RatesLine {
  readonly value: string;
  readonly subtitle: string;
  readonly warning: boolean;
}

export function ratesLine(row: ExchangeRatesRow | null, now: Date): RatesLine {
  const status = exchangeRatesStatusOf(row, now);
  const source = `Source: ${EXCHANGE_RATES_SOURCE.name}, updated daily.`;
  if (status.kind === 'missing') {
    return {
      value: 'Unavailable',
      subtitle:
        status.reason === null
          ? 'No rates from the hub yet. The hub fetches them daily.'
          : `The last fetch failed: ${status.reason}`,
      warning: true,
    };
  }
  if (status.error !== null) {
    return {
      value: status.rateDate,
      subtitle: `The last update failed, so these rates are older: ${status.error}`,
      warning: true,
    };
  }
  return { value: status.rateDate, subtitle: source, warning: status.stale };
}
