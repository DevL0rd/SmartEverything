import type { BrushAlerts } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useConfigure } from '../data/brush-act';
import { Anchored } from './anchored';
import { StepperRow } from './rows';
import type { SettingsProps } from './settings-props';

const PERCENT = { min: 1, max: 100, step: 1 } as const;
const FIVE = { min: 5, max: 50, step: 5 } as const;

function HeadAlerts({
  deviceId,
  alerts,
}: {
  readonly deviceId: string;
  readonly alerts: BrushAlerts;
}): ReactNode {
  const configure = useConfigure(deviceId);
  return (
    <>
      <Anchored deviceId={deviceId} id="alert-head-warn" label="Warn when the brush head is worn">
        <StepperRow
          title="Warn when the brush head is worn"
          value={alerts.headWarnPercent}
          range={PERCENT}
          unit="%"
          onChange={(next) => {
            configure({ alerts: { headWarnPercent: next } });
          }}
        />
      </Anchored>
      <Anchored deviceId={deviceId} id="alert-head-due" label="Brush head is due">
        <StepperRow
          title="Brush head is due"
          value={alerts.headDuePercent}
          range={PERCENT}
          unit="%"
          onChange={(next) => {
            configure({ alerts: { headDuePercent: next } });
          }}
        />
      </Anchored>
      <Anchored
        deviceId={deviceId}
        id="alert-counterfeit"
        label="Warn about a head that is not recognised"
      >
        <SwitchRow
          icon="warning"
          title="Warn about a head that is not recognised"
          value={alerts.counterfeitWarning}
          onChange={(next) => {
            configure({ alerts: { counterfeitWarning: next } });
          }}
        />
      </Anchored>
    </>
  );
}

export function AlertsList({ deviceId, state, settings }: SettingsProps): ReactNode {
  const configure = useConfigure(deviceId);
  const value = settings.settings;
  if (value === null) {
    return null;
  }
  const { alerts } = value;
  return (
    <List
      inset
      title="Alerts"
      footer="Alerts reach you as notifications and can start automations."
    >
      {state.profile.head === 'full' || state.profile.head === 'usage' ? (
        <HeadAlerts deviceId={deviceId} alerts={alerts} />
      ) : null}
      <Anchored deviceId={deviceId} id="alert-battery" label="Low battery level">
        <StepperRow
          title="Low battery level"
          value={alerts.batteryLowPercent}
          range={FIVE}
          unit="%"
          onChange={(next) => {
            configure({ alerts: { batteryLowPercent: next } });
          }}
        />
      </Anchored>
    </List>
  );
}
