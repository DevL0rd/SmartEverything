import type { PlannerCollectionRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { Bars } from '../../../components/charts/bars';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { joinParts, plural } from '../../../format/text';
import { clock, startOfDayKey, weekdayShort } from '../../../format/time';
import { weekdayLetterOf } from '../clock/alarm-text';
import { bookerNameOf, type BookingDay, type UpcomingBooking } from './booking-model';

export function BookingWeekCard({
  week,
  next,
}: {
  readonly week: readonly BookingDay[];
  readonly next: UpcomingBooking | null;
}): ReactNode {
  const total = week.reduce((sum, day) => sum + day.count, 0);
  const nextText =
    next === null
      ? 'Nothing booked yet'
      : `Next ${weekdayShort(next.start)} ${clock(next.start)} · ${bookerNameOf(next)}`;
  return (
    <Card title="Bookings, next 7 days" icon="calendar">
      <Bars
        bars={week.map((day) => ({
          key: day.day,
          value: day.count,
          label: weekdayLetterOf(new Date(startOfDayKey(day.day)).getDay()),
        }))}
        colour="primary"
        label={`Bookings per day for the next 7 days, ${plural(total, 'booking')}`}
        height={56}
        formatValue={(value) => plural(value, 'booking')}
      />
      <Text variant="footnote" tone="variant">
        {nextText}
      </Text>
    </Card>
  );
}

function DateBlock({ start }: { readonly start: number }): ReactNode {
  const date = new Date(start);
  return (
    <View className="w-11 items-center rounded-sm bg-primary-container py-1">
      <Text variant="caption" tone="onPrimaryContainer">
        {weekdayShort(start)}
      </Text>
      <Text variant="body-strong" tone="onPrimaryContainer" className="tabular">
        {String(date.getDate())}
      </Text>
    </View>
  );
}

function bookingTimeOf(booking: UpcomingBooking): string {
  const end = booking.item.end === null ? null : clock(booking.item.end);
  return end === null ? clock(booking.start) : `${clock(booking.start)}–${end}`;
}

export function UpcomingBookings({
  bookings,
  calendars,
}: {
  readonly bookings: readonly UpcomingBooking[];
  readonly calendars: readonly PlannerCollectionRow[];
}): ReactNode {
  if (bookings.length === 0) {
    return (
      <List title="Upcoming bookings">
        <ListRow
          title="Nothing booked yet"
          subtitle="Bookings show here as people pick a time."
          icon="calendar"
        />
      </List>
    );
  }
  return (
    <List title="Upcoming bookings" caption={plural(bookings.length, 'booking')}>
      {bookings.map((booking) => (
        <ListRow
          key={booking.item.id}
          leading={<DateBlock start={booking.start} />}
          title={bookerNameOf(booking)}
          subtitle={bookingTimeOf(booking)}
          caption={joinParts([
            booking.booker?.email,
            calendars.find((calendar) => calendar.id === booking.item.collection_id)?.name,
          ])}
          href={href.planner.item(booking.item.id, null)}
          chevron
        />
      ))}
    </List>
  );
}
