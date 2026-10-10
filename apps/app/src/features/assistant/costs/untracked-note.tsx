import type { ReactNode } from 'react';
import { microsOfUsd } from '@smarteverything/domain';
import { Banner } from '../../../components/banner';
import { costText } from '../data/cost';
import { useOpenRouterAccount, useOpenRouterStatus } from '../data/openrouter';
import { useTrackedOpenRouterToday } from './costs-data';

const NOTICE_MICROS = 1000;

export function UntrackedNote(): ReactNode {
  const status = useOpenRouterStatus();
  const keySet = status.data?.key === 'set';
  const account = useOpenRouterAccount(keySet);
  const tracked = useTrackedOpenRouterToday(keySet);
  if (account.data === undefined || tracked.data === undefined) {
    return null;
  }
  const reported = microsOfUsd(account.data.usage_daily);
  const here = tracked.data.sum.cost_micros;
  const untracked = Math.max(0, reported - here);
  if (untracked <= NOTICE_MICROS) {
    return null;
  }
  return (
    <Banner
      tone="info"
      title={`${costText(untracked)} spent on this key today (UTC) outside SmartEverything`}
      body={`Reported by OpenRouter: ${costText(reported)} · Tracked here: ${costText(here)}. The rest is other apps or tests using the same key.`}
    />
  );
}
