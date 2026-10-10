import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { PageHeader } from '../../../components/page-header';
import { NavRow } from '../../../components/rows';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { MoreToAllow } from '../components/more-to-allow';
import { useToday } from '../data/day';
import { useHealthPresence } from '../data/presence';
import { PRESENCE_DAYS, useDailyRows } from '../data/queries';
import { SERIES, SERIES_GROUPS, formatReading } from '../model/catalogue';
import type { DailyFigure } from '../model/points';
import type { SeriesSpec } from '../model/series-spec';
import { latestReading } from '../model/today';
import { dayAge, shiftDay } from '../../../format/time';

function latestText(
  spec: SeriesSpec,
  figures: readonly DailyFigure[],
  today: string,
): string | undefined {
  if (spec.daily === null) {
    return undefined;
  }
  const reading = latestReading(figures, spec.daily, today);
  return reading === null
    ? undefined
    : `${formatReading(spec, reading.value)} · ${dayAge(reading.day, today)}`;
}

export function BrowseScreen(): ReactNode {
  const today = useToday();
  const presence = useHealthPresence(today);
  const rows = useDailyRows(shiftDay(today, -PRESENCE_DAYS), today);
  const groups = SERIES_GROUPS.map((group) => ({
    ...group,
    specs: SERIES.filter((spec) => spec.group === group.group && presence.types.has(spec.type)),
  })).filter((group) => group.specs.length > 0);
  return (
    <Screen header={<PageHeader title="All health data" />} maxWidth="reading">
      {presence.loaded ? null : <Skeleton shape="block" className="h-72" />}
      {groups.map((group) => (
        <List key={group.group} title={group.label} inset>
          {group.specs.map((spec) => {
            const value = latestText(spec, rows.figures, today);
            return (
              <NavRow
                key={spec.key}
                title={spec.label}
                icon={spec.icon}
                href={href.healthMetric(spec.key)}
                {...(value === undefined ? {} : { value })}
              />
            );
          })}
        </List>
      ))}
      <List inset>
        <NavRow title="Log health data" icon="plus" href={href.logHealth()} />
      </List>
      <MoreToAllow />
      <Text variant="footnote" tone="variant" className="px-4">
        {`Showing data from the last ${String(PRESENCE_DAYS)} days. More kinds appear when an app shares them with Health Connect.`}
      </Text>
    </Screen>
  );
}
