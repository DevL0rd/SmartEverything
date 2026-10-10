import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { hourOf, longDate } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import { openSearch } from '../../../search/open-search';
import { useHomeSummary } from '../data/home-data';
import type { HomeSummary } from '../model/summary';

function summaryText(summary: HomeSummary): string {
  return joinParts([
    summary.facts,
    summary.offline === 0 ? null : `${String(summary.offline)} offline`,
  ]);
}

export function SummaryLine(): ReactNode {
  const summary = useHomeSummary();
  const text = summaryText(summary);
  if (text === '') {
    return null;
  }
  if (summary.offline === 0) {
    return (
      <Text variant="callout" tone="variant" numberOfLines={2}>
        {text}
      </Text>
    );
  }
  return (
    <Interactive
      href={href.devices('offline')}
      label={`${text}. Show offline devices`}
      className="-mx-1 flex-row items-center gap-1 self-start rounded-sm px-1"
      layerClassName="rounded-sm"
    >
      <Text variant="callout" tone="variant" numberOfLines={2} className="shrink">
        {text}
      </Text>
      <Icon name="chevronRight" size={16} tone="faint" />
    </Interactive>
  );
}

function SearchBar(): ReactNode {
  return (
    <Interactive
      label="Search your home"
      onPress={() => {
        openSearch();
      }}
      className="h-14 flex-row items-center gap-3 rounded-full bg-surface-3 px-4"
      layerClassName="rounded-full"
    >
      <Icon name="search" size={24} tone="variant" />
      <Text variant="body" tone="faint" numberOfLines={1}>
        Search your home
      </Text>
    </Interactive>
  );
}

const MORNING = 5;
const AFTERNOON = 12;
const EVENING = 17;
const NIGHT = 22;

function greetingOf(hour: number): string {
  if (hour < MORNING || hour >= NIGHT) {
    return 'Good night';
  }
  if (hour < AFTERNOON) {
    return 'Good morning';
  }
  return hour < EVENING ? 'Good afternoon' : 'Good evening';
}

function Greeting(): ReactNode {
  const now = new Date(useMinute());
  const zone = useSettings().time_zone;
  return (
    <Text variant="body-strong" tone="primary" numberOfLines={1}>
      {`${greetingOf(hourOf(now, zone))} · ${longDate(now, zone)}`}
    </Text>
  );
}

export function HeaderBelow({ search }: { readonly search: boolean }): ReactNode {
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Greeting />
        <SummaryLine />
      </View>
      {search ? <SearchBar /> : null}
    </View>
  );
}
