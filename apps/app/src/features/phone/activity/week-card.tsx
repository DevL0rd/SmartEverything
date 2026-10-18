import { useState, type ReactNode } from 'react';
import { Card } from '../../../components/card';
import { Bars, type Bar } from '../../../components/charts';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { hoursMinutes, weekdayShort } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import {
  DOING_DAYS,
  doingMinutesByDay,
  usePhoneDoing,
  type PhoneDoingState,
} from '../data/phone-history';
import { DOING_COLOURS } from '../model/doing';
import { CONTEXT_TEXT } from '../phone-context-text';

const CHART_HEIGHT = 140;
const MOVING: readonly PhoneDoingState[] = ['walking', 'running', 'cycling', 'driving', 'still'];

function formatMinutes(value: number): string {
  return hoursMinutes(Math.round(value));
}

export function WeekCard({ device }: { readonly device: Device }): ReactNode {
  const now = useMinute();
  const doing = usePhoneDoing(device.id, now);
  const [state, setState] = useState<PhoneDoingState>('walking');
  if (doing.segments === undefined) {
    return (
      <Card title="Last 7 days" icon="trendUp">
        <Skeleton shape="block" className="h-40" />
      </Card>
    );
  }
  const days = doingMinutesByDay(doing.segments, DOING_DAYS, now);
  const present = MOVING.filter((entry) => days.some((day) => day.minutes[entry] > 0));
  const shown = present.includes(state) ? state : (present[0] ?? 'walking');
  const bars: readonly Bar[] = days.map((day) => ({
    key: String(day.dayStart),
    value: day.minutes[shown],
    label: weekdayShort(day.dayStart),
  }));
  const last = days.at(-1);
  return (
    <Card title="Last 7 days" icon="trendUp">
      {present.length === 0 ? (
        <Text variant="callout" tone="variant">
          Nothing recorded in the last 7 days.
        </Text>
      ) : (
        <>
          <Segmented
            label="Activity"
            value={shown}
            onChange={setState}
            options={present.map((entry) => ({ value: entry, label: CONTEXT_TEXT[entry] }))}
          />
          <Bars
            bars={bars}
            colour={DOING_COLOURS[shown] === 'on-surface-faint' ? 'viz-1' : DOING_COLOURS[shown]}
            label={`${CONTEXT_TEXT[shown]} minutes per day, last 7 days`}
            height={CHART_HEIGHT}
            {...(last === undefined ? {} : { highlightKey: String(last.dayStart) })}
            formatValue={formatMinutes}
          />
        </>
      )}
    </Card>
  );
}
