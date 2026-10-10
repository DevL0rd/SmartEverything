import { useMemo } from 'react';
import { CLIENT_PREFS, type RegionPref } from '@smarteverything/domain';
import { deviceRegionSource } from '../../../platform/device-region';
import { useStoreSelector } from '../../../store/store-context';
import { moneyFormatOf, moneyOf, type Money } from '../model/money';

const REGION = CLIENT_PREFS.region;

export function useRegionPref(): RegionPref {
  const stored = useStoreSelector(
    (state) => state.tables.layouts.byId[REGION.storageKey]?.layout ?? null,
  );
  return useMemo(() => {
    const read = REGION.decode(stored);
    return read.status === 'invalid' ? REGION.defaultValue : read.value;
  }, [stored]);
}

export function useMoney(): Money {
  const pref = useRegionPref();
  const rates = useStoreSelector((state) => state.exchangeRates);
  return useMemo(
    () => moneyOf(moneyFormatOf({ pref, device: deviceRegionSource(), rates, now: new Date() })),
    [pref, rates],
  );
}
