import type { PlannerAlarmRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Figure } from '../../../components/figure';
import { Interactive } from '../../../components/interactive';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { usePlannerWrites, useVisibleMinute, type PlannerPerson } from '../data';
import {
  alarmLabelOf,
  alarmsInRingOrder,
  dayWordOf,
  nextRingOf,
  nextRingTextOf,
  repeatTextOf,
} from './alarm-text';
import { AlarmChips, hasAlarmChips, type AlarmDefaults } from './alarm-chips';
import { DayDots } from './day-dots';
import { MissedAlarms } from './missed-alarm-card';
import { TargetChips } from './target-chips';
import { WatchStateLines } from './watch-state-line';

export type AlarmCardLayout = 'wide' | 'compact';

export interface AlarmCardProps {
  readonly alarm: PlannerAlarmRow;
  readonly now: number;
  readonly timeZone: string;
  readonly weekStart: number | null;
  readonly defaults: AlarmDefaults | null;
  readonly layout: AlarmCardLayout;
  readonly selected?: boolean;
  readonly hero?: boolean;
  readonly disabled?: boolean;
  readonly onToggle: (enabled: boolean) => void;
  readonly onOpen?: () => void;
}

const SELECTED = 'border border-primary/55 bg-primary/7';

const PASSIVE = { pointerEvents: 'none' } as const;

const THROUGH = { pointerEvents: 'box-none' } as const;

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

function OpenCard({
  card,
  className,
  children,
}: {
  readonly card: AlarmCardProps;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  const { alarm, selected = false, onOpen } = card;
  const passive = onOpen === undefined ? {} : THROUGH;
  return (
    <Card className={cn('relative', className, selected && SELECTED)}>
      {onOpen === undefined ? null : (
        <Interactive
          label={openLabelOf(alarm)}
          selected={selected}
          onPress={onOpen}
          className="absolute inset-0"
          layerClassName="rounded-lg"
        >
          {null}
        </Interactive>
      )}
      <View {...passive} className="gap-3">
        {children}
      </View>
    </Card>
  );
}

function Passive({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View {...PASSIVE} {...(className === undefined ? {} : { className })}>
      {children}
    </View>
  );
}

function Repeat({ alarm, weekStart }: AlarmCardProps): ReactNode {
  if (weekStart === null) return null;
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
  const { alarm, now, timeZone, defaults, selected = false } = props;
  return (
    <OpenCard card={props}>
      <View {...THROUGH} className="flex-row items-start gap-4">
        <Passive className="w-36 gap-0.5">
          <Figure
            value={alarm.time}
            size="l"
            tone={alarm.enabled ? (selected ? 'primary' : 'default') : 'variant'}
          />
          <AlarmName alarm={alarm} />
        </Passive>
        <Passive className="min-w-0 flex-1 gap-2 pt-1">
          <Repeat {...props} />
          <TargetChips
            alarm={alarm}
            defaults={defaults}
            extra={<AlarmChips alarm={alarm} defaults={defaults} />}
          />
        </Passive>
        <View {...THROUGH} className="items-end gap-1.5">
          <AlarmSwitch {...props} />
          <Passive>
            <Text variant="caption" tone="variant" className="tabular text-right">
              {nextRingTextOf(alarm, now, timeZone)}
            </Text>
          </Passive>
        </View>
      </View>
      <Passive>
        <WatchStateLines alarm={alarm} />
      </Passive>
    </OpenCard>
  );
}

function HeroCard(props: AlarmCardProps): ReactNode {
  const { alarm, now, timeZone, defaults } = props;
  const at = nextRingOf(alarm, now, timeZone);
  return (
    <OpenCard card={props} className="border border-primary/30">
      <View {...THROUGH} className="flex-row items-center justify-between gap-2">
        <Passive>
          <Badge
            label={
              at === null ? nextRingTextOf(alarm, now, timeZone) : dayWordOf(at, now, timeZone)
            }
            tone="primary"
            icon="alarmClock"
          />
        </Passive>
        <AlarmSwitch {...props} />
      </View>
      <Passive className="gap-3">
        <View className="flex-row flex-wrap items-baseline gap-3">
          <Figure value={alarm.time} size="xl" />
          <AlarmName alarm={alarm} />
        </View>
        <Text variant="footnote" tone="variant" className="tabular">
          {nextRingTextOf(alarm, now, timeZone)}
        </Text>
        <Repeat {...props} />
        <TargetChips
          alarm={alarm}
          defaults={defaults}
          extra={<AlarmChips alarm={alarm} defaults={defaults} />}
        />
        <WatchStateLines alarm={alarm} />
      </Passive>
    </OpenCard>
  );
}

function compactLineOf(props: AlarmCardProps): string {
  const next = nextRingTextOf(props.alarm, props.now, props.timeZone);
  return props.weekStart === null
    ? next
    : `${repeatTextOf(props.alarm, props.weekStart)} · ${next}`;
}

function CompactCard(props: AlarmCardProps): ReactNode {
  const { alarm, defaults } = props;
  return (
    <OpenCard card={props}>
      <View {...THROUGH} className="flex-row items-center gap-3">
        <Passive className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-baseline gap-2">
            <Figure value={alarm.time} size="m" tone={alarm.enabled ? 'default' : 'variant'} />
            <AlarmName alarm={alarm} />
          </View>
          <Text variant="footnote" tone="variant" className="tabular">
            {compactLineOf(props)}
          </Text>
        </Passive>
        <AlarmSwitch {...props} />
      </View>
      {hasAlarmChips(alarm, defaults) ? (
        <Passive className="flex-row flex-wrap gap-2">
          <AlarmChips alarm={alarm} defaults={defaults} />
        </Passive>
      ) : null}
      <Passive>
        <WatchStateLines alarm={alarm} />
      </Passive>
    </OpenCard>
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
  readonly weekStart: number | null;
  readonly defaults: AlarmDefaults | null;
  readonly layout: AlarmCardLayout;
  readonly offline: boolean;
  readonly selectedId?: string | null;
  readonly onOpen?: (alarm: PlannerAlarmRow) => void;
}

function run(failure: string, work: () => Promise<unknown>): void {
  background(work().catch(notifyFailure(failure)), 'clock.alarm_card_failed');
}

function useToggle(person: PlannerPerson): (alarm: PlannerAlarmRow, enabled: boolean) => void {
  const writes = usePlannerWrites(person);
  return (alarm, enabled): void => {
    run('Couldn’t change that alarm', () => writes.updateAlarm(alarm, { enabled }));
  };
}

export function AlarmList(props: AlarmListProps): ReactNode {
  const { person, alarms, timeZone, layout, offline, selectedId = null, onOpen } = props;
  const frame = useRef<View>(null);
  const { value: now, onLayout } = useVisibleMinute(frame);
  const toggle = useToggle(person);
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
          defaults={props.defaults}
          layout={layout}
          selected={alarm.id === selectedId}
          hero={alarm.id === heroId}
          disabled={offline}
          onToggle={(enabled) => {
            toggle(alarm, enabled);
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
