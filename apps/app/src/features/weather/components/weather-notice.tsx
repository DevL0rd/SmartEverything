import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { WidgetEmpty, type WidgetSize } from '../../../components/widget-board';
import { useMutationState } from '../../../store/mutation';
import { refreshWeather } from '../../../api/weather';
import type { WeatherView } from '../data/use-weather';

export const LOCATION_HREF = href.settings.focus('home/location', 'home.location');

interface NoticeCopy {
  readonly title: string;
  readonly body: string;
}

export function copyOf(view: Exclude<WeatherView, { kind: 'ready' | 'loading' }>): NoticeCopy {
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
  compact,
}: {
  readonly view: Exclude<WeatherView, { kind: 'ready' }>;
  readonly compact: boolean;
}): ReactNode {
  if (view.kind === 'loading') {
    return (
      <View className="flex-1 gap-2">
        <Skeleton shape="block" className="flex-1" />
      </View>
    );
  }
  const copy = copyOf(view);
  return (
    <View
      className={compact ? 'flex-1 justify-center gap-2' : 'flex-1 flex-row items-center gap-4'}
    >
      {compact ? null : (
        <Icon name={view.kind === 'no_location' ? 'mapPin' : 'weather'} size={32} />
      )}
      <View className="min-w-0 flex-1 gap-1">
        <Text variant="body-strong" numberOfLines={1}>
          {copy.title}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={compact ? 2 : 3}>
          {copy.body}
        </Text>
        {view.kind === 'failed' && !compact ? <Details reason={view.reason} /> : null}
      </View>
      <ActionOf view={view} />
    </View>
  );
}

export function WeatherWidgetNotice({
  view,
  size,
}: {
  readonly view: Exclude<WeatherView, { kind: 'ready' }>;
  readonly size: WidgetSize;
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
      size={size}
      {...(settable ? { action: { label: 'Set location', href: LOCATION_HREF } } : {})}
    />
  );
}

export function Details({ reason }: { readonly reason: string }): ReactNode {
  return (
    <Text variant="caption" tone="faint" selectable>
      {`Details: ${reason}`}
    </Text>
  );
}
