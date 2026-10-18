import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Bars } from '../../../components/charts';
import { Card } from '../../../components/card';
import { LiveFigure } from '../../../components/live-figure';
import { Text } from '../../../components/text';
import { hoursMinutes } from '../../../format/time';
import { LockLine, NeedLine } from '../screens/detail-parts';
import {
  againstAverage,
  averageBefore,
  todayKey,
  weekBars,
  weekSpoken,
  type ScreenSection,
} from './screen-model';

type Usage = NonNullable<ScreenSection['usage']>;

export interface ScreenTimeProps {
  readonly usage: ScreenSection['usage'];
  readonly own: boolean;
  readonly person: string;
  readonly offline: boolean;
}

function whoseOf(own: boolean, person: string): string {
  return own ? 'your' : `${person}’s`;
}

function Week({
  usage,
  whose,
  offline,
}: {
  readonly usage: Usage;
  readonly whose: string;
  readonly offline: boolean;
}): ReactNode {
  const today = usage.screenMinutesByDay.at(-1)?.minutes ?? 0;
  const note = againstAverage(today, averageBefore(usage), whose);
  const key = todayKey(usage);
  return (
    <>
      <View className="flex-row flex-wrap items-baseline gap-x-3">
        <LiveFigure value={hoursMinutes(today)} size="l" widest="8h 88m" stale={offline} />
        <Text variant="callout" tone="variant">
          today
        </Text>
        {note === null ? null : (
          <Text variant="callout" tone="variant">
            {note}
          </Text>
        )}
      </View>
      <Bars
        bars={weekBars(usage)}
        colour="viz-1"
        label={weekSpoken(usage)}
        height={150}
        formatValue={hoursMinutes}
        {...(key === null ? {} : { highlightKey: key })}
      />
    </>
  );
}

export function ScreenTimeCard({ usage, own, person, offline }: ScreenTimeProps): ReactNode {
  const whose = whoseOf(own, person);
  return (
    <Card title="Screen time" icon="sun">
      {usage === null ? (
        own ? (
          <NeedLine text="Allow App usage access on the phone to see screen time" />
        ) : (
          <LockLine text={`Screen time stays with ${person}`} />
        )
      ) : (
        <Week usage={usage} whose={whose} offline={offline} />
      )}
    </Card>
  );
}
