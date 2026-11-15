import type { PlannerBookingPageRow, PlannerPreferences } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { HeaderAction } from '../../../components/page-header';
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

function WeekSection({ person }: Pick<PagesProps, 'person'>): ReactNode {
  const now = useMinute();
  const items = usePlannerItems(person);
  const guests = useBookingGuests();
  const today = dayKeyOf(now);
  const days = nextDaysOf(today, shiftDay);
  const upcoming = upcomingBookingsOf(items, guests, now);
  const calendars = usePlannerCollections(person);
  return (
    <>
      <BookingWeekCard week={bookingWeekOf(items, days, dayKeyOf)} next={upcoming[0] ?? null} />
      <UpcomingBookings bookings={upcoming} calendars={calendars} />
    </>
  );
}

function PageCards({ person, prefs, pages, onEdit }: PagesProps): ReactNode {
  const writes = usePlannerBookingWrites(person);
  const base = useBookingLinkBase();
  const calendars = usePlannerCollections(person);
  const items = usePlannerItems(person);
  const days = nextDaysOf(dayKeyOf(useMinute()), shiftDay);
  const order = weekOrderOf(prefs.general.week_start);
  return (
    <Section title="Pages">
      <View className="gap-3">
        {bookingPageOrderOf(pages).map((page) => (
          <PageCard
            key={page.id}
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
        ))}
      </View>
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
  const create = (): void => {
    props.onEdit({ page: null });
  };
  if (props.pages.length === 0) {
    return (
      <View className="gap-section-gap">
        <NoPages onCreate={create} />
        <WeekSection person={props.person} />
      </View>
    );
  }
  return (
    <View className="gap-section-gap">
      <WeekSection person={props.person} />
      <PageCards {...props} />
    </View>
  );
}

export function BookingPage(): ReactNode {
  const person = usePlannerShownPerson();
  const prefs = usePlannerPreferences(person);
  const pages = usePlannerBookingPages(person);
  const [editing, setEditing] = useState<Editing | null>(null);
  const ready = prefs.data !== undefined;
  const action: HeaderAction = {
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
