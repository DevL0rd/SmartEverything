import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { Grid, useGridLayout } from '../../../components/grid';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { refreshWeather } from '../../../api/weather';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useMutationState } from '../../../store/mutation';
import { relative } from '../../../format/time';
import { SunTimes } from '../components/sun-times';
import { AirChip, WeatherHero } from '../components/weather-hero';
import { Details, WeatherNotice } from '../components/weather-notice';
import { useWeather, type WeatherView } from '../data/use-weather';
import { sunOf, todayOf } from '../model/present';
import { AirSection } from './air-section';
import {
  Attribution,
  DailySection,
  DetailsSection,
  HourlySection,
  SunSection,
} from './weather-sections';

type Ready = Extract<WeatherView, { kind: 'ready' }>;

const FORECAST_COLUMN_MIN = 320;
const FORECAST_COLUMNS = 4;

function Warnings({ view, now }: { readonly view: Ready; readonly now: number }): ReactNode {
  if (view.problem !== null) {
    return (
      <View className="gap-1">
        <Banner
          tone="warning"
          title="The weather couldn’t be updated"
          body={`Showing the forecast from ${relative(view.fetchedAt, now)}.`}
        />
        <Details reason={view.problem} />
      </View>
    );
  }
  return view.stale ? (
    <Banner tone="info" title={`Last updated ${relative(view.fetchedAt, now)}`} />
  ) : null;
}

function Hero({ view, now }: { readonly view: Ready; readonly now: number }): ReactNode {
  const { forecast } = view;
  return (
    <Card>
      <View className="gap-3">
        <WeatherHero forecast={forecast} now={now} scale="l" stale={view.stale} />
        <View className="flex-row flex-wrap items-center gap-x-6 gap-y-2">
          {forecast.air === null ? null : <AirChip air={forecast.air} />}
          <SunTimes forecast={forecast} now={now} />
        </View>
      </View>
    </Card>
  );
}

function ForecastDetails({ view, now }: { readonly view: Ready; readonly now: number }): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const { columns } = useGridLayout(width, FORECAST_COLUMN_MIN, 'grid', FORECAST_COLUMNS);
  const { forecast } = view;
  const air =
    forecast.air === null && view.airError === null ? null : (
      <AirSection air={forecast.air} problem={view.airError} />
    );
  const sun =
    sunOf(todayOf(forecast, now)) === null ? null : <SunSection forecast={forecast} now={now} />;
  const groupAirAndSun = air !== null && sun !== null && columns < FORECAST_COLUMNS;
  return (
    <View onLayout={onLayout}>
      <Grid
        measuredWidth={width}
        minItemWidth={FORECAST_COLUMN_MIN}
        maxColumns={FORECAST_COLUMNS}
        cellClassName="max-w-detail"
      >
        <DailySection forecast={forecast} now={now} />
        {groupAirAndSun ? (
          <View className="gap-grid-gap">
            {air}
            {sun}
          </View>
        ) : (
          air
        )}
        {groupAirAndSun ? null : sun}
        <DetailsSection forecast={forecast} now={now} />
      </Grid>
    </View>
  );
}

function Forecast({ view }: { readonly view: Ready }): ReactNode {
  const now = useMinute();
  const { forecast } = view;
  return (
    <View className="gap-section-gap">
      <Warnings view={view} now={now} />
      <View className="flex-row flex-wrap items-start gap-grid-gap">
        <View className="min-w-0 max-w-reading grow shrink basis-80">
          <Hero view={view} now={now} />
        </View>
        <View className="min-w-0 max-w-detail grow shrink basis-96">
          <HourlySection forecast={forecast} now={now} />
        </View>
      </View>
      <ForecastDetails view={view} now={now} />
      <View className="w-full max-w-detail">
        <Attribution fetchedAt={view.fetchedAt} timeZone={forecast.timeZone} />
      </View>
    </View>
  );
}

function useRefreshAction(view: WeatherView): HeaderAction[] {
  const refresh = useMutationState();
  if (view.kind !== 'ready' && view.kind !== 'failed') {
    return [];
  }
  return [
    {
      icon: 'refresh',
      label: refresh.busy ? 'Refreshing…' : 'Refresh',
      onPress: (): void => {
        refresh.run(refreshWeather, { failure: 'The weather couldn’t be fetched' });
      },
    },
  ];
}

export function WeatherScreen(): ReactNode {
  const view = useWeather();
  const actions = useRefreshAction(view);
  const place = useSettings().home_name;
  return (
    <Screen header={<PageHeader title="Weather" subtitle={place} wrapSubtitle actions={actions} />}>
      {view.kind === 'ready' ? (
        <Forecast view={view} />
      ) : (
        <Card className="w-full max-w-reading">
          <WeatherNotice view={view} />
        </Card>
      )}
    </Screen>
  );
}
