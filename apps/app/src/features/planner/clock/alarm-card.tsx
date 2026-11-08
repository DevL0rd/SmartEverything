import type { PlannerAlarmRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Figure } from '../../../components/figure';
import { Interactive } from '../../../components/interactive';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import {
  usePlannerClockWrites,
  usePlannerWrites,
  useVisibleMinute,
  type PlannerPerson,
} from '../data';
import {
  alarmLabelOf,
  alarmsInRingOrder,
  dayWordOf,
  nextRingOf,
  nextRingTextOf,
  repeatTextOf,
  skipDayOf,
} from './alarm-text';
import { DayDots } from './day-dots';
import { MissedAlarms } from './missed-alarm-card';
import { TargetChips } from './target-chips';
import { WatchStateLines } from './watch-state-line';

export type AlarmCardLayout = 'wide' | 'compact';

export interface AlarmCardProps {
  readonly alarm: PlannerAlarmRow;
  readonly now: number;
  readonly timeZone: string;
  readonly weekStart: number;
  readonly layout: AlarmCardLayout;
  readonly selected?: boolean;
  readonly hero?: boolean;
  readonly disabled?: boolean;
  readonly onToggle: (enabled: boolean) => void;
  readonly onOpen?: () => void;
  readonly onSkip?: () => void;
}

const SELECTED = 'border border-primary/55 bg-primary/7';

function openLabelOf(alarm: PlannerAlarmRow): string {
  return `Edit alarm ${alarm.time} ${alarmLabelOf(alarm)}`;
}

function AlarmName({ alarm }: { readonly alarm: PlannerAlarmRow }): ReactNode {
  return (
    <View className="min-w-0 flex-row flex-wrap items-center gap-2">
      <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 shrink">
        {alarmLabelOf(alarm)}
      </Text>
      {alarm.source === 'watch' ? <Badge label="From watch" icon="watch" /> : null}
    </View>
  );
}

function AlarmSwitch({ alarm, disabled, onToggle }: AlarmCardProps): ReactNode {
  return (
    <Switch
      value={alarm.enabled}
      onChange={onToggle}
      label={`Alarm ${alarm.time} ${alarmLabelOf(alarm)}`}
      disabled={disabled ?? false}
    />
  );
}

function OpenArea({
  card,
  className,
  children,
}: {
  readonly card: Pick<AlarmCardProps, 'alarm' | 'selected' | 'onOpen'>;
  readonly className: string;
  readonly children: ReactNode;
}): ReactNode {
  const { alarm, selected = false, onOpen } = card;
  if (onOpen === undefined) return <View className={className}>{children}</View>;
  return (
    <Interactive
      label={openLabelOf(alarm)}
      selected={selected}
      onPress={onOpen}
      className={className}
      layerClassName="rounded-md"
    >
      {children}
    </Interactive>
  );
}

function Repeat({ alarm, weekStart }: AlarmCardProps): ReactNode {
  if (alarm.once_on !== null || alarm.days.length === 0) {
    return (
      <Text variant="footnote" tone="variant" className="tabular">
        {repeatTextOf(alarm, weekStart)}
      </Text>
    );
  }
  return <DayDots days={alarm.days} weekStart={weekStart} />;
}

function WideCard(props: AlarmCardProps): ReactNode {
  const { alarm, now, timeZone, selected = false } = props;
  return (
    <Card className={cn(selected && SELECTED)}>
      <View className="flex-row items-start gap-4">
        <OpenArea card={props} className="min-w-0 flex-1 flex-row items-start gap-4">
          <View className="w-36 gap-0.5">
            <Figure
              value={alarm.time}
              size="l"
              tone={alarm.enabled ? (selected ? 'primary' : 'default') : 'variant'}
            />
            <AlarmName alarm={alarm} />
          </View>
          <View className="min-w-0 flex-1 gap-2 pt-1">
            <Repeat {...props} />
            <TargetChips alarm={alarm} />
          </View>
        </OpenArea>
        <View className="items-end gap-1.5">
          <AlarmSwitch {...props} />
          <Text variant="caption" tone="variant" className="tabular text-right">
            {nextRingTextOf(alarm, now, timeZone)}
          </Text>
        </View>
      </View>
      <WatchStateLines alarm={alarm} />
    </Card>
  );
}

function HeroActions({
  alarm,
  now,
  timeZone,
  disabled,
  onOpen,
  onSkip,
}: AlarmCardProps): ReactNode {
  const skip = skipDayOf(alarm, now, timeZone);
  return (
    <View className="flex-row flex-wrap gap-2">
      {skip === null || onSkip === undefined ? null : (
        <Button
          label={`Skip ${skip}`}
          icon="skipForward"
          variant="outlined"
          disabled={(disabled ?? false) || !alarm.enabled}
          onPress={onSkip}
        />
      )}
      {onOpen === undefined ? null : (
        <Button label="Edit" icon="pencil" variant="outlined" onPress={onOpen} />
      )}
    </View>
  );
}

function HeroCard(props: AlarmCardProps): ReactNode {
  const { alarm, now, timeZone } = props;
  const at = nextRingOf(alarm, now, timeZone);
  return (
    <Card className="border border-primary/30">
      <View className="flex-row items-center justify-between gap-2">
        <Badge
          label={at === null ? nextRingTextOf(alarm, now, timeZone) : dayWordOf(at, now, timeZone)}
          tone="primary"
          icon="alarmClock"
        />
        <AlarmSwitch {...props} />
      </View>
      <View className="flex-row flex-wrap items-baseline gap-3">
        <Figure value={alarm.time} size="xl" />
        <AlarmName alarm={alarm} />
      </View>
      <Text variant="footnote" tone="variant" className="tabular">
        {nextRingTextOf(alarm, now, timeZone)}
      </Text>
      <Repeat {...props} />
      <TargetChips alarm={alarm} />
      <WatchStateLines alarm={alarm} />
      <HeroActions {...props} />
    </Card>
  );
}

function CompactCard(props: AlarmCardProps): ReactNode {
  const { alarm, now, timeZone, weekStart } = props;
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <OpenArea card={props} className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-baseline gap-2">
            <Figure value={alarm.time} size="m" tone={alarm.enabled ? 'default' : 'variant'} />
            <AlarmName alarm={alarm} />
          </View>
          <Text variant="footnote" tone="variant" className="tabular">
            {`${repeatTextOf(alarm, weekStart)} · ${nextRingTextOf(alarm, now, timeZone)}`}
          </Text>
        </OpenArea>
        <AlarmSwitch {...props} />
      </View>
      <WatchStateLines alarm={alarm} />
    </Card>
  );
}

export function AlarmCard(props: AlarmCardProps): ReactNode {
  if (props.layout === 'wide') return <WideCard {...props} />;
  return props.hero === true ? <HeroCard {...props} /> : <CompactCard {...props} />;
}

export interface AlarmListProps {
  readonly person: PlannerPerson;
  readonly alarms: readonly PlannerAlarmRow[];
  readonly timeZone: string;
  readonly weekStart: number;
  readonly layout: AlarmCardLayout;
  readonly offline: boolean;
  readonly selectedId?: string | null;
  readonly onOpen?: (alarm: PlannerAlarmRow) => void;
}

function run(failure: string, work: () => Promise<unknown>): void {
  background(work().catch(notifyFailure(failure)), 'clock.alarm_card_failed');
}

interface AlarmHandlers {
  readonly toggle: (alarm: PlannerAlarmRow, enabled: boolean) => void;
  readonly skip: (alarm: PlannerAlarmRow) => void;
}

function useAlarmHandlers(person: PlannerPerson): AlarmHandlers {
  const writes = usePlannerWrites(person);
  const clock = usePlannerClockWrites(person);
  return {
    toggle: (alarm, enabled): void => {
      run('Couldn’t change that alarm', () => writes.updateAlarm(alarm, { enabled }));
    },
    skip: (alarm): void => {
      run('Couldn’t skip that alarm', () => clock.skipNextAlarm(alarm.id));
    },
  };
}

export function AlarmList(props: AlarmListProps): ReactNode {
  const { person, alarms, timeZone, layout, offline, selectedId = null, onOpen } = props;
  const frame = useRef<View>(null);
  const { value: now, onLayout } = useVisibleMinute(frame);
  const handlers = useAlarmHandlers(person);
  const ordered = alarmsInRingOrder(alarms, now, timeZone);
  const first = ordered[0];
  const heroId = first?.enabled === true ? first.id : null;
  return (
    <View ref={frame} onLayout={onLayout} className="gap-3">
      <MissedAlarms person={person} alarms={alarms} now={now} timeZone={timeZone} />
      {ordered.map((alarm) => (
        <AlarmCard
          key={alarm.id}
          alarm={alarm}
          now={now}
          timeZone={timeZone}
          weekStart={props.weekStart}
          layout={layout}
          selected={alarm.id === selectedId}
          hero={alarm.id === heroId}
          disabled={offline}
          onToggle={(enabled) => {
            handlers.toggle(alarm, enabled);
          }}
          onSkip={() => {
            handlers.skip(alarm);
          }}
          {...(onOpen === undefined
            ? {}
            : {
                onOpen: (): void => {
                  onOpen(alarm);
                },
              })}
        />
      ))}
    </View>
  );
}
