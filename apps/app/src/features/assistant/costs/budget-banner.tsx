import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { pausedText, useBudgetStatus } from '../data/budget';
import { BUDGET_PAGE } from './budget-meter';

export function BudgetBanner(): ReactNode {
  const status = useBudgetStatus();
  const text = status.data === undefined ? null : pausedText(status.data);
  if (text === null) {
    return null;
  }
  return (
    <Banner
      tone="warning"
      title="Background AI is paused"
      body={text}
      wrapBody
      action={{ label: 'Open AI budget', href: href.settings.page(BUDGET_PAGE) }}
    />
  );
}
