import type { ReactNode } from 'react';
import type { GoogleAccountRow } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { setCalendarSync } from './google-actions';
import { calendarChoices, syncedLists, type CalendarChoice } from './google-choices';
import type { GoogleServiceSectionProps } from './google-sections';
import { useGoogleCollections } from './use-google';

function CalendarRow({
  account,
  choice,
}: {
  readonly account: GoogleAccountRow;
  readonly choice: CalendarChoice;
}): ReactNode {
  return (
    <SwitchRow
      icon="calendar"
      title={choice.name}
      subtitle="Calendar"
      label={`Sync ${choice.name}`}
      value={choice.on}
      onChange={(on) => {
        setCalendarSync(account, choice.googleId, on);
      }}
    />
  );
}

export function PlannerSyncSection({ account }: GoogleServiceSectionProps): ReactNode {
  const collections = useGoogleCollections();
  const calendars = calendarChoices(account, collections);
  const lists = syncedLists(account, collections);
  const rows = [
    ...calendars.map((choice) => (
      <CalendarRow key={`calendar-${choice.googleId}`} account={account} choice={choice} />
    )),
    ...lists.map((list) => (
      <ListRow
        key={`list-${list.googleId}`}
        icon="list"
        title={list.name}
        subtitle="Task list"
        value="Syncs"
      />
    )),
  ];
  return (
    <List
      inset
      title="What syncs"
      caption="both ways"
      footer="Times on tasks stay here, Google keeps the date. Google Keep and Google Clock alarms have no public API, so they stay out of sync."
    >
      {rows.length === 0
        ? [
            <ListRow
              key="none"
              icon="calendar"
              title="Nothing picked yet"
              subtitle="Calendars and task lists appear here after the first sync."
              wrapSubtitle
            />,
          ]
        : rows}
    </List>
  );
}
