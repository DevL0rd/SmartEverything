import type { ReactNode } from 'react';
import { ActionRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useConfigure, useTreadmillAct } from '../data/treadmill-act';
import { lubricationLine } from '../model/settings-model';
import { StepperRow } from './rows';
import type { SettingsProps } from './settings-props';
import { Anchored } from './anchored';

const DAYS = { min: 30, max: 365, step: 15 } as const;

const GUIDE =
  'Every few months add 5 to 10 ml of silicone oil under the belt. Keep the belt centred; if it drifts, adjust the rear bolts a quarter turn at a time with the belt running slowly.';

export function CareList({ deviceId, state, settings }: SettingsProps): ReactNode {
  const { act } = useTreadmillAct(deviceId);
  const configure = useConfigure(deviceId);
  const current = settings.settings;
  if (current === null) {
    return null;
  }
  return (
    <List inset title="Care" footer={GUIDE}>
      <Anchored deviceId={deviceId} id="lubrication" label="Belt oiling">
        <ValueRow
          icon="wrench"
          title="Belt oiling"
          subtitle={lubricationLine(state.maintenance)}
          wrapSubtitle
          value=""
        />
      </Anchored>
      <StepperRow
        title="Remind me every"
        value={current.lubricationDays}
        range={DAYS}
        unit="days"
        onChange={(next) => {
          configure({ lubricationDays: next });
        }}
      />
      <Anchored deviceId={deviceId} id="mark-oiled" label="Mark as oiled">
        <ActionRow
          icon="circleCheck"
          title="Mark as oiled"
          onPress={() => {
            act({ action: 'mark_lubricated' }, 'Could not mark the belt as oiled', true);
          }}
        />
      </Anchored>
    </List>
  );
}
