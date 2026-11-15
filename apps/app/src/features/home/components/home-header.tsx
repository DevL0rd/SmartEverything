import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { joinParts } from '../../../format/text';
import { hourOf, longDate } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
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
      className="-mx-1 -my-3.5 flex-row items-center gap-1 self-start rounded-sm px-1 py-3.5"
      layerClassName="rounded-sm"
    >
      <Text variant="callout" tone="variant" numberOfLines={2} className="shrink">
        {text}
      </Text>
      <Icon name="chevronRight" size={16} tone="faint" />
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

export function useGreeting(): string {
  const now = new Date(useMinute());
  const zone = useSettings().time_zone;
  return `${greetingOf(hourOf(now, zone))} · ${longDate(now, zone)}`;
}
