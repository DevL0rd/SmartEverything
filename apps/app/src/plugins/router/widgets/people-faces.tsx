import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { HScroller } from '../../../components/h-scroller';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useWidgetFace } from '../../../components/widget-board/use-widget-face';
import { cn } from '../../../design/cn';
import { ProfileAvatar } from '../../../features/profiles';
import { routerSectionHref } from '../overview/links';
import { bodyHeightOf, peopleFaceOf } from './frame-faces';
import { StaleLine } from './internet-parts';
import {
  fitRows,
  homeLine,
  homeStack,
  personLine,
  rowCapacity,
  type WidgetPerson,
} from './people-model';
import type { RouterReady } from './router-widget-frame';
import { staleCaptionOf, type StaleCaption } from './stale-caption';

const STALE_RESERVE = 22;

interface PeopleFaceProps {
  readonly people: readonly WidgetPerson[];
  readonly ready: RouterReady;
  readonly stale: StaleCaption | null;
}

function peopleHref(ready: RouterReady): ReturnType<typeof routerSectionHref> {
  return routerSectionHref(ready.device.id, 'clients', { filter: 'people' });
}

function StaleNote({
  stale,
  short,
  extra,
}: {
  readonly stale: StaleCaption | null;
  readonly short: boolean;
  readonly extra?: string;
}): ReactNode {
  return stale === null ? null : (
    <StaleLine
      text={short ? stale.short : stale.long}
      spoken={extra === undefined ? stale.long : `${stale.long}. ${extra}`}
      critical={stale.critical}
    />
  );
}

function Stack({ people, stale }: PeopleFaceProps): ReactNode {
  const { shown, more } = homeStack(people);
  return (
    <View className="gap-1.5">
      <View aria-hidden className={cn('flex-row items-center', stale !== null && 'opacity-60')}>
        {shown.map((person, index) => (
          <View
            key={person.id}
            className={
              index === 0 ? 'rounded-full' : '-ml-2 rounded-full border-2 border-surface-1'
            }
          >
            <ProfileAvatar profile={person.profile} />
          </View>
        ))}
        {more > 0 ? (
          <Text variant="caption" tone="variant" className="ml-1.5">
            {`+${String(more)}`}
          </Text>
        ) : null}
      </View>
      {stale === null ? (
        <Text variant="callout" numberOfLines={2}>
          {homeLine(people)}
        </Text>
      ) : (
        <StaleNote stale={stale} short extra={homeLine(people)} />
      )}
    </View>
  );
}

function Chip({
  person,
  ready,
}: {
  readonly person: WidgetPerson;
  readonly ready: RouterReady;
}): ReactNode {
  const line = personLine(person, ready.now);
  return (
    <View
      accessible
      accessibilityLabel={`${person.name}, ${line}`}
      className="min-h-12 flex-none flex-row items-center gap-2"
    >
      <ProfileAvatar profile={person.profile} />
      <View className="gap-0.5">
        <Text variant="callout" numberOfLines={1}>
          {person.name}
        </Text>
        <View className="flex-row items-center gap-1">
          <View
            aria-hidden
            className={cn(
              'size-2 rounded-full',
              person.home ? 'bg-positive' : 'border-2 border-on-surface-variant',
            )}
          />
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {line}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Chips({ people, ready, stale }: PeopleFaceProps): ReactNode {
  return (
    <View className="gap-1">
      <View className={cn(stale !== null && 'opacity-60')}>
        <HScroller label="People">
          {people.map((person) => (
            <Chip key={person.id} person={person} ready={ready} />
          ))}
        </HScroller>
      </View>
      <StaleNote stale={stale} short={false} />
    </View>
  );
}

function Row({
  person,
  ready,
}: {
  readonly person: WidgetPerson;
  readonly ready: RouterReady;
}): ReactNode {
  const line = personLine(person, ready.now);
  return (
    <Interactive
      href={peopleHref(ready)}
      label={`${person.name}, ${line}`}
      className="min-h-12 flex-row items-center gap-3"
    >
      <ProfileAvatar profile={person.profile} />
      <View className="min-w-0 flex-1">
        <Text variant="body" numberOfLines={1}>
          {person.name}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {line}
        </Text>
      </View>
      <Icon name="chevronRight" size={16} tone="variant" />
    </Interactive>
  );
}

function Rows({ people, ready, stale }: PeopleFaceProps): ReactNode {
  const { frame } = useWidgetFace();
  const capacity = rowCapacity(bodyHeightOf(frame), stale === null ? 0 : STALE_RESERVE);
  const { shown, more } = fitRows(people, capacity);
  return (
    <View className="flex-1 gap-1">
      <View className={cn('flex-1', stale !== null && 'opacity-60')}>
        {shown.map((person) => (
          <Row key={person.id} person={person} ready={ready} />
        ))}
        {more === 0 ? null : (
          <Interactive
            href={peopleHref(ready)}
            label={`${String(more)} more people`}
            className="min-h-12 justify-center"
          >
            <Text variant="footnote" tone="variant">
              {`+${String(more)} more`}
            </Text>
          </Interactive>
        )}
      </View>
      <StaleNote stale={stale} short={false} />
    </View>
  );
}

export function PeopleEmpty({ ready }: { readonly ready: RouterReady }): ReactNode {
  const { cls } = useWidgetFace();
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="variant" numberOfLines={3}>
        Say whose phone is whose on the router’s device list.
      </Text>
      {cls === 's' ? null : (
        <View className="items-start">
          <Button label="Open devices" variant="tonal" href={peopleHref(ready)} />
        </View>
      )}
    </View>
  );
}

export function PeopleFace(props: Omit<PeopleFaceProps, 'stale'>): ReactNode {
  const { cls } = useWidgetFace();
  const stale = staleCaptionOf(props.ready.snapshot.connection, props.ready.now);
  const shared = { ...props, stale };
  switch (peopleFaceOf(cls)) {
    case 'stack':
      return <Stack {...shared} />;
    case 'chips':
      return <Chips {...shared} />;
    case 'rows':
      return <Rows {...shared} />;
  }
}
