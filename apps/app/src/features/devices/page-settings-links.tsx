import type { ReactNode } from 'react';
import { href } from '../../app-shell/hrefs';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { useClimateWidgets } from '../climate';

export function DevicePageLinks(): ReactNode {
  const climate = useClimateWidgets();
  if (!climate.airHistory && !climate.supplies) return null;
  return (
    <List inset>
      {climate.airHistory ? (
        <NavRow title="Air history" icon="activity" href={href.devicesPage('air')} />
      ) : null}
      {climate.supplies ? (
        <NavRow title="Filters & water" icon="wrench" href={href.devicesPage('supplies')} />
      ) : null}
    </List>
  );
}
