import type { ReactNode } from 'react';
import { View } from 'react-native';
import { localClock, type PersonAccess } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Text } from '../../../components/text';
import { useMinute } from '../../../store/clock';
import { useSettings } from '../../../store/selectors';
import {
  PERSON_ROLE_LABEL,
  endedText,
  standingOf,
  standingText,
  standingTone,
  windowText,
  type Standing,
} from '../model/standing';
import { DayWindowBar } from './day-window-bar';

const MINUTES_PER_DAY = 1440;

function Limits({
  access,
  standing,
  now,
  zone,
}: {
  readonly access: PersonAccess;
  readonly standing: Standing;
  readonly now: number;
  readonly zone: string;
}): ReactNode {
  const { schedule } = access.conditions;
  if (standing.kind === 'ended' && access.expires_at !== null) {
    return (
      <Text variant="footnote" tone="variant">
        {endedText(access.expires_at, now)}
      </Text>
    );
  }
  return (
    <>
      <DayWindowBar
        schedule={schedule}
        nowShare={localClock(new Date(now), zone).minuteOfDay / MINUTES_PER_DAY}
      />
      <Text variant="footnote" tone="variant">
        {schedule === null ? 'Not paused at any hour' : `Paused ${windowText(schedule)}, home time`}
      </Text>
    </>
  );
}

export function StandingCard({ access }: { readonly access: PersonAccess }): ReactNode {
  const now = useMinute();
  const zone = useSettings().time_zone;
  const standing = standingOf(access, now, zone);
  return (
    <View className="gap-3 p-card-pad">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="body-strong">{standingText(standing, now)}</Text>
        <Badge label={PERSON_ROLE_LABEL[access.role]} tone={standingTone(standing)} />
      </View>
      {standing.kind === 'owner' ? null : (
        <Limits access={access} standing={standing} now={now} zone={zone} />
      )}
    </View>
  );
}
