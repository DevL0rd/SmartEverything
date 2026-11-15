import type { PlannerAlarmRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import {
  challengeTextOf,
  musicItemIdOf,
  soundIconOf,
  soundTextOf,
  sunriseTextOf,
} from '../../clock';
import { useDriveItem } from '../../drive';
import { TargetChip } from './target-chips';

const CHALLENGE_ICON = { maths: 'calculator', qr: 'qr', steps: 'footprints' } as const;

function SoundChip({ alarm }: { readonly alarm: PlannerAlarmRow }): ReactNode {
  const item = useDriveItem(musicItemIdOf(alarm.sound), null);
  if (alarm.sound.kind === 'tone') return null;
  return (
    <TargetChip
      icon={soundIconOf(alarm.sound)}
      label={soundTextOf(alarm.sound, item.data?.name ?? null)}
    />
  );
}

export function AlarmChips({ alarm }: { readonly alarm: PlannerAlarmRow }): ReactNode {
  const challenge = alarm.challenge;
  const challengeText = challengeTextOf(challenge);
  return (
    <>
      <SoundChip alarm={alarm} />
      {alarm.sunrise === null ? null : (
        <TargetChip icon="sunrise" label={sunriseTextOf(alarm.sunrise)} />
      )}
      {challenge.kind === 'none' || challengeText === null ? null : (
        <TargetChip icon={CHALLENGE_ICON[challenge.kind]} label={challengeText} />
      )}
      {alarm.snooze_limit === null ? null : (
        <TargetChip
          icon="repeat"
          label={
            alarm.snooze_limit === 1 ? 'Snooze once' : `Snooze ${String(alarm.snooze_limit)} times`
          }
        />
      )}
    </>
  );
}

export function hasAlarmChips(alarm: PlannerAlarmRow): boolean {
  return (
    alarm.sound.kind !== 'tone' ||
    alarm.sunrise !== null ||
    alarm.challenge.kind !== 'none' ||
    alarm.snooze_limit !== null
  );
}
