import type { PlannerAlarmRow, PlannerRingRow } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { clock, dayBoundsOf, localDayKey } from '../../../format/time';
import { usePlannerRings, type PlannerPerson } from '../data';
import {
  alarmLabelOf,
  missedAlarmsOf,
  missedPillOf,
  missedReasonOf,
  missedStoryOf,
} from './alarm-text';

export interface MissedAlarmCardProps {
  readonly ring: PlannerRingRow;
  readonly alarm: PlannerAlarmRow | null;
  readonly now: number;
  readonly timeZone: string;
  readonly onDismiss: () => void;
}

export function MissedAlarmCard({
  ring,
  alarm,
  now,
  timeZone,
  onDismiss,
}: MissedAlarmCardProps): ReactNode {
  return (
    <Card tone="critical">
      <View className="flex-row items-center justify-between gap-2">
        <Badge label={missedPillOf(ring.due_at, now, timeZone)} tone="critical" icon="warning" />
        <Text variant="caption" tone="variant">
          {missedReasonOf(ring)}
        </Text>
      </View>
      <View className="flex-row flex-wrap items-baseline gap-3">
        <Figure value={clock(ring.due_at, timeZone)} size="l" />
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {alarm === null ? 'Alarm' : alarmLabelOf(alarm)}
        </Text>
      </View>
      <Text variant="footnote">{missedStoryOf(ring, timeZone)}</Text>
      <View className="flex-row flex-wrap gap-2">
        <Button label="Got it" icon="check" variant="outlined" onPress={onDismiss} />
        <Button
          label="See wake log"
          icon="activity"
          variant="outlined"
          href={href.planner.insights()}
        />
      </View>
    </Card>
  );
}

export interface MissedAlarmsProps {
  readonly person: PlannerPerson;
  readonly alarms: readonly PlannerAlarmRow[];
  readonly now: number;
  readonly timeZone: string;
}

function useTodayRings(
  person: PlannerPerson,
  now: number,
  timeZone: string,
): UseQueryResult<PlannerRingRow[]> {
  const bounds = dayBoundsOf(localDayKey(now, timeZone), timeZone);
  return usePlannerRings(
    person,
    new Date(bounds.start).toISOString(),
    new Date(bounds.end).toISOString(),
  );
}

export function MissedAlarms({ person, alarms, now, timeZone }: MissedAlarmsProps): ReactNode {
  const rings = useTodayRings(person, now, timeZone);
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const missed = missedAlarmsOf(rings.data ?? []).filter((ring) => !seen.has(ring.id));
  if (missed.length === 0) return null;
  const alarmById = new Map(alarms.map((alarm) => [alarm.id, alarm]));
  return (
    <View className="gap-3">
      {missed.map((ring) => (
        <MissedAlarmCard
          key={ring.id}
          ring={ring}
          alarm={alarmById.get(ring.ref_id) ?? null}
          now={now}
          timeZone={timeZone}
          onDismiss={() => {
            setSeen((current) => new Set([...current, ring.id]));
          }}
        />
      ))}
    </View>
  );
}
