import type { ReactNode } from 'react';
import type { Place } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { scheduledOf, type RuleView } from '../data/use-automations';
import { dayWindow, upcomingRuns } from '../model/schedule';

const SHOWN = 3;
const DAYS_AHEAD = 7;

export function NextUp({
  rules,
  place,
}: {
  readonly rules: readonly RuleView[];
  readonly place: Place;
}): ReactNode {
  const now = useMinute();
  const window = {
    start: new Date(now),
    end: dayWindow(new Date(now), place.timeZone, 0, DAYS_AHEAD).end,
  };
  const runs = upcomingRuns(
    rules.map((rule) => ({ id: rule.row.id, name: rule.row.name, scheduled: scheduledOf(rule) })),
    window,
    place,
  ).slice(0, SHOWN);
  if (runs.length === 0) {
    return null;
  }
  return (
    <List
      title="Next up"
      inset
      action={<Button label="Schedule" variant="text" href={href.automationSchedule()} />}
    >
      {runs.map((run) => (
        <ListRow
          key={run.key}
          title={run.name}
          icon="clock"
          iconTone="primary"
          value={moment(run.at, now, place.timeZone)}
          href={href.automation(run.automationId)}
        />
      ))}
    </List>
  );
}
