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
import { startOfDayKey, weekdayShort } from '../../../format/time';
import { weekdayLetterOf } from '../clock/alarm-text';
import { bookerNameOf, type BookingDay, type UpcomingBooking } from './booking-model';
import { useInstantClock, type InstantClock } from '../../clock/format/clock-format';

export function bookingDayLabelOf(day: BookingDay): string {
  const date = new Date(startOfDayKey(day.day));
  return `${weekdayLetterOf(date.getDay())} ${String(date.getDate())}`;
}

export function BookingWeekCard({
  week,
  next,
}: {
  readonly week: readonly BookingDay[];
  readonly next: UpcomingBooking | null;
}): ReactNode {
  const total = week.reduce((sum, day) => sum + day.count, 0);
  const instant = useInstantClock();
  const nextText =
    next === null
      ? null
      : `Next ${weekdayShort(next.start)} ${instant(next.start)} · ${bookerNameOf(next)}`;
  return (
    <Card title="Bookings, next 7 days" icon="calendar">
      <Bars
        bars={week.map((day) => ({
          key: day.day,
          value: day.count,
          label: bookingDayLabelOf(day),
        }))}
        colour="primary"
        label={`Bookings per day for the next 7 days, ${plural(total, 'booking')}`}
        height={56}
        peakLabel={false}
        formatValue={(value) => plural(value, 'booking')}
      />
      <Text variant="footnote" tone="variant">
        {joinParts([`Next 7 days · ${plural(total, 'booking')}`, nextText])}
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

function bookingTimeOf(booking: UpcomingBooking, instant: InstantClock): string {
  const end = booking.item.end === null ? null : instant(booking.item.end);
  return end === null ? instant(booking.start) : `${instant(booking.start)}–${end}`;
}

function emailCaptionOf(
  booking: UpcomingBooking,
): { readonly caption: string; readonly captionEllipsize: 'middle' } | Record<never, never> {
  const email = booking.booker?.email ?? null;
  return email === null || email === '' ? {} : { caption: email, captionEllipsize: 'middle' };
}

export function UpcomingBookings({
  bookings,
  calendars,
}: {
  readonly bookings: readonly UpcomingBooking[];
  readonly calendars: readonly PlannerCollectionRow[];
}): ReactNode {
  const instant = useInstantClock();
  return (
    <List title="Upcoming bookings" caption={plural(bookings.length, 'booking')}>
      {bookings.map((booking) => (
        <ListRow
          key={booking.item.id}
          leading={<DateBlock start={booking.start} />}
          title={bookerNameOf(booking)}
          subtitle={joinParts([
            bookingTimeOf(booking, instant),
            calendars.find((calendar) => calendar.id === booking.item.collection_id)?.name,
          ])}
          {...emailCaptionOf(booking)}
          href={href.planner.item(booking.item.id, null)}
          chevron
        />
      ))}
    </List>
  );
}
