import type { ReactNode } from 'react';
import { SeriesDomain } from '../components/series-domain';

export function VitalsScreen(): ReactNode {
  return <SeriesDomain domain="vitals" range="month" />;
}
