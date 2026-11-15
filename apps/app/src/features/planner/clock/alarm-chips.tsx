import type { PlannerAlarmRow, PlannerPreferences } from '@smarteverything/domain';
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

export type AlarmDefaults = Pick<PlannerPreferences['clock'], 'snooze_limit' | 'targets'>;

function ownSnoozeLimit(alarm: PlannerAlarmRow, defaults: AlarmDefaults | null): number | null {
  if (alarm.snooze_limit === null) return null;
  return defaults !== null && alarm.snooze_limit === defaults.snooze_limit
    ? null
    : alarm.snooze_limit;
}

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

export function AlarmChips({
  alarm,
  defaults,
}: {
  readonly alarm: PlannerAlarmRow;
  readonly defaults: AlarmDefaults | null;
}): ReactNode {
  const challenge = alarm.challenge;
  const challengeText = challengeTextOf(challenge);
  const snoozeLimit = ownSnoozeLimit(alarm, defaults);
  return (
    <>
      <SoundChip alarm={alarm} />
      {alarm.sunrise === null ? null : (
        <TargetChip icon="sunrise" label={sunriseTextOf(alarm.sunrise)} />
      )}
      {challenge.kind === 'none' || challengeText === null ? null : (
        <TargetChip icon={CHALLENGE_ICON[challenge.kind]} label={challengeText} />
      )}
      {snoozeLimit === null ? null : (
        <TargetChip
          icon="repeat"
          label={snoozeLimit === 1 ? 'Snooze once' : `Snooze ${String(snoozeLimit)} times`}
        />
      )}
    </>
  );
}

export function hasAlarmChips(alarm: PlannerAlarmRow, defaults: AlarmDefaults | null): boolean {
  return (
    alarm.sound.kind !== 'tone' ||
    alarm.sunrise !== null ||
    alarm.challenge.kind !== 'none' ||
    ownSnoozeLimit(alarm, defaults) !== null
  );
}
