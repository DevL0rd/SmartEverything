import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { WidgetEmpty } from '../../../components/widget-board';
import { useMutationState } from '../../../store/mutation';
import { refreshWeather } from '../../../api/weather';
import type { WeatherView } from '../data/use-weather';

export const LOCATION_HREF = href.settings.focus('home/location', 'home.location');

interface NoticeCopy {
  readonly title: string;
  readonly body: string;
}

function copyOf(view: Exclude<WeatherView, { kind: 'ready' | 'loading' }>): NoticeCopy {
  switch (view.kind) {
    case 'no_location':
      return {
        title: 'Where’s home?',
        body: view.canSet
          ? 'Set your home’s location to see the weather.'
          : 'The home’s owner can set its location in Settings.',
      };
    case 'failed':
      return { title: 'The weather isn’t available right now', body: 'Try again in a moment.' };
    case 'unsupported':
      return {
        title: 'Weather needs an update',
        body: 'Update the desktop app to get the weather.',
      };
  }
}

export function RetryButton(): ReactNode {
  const refresh = useMutationState();
  return (
    <Button
      label="Try again"
      variant="tonal"
      icon="refresh"
      loading={refresh.busy}
      onPress={() => {
        refresh.run(refreshWeather, { failure: 'The weather couldn’t be fetched' });
      }}
    />
  );
}

function ActionOf({ view }: { readonly view: WeatherView }): ReactNode {
  if (view.kind === 'no_location' && view.canSet) {
    return <Button label="Set location" icon="mapPin" href={LOCATION_HREF} />;
  }
  return view.kind === 'failed' ? <RetryButton /> : null;
}

export function WeatherNotice({
  view,
}: {
  readonly view: Exclude<WeatherView, { kind: 'ready' }>;
}): ReactNode {
  if (view.kind === 'loading') {
    return <Skeleton shape="block" />;
  }
  const copy = copyOf(view);
  return (
    <View className="flex-row flex-wrap items-start gap-4">
      <View className="min-w-0 grow shrink basis-64 flex-row items-start gap-4">
        <Icon name={view.kind === 'no_location' ? 'mapPin' : 'weather'} size={32} />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body-strong">{copy.title}</Text>
          <Text variant="footnote" tone="variant">
            {copy.body}
          </Text>
          {view.kind === 'failed' ? <Details reason={view.reason} /> : null}
        </View>
      </View>
      <ActionOf view={view} />
    </View>
  );
}

export function WeatherWidgetNotice({
  view,
}: {
  readonly view: Exclude<WeatherView, { kind: 'ready' }>;
}): ReactNode {
  if (view.kind === 'loading') {
    return <Skeleton shape="block" className="flex-1" />;
  }
  const copy = copyOf(view);
  const settable = view.kind === 'no_location' && view.canSet;
  return (
    <WidgetEmpty
      icon={view.kind === 'no_location' ? 'mapPin' : 'weather'}
      colour="info"
      title={copy.title}
      body={copy.body}
      {...(settable ? { action: { label: 'Set location', href: LOCATION_HREF } } : {})}
    />
  );
}

export function Details({ reason }: { readonly reason: string }): ReactNode {
  return (
    <Text variant="caption" tone="variant" selectable>
      {`Details: ${reason}`}
    </Text>
  );
}
