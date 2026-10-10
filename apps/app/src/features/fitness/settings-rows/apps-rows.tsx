import type { ReactNode } from 'react';
import type { Brand } from '../../../components/brand-glyphs';
import { ErrorState } from '../../../components/error-state';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { Skeleton } from '../../../components/skeleton';
import { RowBrand } from '../../connections';
import { useToday } from '../data/day';
import { useSightings } from '../data/queries';
import { SERIES_GROUPS, seriesOfType } from '../model/catalogue';
import { appsOf, typeLabel, type SourceApp } from '../model/sources';

const SHOWN_TYPES = 3;

const APP_BRANDS: Readonly<Record<string, Brand>> = {
  'Mi Fitness': 'xiaomi',
  'Samsung Health': 'samsung',
  'Health Connect': 'health-connect',
  Fitbit: 'fitbit',
  SmartEverything: 'smarteverything',
  'Logged here': 'smarteverything',
};

const APP_ICONS: Readonly<Record<string, IconName>> = {
  Scale: 'scale',
  Watch: 'watch',
  'Your phone': 'smartphone',
};

function typesText(types: SourceApp['types']): string {
  const names = types.slice(0, SHOWN_TYPES).map(typeLabel).join(', ');
  const more = types.length - SHOWN_TYPES;
  return more > 0 ? `${names} and ${String(more)} more` : names;
}

function iconOf(app: SourceApp): IconName {
  const known = APP_ICONS[app.name];
  if (known !== undefined) {
    return known;
  }
  const first = app.types[0];
  const group = first === undefined ? undefined : seriesOfType(first).group;
  return SERIES_GROUPS.find((entry) => entry.group === group)?.icon ?? 'layers';
}

function AppRow({ app }: { readonly app: SourceApp }): ReactNode {
  const brand = APP_BRANDS[app.name];
  return (
    <ListRow
      title={app.name}
      subtitle={typesText(app.types)}
      {...(brand === undefined ? { icon: iconOf(app) } : { leading: <RowBrand brand={brand} /> })}
    />
  );
}

export function AppsRows(): ReactNode {
  const sightings = useSightings(useToday());
  if (sightings.error !== null) {
    return <ErrorState error={sightings.error} retry={() => void sightings.refetch()} />;
  }
  if (sightings.data === undefined) {
    return <Skeleton shape="line" />;
  }
  const apps = appsOf(sightings.data);
  if (apps.length === 0) {
    return <ListRow icon="layers" title="No apps have shared data yet" />;
  }
  return apps.map((app) => <AppRow key={app.name} app={app} />);
}
