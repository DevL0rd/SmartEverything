import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AccessConditions, PersonAccess, QuietHours } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SwitchRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TimeField, localeUsesHour12 } from '../../../components/time-field';
import { notifyFailure } from '../../../components/toast-store';
import { clockTextOfTime, timeOfClockText } from '../../../format/clock-text';
import { PAUSED_WINDOW } from '../model/standing';
import type { AccessActions } from '../data/access-data';
import { DayWindowBar } from './day-window-bar';

function WindowFields({
  window,
  onChange,
}: {
  readonly window: QuietHours;
  readonly onChange: (window: QuietHours) => void;
}): ReactNode {
  const hour12 = localeUsesHour12();
  return (
    <View className="gap-4 py-2">
      <DayWindowBar schedule={window} nowShare={null} />
      <TimeField
        label="Paused from"
        value={timeOfClockText(window.from)}
        hour12={hour12}
        onChange={(time) => {
          onChange({ ...window, from: clockTextOfTime(time) });
        }}
      />
      <TimeField
        label="Until"
        value={timeOfClockText(window.to)}
        hour12={hour12}
        onChange={(time) => {
          onChange({ ...window, to: clockTextOfTime(time) });
        }}
      />
    </View>
  );
}

export function PausedWindowSheet({
  access,
  actions,
  onClose,
}: {
  readonly access: PersonAccess;
  readonly actions: AccessActions;
  readonly onClose: () => void;
}): ReactNode {
  const [on, setOn] = useState(access.conditions.schedule !== null);
  const [window, setWindow] = useState<QuietHours>(access.conditions.schedule ?? PAUSED_WINDOW);
  const save = (): void => {
    const conditions: AccessConditions = { ...access.conditions, schedule: on ? window : null };
    onClose();
    actions
      .change(access.profile_id, { conditions })
      .catch(notifyFailure('The paused hours were not saved'));
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Paused hours"
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button label="Save" onPress={save} />
        </>
      }
    >
      <Text variant="callout" tone="variant">
        Between these hours, in the home time zone, this person cannot use the home.
      </Text>
      <SwitchRow title="Pause at set hours" value={on} onChange={setOn} />
      {on ? <WindowFields window={window} onChange={setWindow} /> : null}
    </Sheet>
  );
}
