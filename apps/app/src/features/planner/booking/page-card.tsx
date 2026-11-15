import type { PlannerBookingPageRow, PlannerBookingWindow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Bars } from '../../../components/charts/bars';
import { confirm } from '../../../components/confirm-store';
import { CopyButton } from '../../../components/copy-button';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { joinParts, plural } from '../../../format/text';
import { clockOfMinutes, startOfDayKey } from '../../../format/time';
import { weekdayLetterOf } from '../clock/alarm-text';
import type { BookingWrites } from '../data';
import {
  availabilitySummaryOf,
  hourSpanOf,
  minuteOfTime,
  spanTextOf,
  type BookingDay,
  type BookingLink,
  type HourSpan,
} from './booking-model';

const DAY_MINUTES = 24 * 60;

const TRACK_PX = 48;

export interface PageCardProps {
  readonly page: PlannerBookingPageRow;
  readonly link: BookingLink;
  readonly calendar: string | null;
  readonly order: readonly number[];
  readonly week: readonly BookingDay[];
  readonly dayName: (day: number) => string;
  readonly writes: BookingWrites;
  readonly onEdit: () => void;
}

const REACH: Readonly<Record<BookingLink['reach'], string>> = {
  public: 'Anyone with the link can book.',
  home: 'The hub has no public address, so this link opens on your home network only.',
  unknown: 'The link shows once the hub is reachable.',
};

const TRACK = { height: TRACK_PX };

function DayTrack({
  day,
  windows,
  span,
  on,
}: {
  readonly day: number;
  readonly windows: readonly PlannerBookingWindow[];
  readonly span: HourSpan;
  readonly on: boolean;
}): ReactNode {
  const length = span.to - span.from;
  return (
    <View className="min-w-0 flex-1 items-center gap-1">
      <View className="w-full overflow-hidden rounded-xs bg-surface-3" style={TRACK}>
        {windows
          .filter((window) => window.day === day)
          .map((window) => {
            const start = minuteOfTime(window.start);
            const place = {
              top: ((start - span.from) / length) * TRACK_PX,
              height: ((minuteOfTime(window.end) - start) / length) * TRACK_PX,
            };
            return (
              <View
                key={window.start}
                className={cn('absolute inset-x-0 rounded-xs', on ? 'bg-primary' : 'bg-outline')}
                style={place}
              />
            );
          })}
      </View>
      <Text variant="caption" tone="faint">
        {weekdayLetterOf(day)}
      </Text>
    </View>
  );
}

function WeekStrip({ page, order }: Pick<PageCardProps, 'page' | 'order'>): ReactNode {
  const span = hourSpanOf(page.availability);
  return (
    <View className="flex-row items-stretch gap-2" accessible={false}>
      <View className="justify-between pb-5">
        <Text variant="caption" tone="faint" className="tabular">
          {clockOfMinutes(span.from)}
        </Text>
        <Text variant="caption" tone="faint" className="tabular">
          {span.to === DAY_MINUTES ? '24:00' : clockOfMinutes(span.to)}
        </Text>
      </View>
      <View className="min-w-0 flex-1 flex-row gap-1">
        {order.map((day) => (
          <DayTrack key={day} day={day} windows={page.availability} span={span} on={page.enabled} />
        ))}
      </View>
    </View>
  );
}

function PageBookings({
  title,
  week,
}: {
  readonly title: string;
  readonly week: readonly BookingDay[];
}): ReactNode {
  const total = week.reduce((sum, day) => sum + day.count, 0);
  return (
    <View className="gap-1">
      <Text variant="footnote" tone="variant">
        {total === 0 ? 'No bookings from this page in the next 7 days' : 'This page, next 7 days'}
      </Text>
      <Bars
        bars={week.map((day) => ({
          key: day.day,
          value: day.count,
          label: weekdayLetterOf(new Date(startOfDayKey(day.day)).getDay()),
        }))}
        colour="primary"
        label={`Bookings of ${title} per day for the next 7 days, ${plural(total, 'booking')}`}
        height={40}
        formatValue={(value) => plural(value, 'booking')}
      />
    </View>
  );
}

function LinkRow({
  link,
  title,
}: {
  readonly link: BookingLink;
  readonly title: string;
}): ReactNode {
  return (
    <View className="gap-1">
      {link.url === null ? null : (
        <View className="min-h-touch-min flex-row items-center gap-2 rounded-sm bg-surface-2 pl-3">
          <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
            {link.url}
          </Text>
          <CopyButton value={link.url} label={`Copy the link to ${title}`} what="Link" />
        </View>
      )}
      <Text variant="caption" tone="variant">
        {REACH[link.reach]}
      </Text>
    </View>
  );
}

function menuOf(page: PlannerBookingPageRow, writes: BookingWrites): readonly MenuItem[] {
  const run = (work: () => Promise<unknown>, failure: string): void => {
    background(work().catch(notifyFailure(failure)), 'planner.booking_page_failed');
  };
  return [
    {
      id: 'reset',
      label: 'Reset link',
      description: 'The old link stops working',
      icon: 'refresh',
      onPress: (): void => {
        run(() => writes.resetLink(page.id), 'The link could not be reset');
      },
    },
    {
      id: 'delete',
      label: 'Delete page',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        run(async () => {
          const sure = await confirm({
            title: `Delete ${page.title}?`,
            body: 'The link stops working. Bookings already made stay on your calendar.',
            confirmLabel: 'Delete',
            tone: 'destructive',
          });
          if (sure) await writes.remove(page.id);
        }, 'The page could not be deleted');
      },
    },
  ];
}

function EnabledSwitch({ page, writes }: Pick<PageCardProps, 'page' | 'writes'>): ReactNode {
  const [pending, setPending] = useState<boolean | null>(null);
  const value = pending ?? page.enabled;
  return (
    <Switch
      value={value}
      label={value ? `Turn off ${page.title}` : `Turn on ${page.title}`}
      disabled={pending !== null}
      onChange={(enabled) => {
        setPending(enabled);
        background(
          writes
            .update(page.id, { enabled })
            .catch(notifyFailure('The page could not be switched'))
            .finally(() => {
              setPending(null);
            }),
          'planner.booking_toggle_failed',
        );
      }}
    />
  );
}

export function PageCard(props: PageCardProps): ReactNode {
  const { page, link, calendar, order, week, dayName, writes, onEdit } = props;
  return (
    <Card
      title={page.title}
      icon="share"
      metadata={
        <Text variant="footnote" tone="variant">
          {joinParts([spanTextOf(page.minutes), page.enabled ? null : 'Off', calendar])}
        </Text>
      }
      action={<EnabledSwitch page={page} writes={writes} />}
    >
      <WeekStrip page={page} order={order} />
      <Text variant="footnote" tone={page.enabled ? 'default' : 'variant'}>
        {availabilitySummaryOf(page.availability, order, dayName)}
      </Text>
      <PageBookings title={page.title} week={week} />
      {page.enabled ? <LinkRow link={link} title={page.title} /> : null}
      <View className="flex-row items-center justify-between gap-2">
        <Button label="Edit" icon="pencil" variant="tonal" onPress={onEdit} />
        <OverflowButton items={menuOf(page, writes)} label={`More for ${page.title}`} />
      </View>
    </Card>
  );
}
