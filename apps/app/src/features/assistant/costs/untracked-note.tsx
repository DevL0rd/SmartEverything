import type { ReactNode } from 'react';
import { microsOfUsd } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { useMoney } from '../../region';
import { useOpenRouterAccount, useOpenRouterStatus } from '../data/openrouter';
import { useTrackedOpenRouterToday } from './costs-data';

const NOTICE_MICROS = 1000;

export function UntrackedNote(): ReactNode {
  const status = useOpenRouterStatus();
  const keySet = status.data?.key === 'set';
  const account = useOpenRouterAccount(keySet);
  const tracked = useTrackedOpenRouterToday(keySet);
  const money = useMoney();
  if (account.data === undefined || tracked.data === undefined) {
    return null;
  }
  const reported = microsOfUsd(account.data.usage_daily);
  const here = tracked.data.sum.cost_micros;
  if ((tracked.data.sum.unknown_count ?? 0) > 0)
    return (
      <Banner
        tone="info"
        title="Supplier costs unavailable"
        body={`OpenRouter reports ${money.cost(reported)} today (UTC). Known costs here: ${money.cost(here)}; accounting is incomplete, so outside usage cannot be determined.`}
      />
    );
  const untracked = Math.max(0, reported - here);
  if (untracked <= NOTICE_MICROS) {
    return null;
  }
  return (
    <Banner
      tone="info"
      title={`${money.cost(untracked)} spent on this key today (UTC) outside SmartEverything`}
      body={`Reported by OpenRouter: ${money.cost(reported)} · Tracked here: ${money.cost(here)}. The rest is other apps or tests using the same key.`}
    />
  );
}
