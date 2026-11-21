import type { ReactNode } from 'react';
import { View } from 'react-native';
import { nextSystemAlarm, plannerLinked } from '../../../../modules/health-connect';
import { Badge } from '../../../components/badge';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { ClockFormat } from '../../../format/clock-text';
import { MINUTE_MS, localDayKey, zonedStartOfDay } from '../../../format/time';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { dayWordOf } from '../../planner';
import { useClockFormat } from '../../../store/clock-format';

const SYSTEM_ALARM_KEY = ['clock', 'system-alarm'] as const;

function useSystemAlarm(): string | null {
  const query = useScreenQuery({
    queryKey: SYSTEM_ALARM_KEY,
    // eslint-disable-next-line local/query-fn-signal -- the native module reads on the device, which cannot be aborted
    queryFn: nextSystemAlarm,
    enabled: plannerLinked(),
  });
  return query.data ?? null;
}

function systemAlarmTextOf(at: string, now: number, timeZone: string, format: ClockFormat): string {
  const moment = Date.parse(at);
  const minute = (moment - zonedStartOfDay(localDayKey(moment, timeZone), timeZone)) / MINUTE_MS;
  return `${format.minutes(minute)} ${dayWordOf(moment, now, timeZone)}`;
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
  const format = useClockFormat();
  if (at === null) return null;
  const when = systemAlarmTextOf(at, now, timeZone, format);
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
