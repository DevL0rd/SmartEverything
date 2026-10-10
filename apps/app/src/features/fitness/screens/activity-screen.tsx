import type { ReactNode } from 'react';
import { SeriesDomain } from '../components/series-domain';

export function ActivityScreen(): ReactNode {
  return <SeriesDomain domain="activity" range="week" />;
}
