import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { useMoney } from '../data/use-money';
import { noticeText } from '../model/money';

const REGION_PAGE = 'region';

export function MoneyNoticeBanner(): ReactNode {
  const { format } = useMoney();
  if (format.notice === null) {
    return null;
  }
  return (
    <Banner
      tone="warning"
      title="Amounts are in US dollars"
      body={noticeText(format.notice)}
      wrapBody
      action={{ label: 'Open region settings', href: href.settings.page(REGION_PAGE) }}
    />
  );
}
