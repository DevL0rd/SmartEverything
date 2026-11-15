import type { PlannerBookingPageRow, PlannerPreferences } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { CardGrid } from '../../../components/card-grid';
import { EmptyState } from '../../../components/empty-state';
import { useFrameBodyWidth } from '../../../components/page-shell/body-width';
import { twoFrameColumnsAt } from '../../../components/page-shell/layout';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { Section } from '../../../components/section';
import { dayKeyOf, shiftDay, weekdayShort } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { weekOrderOf } from '../clock/alarm-text';
import {
  useBookingGuests,
  useBookingLinkBase,
  usePlannerBookingPages,
  usePlannerBookingWrites,
  usePlannerCollections,
  usePlannerItems,
  usePlannerPreferences,
  type PlannerPerson,
} from '../data';
import { usePlannerShownPerson } from '../frame/person';
import { PlannerFrame } from '../frame/planner-frame';
import { QueryBody } from '../frame/query-body';
import { BookingEditor } from './booking-editor';
import { BookingWeekCard, UpcomingBookings } from './booking-lists';
import {
  bookingLinkOf,
  bookingPageOrderOf,
  bookingWeekOf,
  nextDaysOf,
  pageBookingsOf,
  upcomingBookingsOf,
} from './booking-model';
import { PageCard } from './page-card';

const SUNDAY_NOON = new Date(2024, 0, 7, 12).getTime();

const DAY_MS = 24 * 60 * 60 * 1000;

function shortDayName(day: number): string {
  return weekdayShort(SUNDAY_NOON + day * DAY_MS);
}

interface Editing {
  readonly page: PlannerBookingPageRow | null;
}

interface PagesProps {
  readonly person: PlannerPerson;
  readonly prefs: PlannerPreferences;
  readonly pages: readonly PlannerBookingPageRow[];
  readonly onEdit: (editing: Editing) => void;
}

function useUpcoming(person: PlannerPerson): ReturnType<typeof upcomingBookingsOf> {
  const now = useMinute();
  return upcomingBookingsOf(usePlannerItems(person), useBookingGuests(), now);
}

function WeekSection({
  person,
  upcoming,
  wide,
}: {
  readonly person: PlannerPerson;
  readonly upcoming: ReturnType<typeof upcomingBookingsOf>;
  readonly wide: boolean;
}): ReactNode {
  const items = usePlannerItems(person);
  const days = nextDaysOf(dayKeyOf(useMinute()), shiftDay);
  const calendars = usePlannerCollections(person);
  return (
    <View className={wide ? 'flex-row items-start gap-4' : 'gap-section-gap'}>
      <View className={wide ? 'min-w-0 flex-1 pt-9' : ''}>
        <BookingWeekCard week={bookingWeekOf(items, days, dayKeyOf)} next={upcoming[0] ?? null} />
      </View>
      <View className={wide ? 'min-w-0 flex-1' : ''}>
        <UpcomingBookings bookings={upcoming} calendars={calendars} />
      </View>
    </View>
  );
}

function PageCards({
  person,
  prefs,
  pages,
  onEdit,
  wide,
}: PagesProps & { readonly wide: boolean }): ReactNode {
  const writes = usePlannerBookingWrites(person);
  const base = useBookingLinkBase();
  const calendars = usePlannerCollections(person);
  const items = usePlannerItems(person);
  const days = nextDaysOf(dayKeyOf(useMinute()), shiftDay);
  const order = weekOrderOf(prefs.general.week_start);
  return (
    <Section title="Pages">
      <CardGrid
        items={bookingPageOrderOf(pages)}
        columns={wide ? 2 : 1}
        keyOf={(page) => page.id}
        render={(page) => (
          <PageCard
            page={page}
            link={bookingLinkOf(page.token, base)}
            calendar={
              calendars.find((calendar) => calendar.id === page.collection_id)?.name ?? null
            }
            order={order}
            week={bookingWeekOf(pageBookingsOf(items, page.id), days, dayKeyOf)}
            dayName={shortDayName}
            writes={writes}
            onEdit={() => {
              onEdit({ page });
            }}
          />
        )}
      />
    </Section>
  );
}

function NoPages({ onCreate }: { readonly onCreate: () => void }): ReactNode {
  return (
    <EmptyState
      icon="share"
      title="No booking pages yet"
      body="A booking page is a link people open to pick a time when you are free. Each booking lands on your calendar."
      action={<Button label="New booking page" icon="plus" onPress={onCreate} />}
    />
  );
}

function BookingBody(props: PagesProps): ReactNode {
  const upcoming = useUpcoming(props.person);
  const wide = twoFrameColumnsAt(useFrameBodyWidth());
  const week =
    upcoming.length === 0 ? null : (
      <WeekSection person={props.person} upcoming={upcoming} wide={wide} />
    );
  return (
    <View className="gap-section-gap">
      {props.pages.length === 0 ? (
        <NoPages
          onCreate={() => {
            props.onEdit({ page: null });
          }}
        />
      ) : null}
      {week}
      {props.pages.length === 0 ? null : <PageCards {...props} wide={wide} />}
    </View>
  );
}

export function BookingPage(): ReactNode {
  const person = usePlannerShownPerson();
  const prefs = usePlannerPreferences(person);
  const pages = usePlannerBookingPages(person);
  const [editing, setEditing] = useState<Editing | null>(null);
  const ready = prefs.data !== undefined;
  const action: ShellAction = {
    icon: 'plus',
    label: 'New booking page',
    primary: true,
    disabled: !ready,
    onPress: () => {
      setEditing({ page: null });
    },
  };
  return (
    <PlannerFrame section="booking" actions={[action]}>
      <QueryBody query={prefs}>
        {(loaded) => (
          <>
            <BookingBody person={person} prefs={loaded} pages={pages} onEdit={setEditing} />
            {editing === null ? null : (
              <BookingEditor
                key={editing.page?.id ?? 'new'}
                person={person}
                page={editing.page}
                prefs={loaded}
                open
                onClose={() => {
                  setEditing(null);
                }}
              />
            )}
          </>
        )}
      </QueryBody>
    </PlannerFrame>
  );
}
