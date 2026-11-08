import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from '../../../components/app-href';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { joinParts } from '../../../format/text';
import { clock, dayLabel, moment } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import { useRow, useSettings } from '../../../store/selectors';
import type { ActivityItem } from '../model/coalesce';

type ActivityTime = 'clock' | 'moment';

function TimeText({
  item,
  time,
}: {
  readonly item: ActivityItem;
  readonly time: ActivityTime;
}): ReactNode {
  const zone = useSettings().time_zone;
  const now = useMinute();
  const today = dayLabel(item.at, now, zone) === 'Today';
  const end = time === 'clock' || today ? clock(item.at, zone) : moment(item.at, now, zone);
  const start = clock(item.since, zone);
  const shown = item.count > 1 && time === 'clock' && start !== end ? `${start}–${end}` : end;
  return (
    <Text variant="footnote" tone="variant" numberOfLines={1}>
      {shown}
    </Text>
  );
}

function useTarget(item: ActivityItem): AppHref | undefined {
  const device = useRow('devices', item.deviceId);
  if (device !== null) {
    return href.device(device);
  }
  return item.category === 'automations' ? href.automations() : undefined;
}

function Leading({
  item,
  pointer,
}: {
  readonly item: ActivityItem;
  readonly pointer: boolean;
}): ReactNode {
  return (
    <View
      className={cn(
        'items-center justify-center',
        pointer ? 'size-8 rounded-sm' : 'size-10 rounded-full',
        item.failed ? 'bg-critical/14' : 'bg-surface-2',
      )}
    >
      <Icon name={item.icon} size={pointer ? 16 : 20} tone={item.tone} />
    </View>
  );
}

function textOf(item: ActivityItem, withName: boolean): { title: string; detail: string } {
  return withName
    ? { title: item.name, detail: joinParts([item.summary, item.by]) }
    : { title: item.summary, detail: joinParts([item.by]) };
}

function frameOf(flush: boolean, single: boolean): string {
  return cn(
    'flex-row items-center gap-4 py-2',
    flush ? 'rounded-md' : 'px-4',
    single ? 'min-h-row-h' : 'min-h-row-h-2',
  );
}

export interface ActivityRowProps {
  readonly item: ActivityItem;
  readonly time?: ActivityTime;
  readonly withName?: boolean;
  readonly flush?: boolean;
  readonly timeline?: boolean;
}

function RowContent({
  item,
  time,
  withName,
  timeline,
  title,
  detail,
}: Required<Omit<ActivityRowProps, 'flush'>> & {
  readonly title: string;
  readonly detail: string;
}): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const leadingTime = timeline && pointer;
  const timestamp = <TimeText item={item} time={time} />;
  const lines = timeline ? 0 : 1;
  return (
    <>
      <Leading item={item} pointer={pointer} />
      {leadingTime ? <View className="w-32">{timestamp}</View> : null}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant={withName ? 'body-strong' : 'body'} numberOfLines={lines}>
          {title}
        </Text>
        {detail === '' ? null : (
          <Text variant="callout" tone={item.failed ? 'critical' : 'variant'} numberOfLines={lines}>
            {detail}
          </Text>
        )}
      </View>
      {leadingTime ? null : timestamp}
    </>
  );
}

export const ActivityRow = memo(function ActivityRow({
  item,
  time = 'clock',
  withName = true,
  flush = false,
  timeline = false,
}: ActivityRowProps): ReactNode {
  const target = useTarget(item);
  const { title, detail } = textOf(item, withName);
  const frame = frameOf(flush, detail === '');
  const content = (
    <RowContent
      item={item}
      time={time}
      withName={withName}
      timeline={timeline}
      title={title}
      detail={detail}
    />
  );
  if (target === undefined || !withName) {
    return <View className={frame}>{content}</View>;
  }
  return (
    <Interactive href={target} label={`${title}, ${detail}`} className={frame}>
      {content}
    </Interactive>
  );
});
