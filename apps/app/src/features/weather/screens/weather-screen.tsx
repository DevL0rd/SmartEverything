import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { Grid } from '../../../components/grid';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { refreshWeather } from '../../../api/weather';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { useMutationState } from '../../../store/mutation';
import { relative } from '../../../format/time';
import { SunTimes } from '../components/sun-times';
import { AirChip, WeatherHero } from '../components/weather-hero';
import { Details, WeatherNotice } from '../components/weather-notice';
import { useWeather, type WeatherView } from '../data/use-weather';
import { AirSection } from './air-section';
import {
  Attribution,
  DailySection,
  DetailsSection,
  HourlySection,
  SunSection,
} from './weather-sections';

type Ready = Extract<WeatherView, { kind: 'ready' }>;

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

function Forecast({ view }: { readonly view: Ready }): ReactNode {
  const now = useMinute();
  const { forecast } = view;
  return (
    <View className="gap-section-gap">
      <Warnings view={view} now={now} />
      <Hero view={view} now={now} />
      <HourlySection forecast={forecast} now={now} />
      <Grid minItemWidth={320} maxColumns={2}>
        <DailySection forecast={forecast} now={now} />
        <View className="gap-grid-gap">
          <AirSection air={forecast.air} problem={view.airError} />
          <SunSection forecast={forecast} now={now} />
        </View>
      </Grid>
      <DetailsSection forecast={forecast} now={now} />
      <Attribution fetchedAt={view.fetchedAt} timeZone={forecast.timeZone} />
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
    <Screen
      maxWidth="detail"
      header={<PageHeader title="Weather" subtitle={place} actions={actions} />}
    >
      {view.kind === 'ready' ? (
        <Forecast view={view} />
      ) : (
        <Card>
          <WeatherNotice view={view} compact={false} />
        </Card>
      )}
    </Screen>
  );
}
