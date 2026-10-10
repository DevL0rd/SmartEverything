import type { ReactNode } from 'react';
import { BodyReport } from '../../profiles';
import { SeriesDomain } from '../components/series-domain';

export function BodyScreen(): ReactNode {
  return <SeriesDomain domain="body" range="month" before={<BodyReport />} />;
}
