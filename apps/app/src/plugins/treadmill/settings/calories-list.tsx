import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { NavRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useMaxHeartRateSetting } from '../../../features/fitness/data/goals';
import { minimumSpeedLine } from '../model/settings-model';
import { useConfigure } from '../data/treadmill-act';
import { StepperRow } from './rows';
import type { SettingsProps } from './settings-props';
import { Anchored } from './anchored';

const GRADE = { min: 0, max: 15, step: 0.5 } as const;
const SWITCH_SPEED_MAX = 15;

function HeartRateRow({ deviceId }: { readonly deviceId: string }): ReactNode {
  const maxHeartRate = useMaxHeartRateSetting();
  return (
    <Anchored deviceId={deviceId} id="max-heart-rate" label="Maximum heart rate">
      <NavRow
        icon="heartPulse"
        title="Maximum heart rate"
        subtitle="Sets the heart rate zones on the live band. Changed in your fitness settings"
        wrapSubtitle
        value={maxHeartRate === null ? 'Automatic' : `${String(maxHeartRate)} bpm`}
        href={href.settings.focus('health', 'health-max-heart-rate')}
      />
    </Anchored>
  );
}

export function CaloriesList({ deviceId, state, settings }: SettingsProps): ReactNode {
  const configure = useConfigure(deviceId);
  const current = settings.settings;
  if (current === null) {
    return null;
  }
  return (
    <List
      inset
      title="Calories"
      footer="Energy is estimated from speed, grade and the walker’s weight in their profile."
    >
      {state.limits.incline === null ? (
        <Anchored deviceId={deviceId} id="grade" label="Belt grade">
          <StepperRow
            title="Belt grade"
            subtitle="The belt sits at about 4 percent; confirm on the unit"
            value={current.gradePercent}
            range={GRADE}
            unit="%"
            onChange={(next) => {
              configure({ gradePercent: next });
            }}
          />
        </Anchored>
      ) : null}
      <Anchored deviceId={deviceId} id="run-switch" label="Running starts at">
        <StepperRow
          title="Running starts at"
          subtitle={`Above this speed the running formula is used. ${minimumSpeedLine(state.limits.minKmh)}`}
          value={current.runSwitchKmh}
          range={{
            min: state.limits.minKmh,
            max: SWITCH_SPEED_MAX,
            step: state.limits.stepKmh,
          }}
          unit="km/h"
          onChange={(next) => {
            configure({ runSwitchKmh: next });
          }}
        />
      </Anchored>
      <HeartRateRow deviceId={deviceId} />
    </List>
  );
}
