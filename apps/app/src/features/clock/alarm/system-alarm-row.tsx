import type { ReactNode } from 'react';
import { View } from 'react-native';
import { nextSystemAlarm, plannerLinked } from '../../../../modules/health-connect';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { MINUTE_MS, clockOfMinutes, localDayKey, zonedStartOfDay } from '../../../format/time';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { dayWordOf } from '../../planner/clock/alarm-text';

const SYSTEM_ALARM_KEY = ['clock', 'system-alarm'] as const;

function useSystemAlarm(): string | null {
  const query = useScreenQuery({
    queryKey: SYSTEM_ALARM_KEY,
    queryFn: nextSystemAlarm,
    enabled: plannerLinked(),
  });
  return query.data ?? null;
}

function systemAlarmTextOf(at: string, now: number, timeZone: string): string {
  const moment = Date.parse(at);
  const minute = (moment - zonedStartOfDay(localDayKey(moment, timeZone), timeZone)) / MINUTE_MS;
  return `${clockOfMinutes(minute)} ${dayWordOf(moment, now, timeZone)}`;
}

export function SystemAlarmRow({
  now,
  timeZone,
  compact,
}: {
  readonly now: number;
  readonly timeZone: string;
  readonly compact: boolean;
}): ReactNode {
  const at = useSystemAlarm();
  if (at === null) return null;
  const when = systemAlarmTextOf(at, now, timeZone);
  return (
    <View className="flex-row items-center gap-3 rounded-md border border-dashed border-outline-variant px-4 py-2.5">
      <Icon name="phone" size={compact ? 16 : 18} tone="variant" />
      {compact ? (
        <Text variant="caption" tone="variant" className="min-w-0 flex-1 tabular">
          {`Phone clock app: next ${when}, read only`}
        </Text>
      ) : (
        <>
          <View className="min-w-0 flex-1">
            <Text variant="footnote">Phone clock app</Text>
            <Text variant="caption" tone="variant" className="tabular">
              {`Its next alarm is ${when}. Shown here, changed in that app.`}
            </Text>
          </View>
          <Badge label="Read only" />
        </>
      )}
    </View>
  );
}
