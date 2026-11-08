import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';

export const MAP_ATTRIBUTION =
  'Place names: GeoNames (geonames.org), CC BY 4.0. Map: Natural Earth, public domain.';

export function MapAttributionRow(): ReactNode {
  return <ListRow title="Map data" icon="info" subtitle={MAP_ATTRIBUTION} wrapSubtitle />;
}
