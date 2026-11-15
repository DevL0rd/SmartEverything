import type { ReactNode } from 'react';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { SoundPicker, snoozeLimitText } from '../../clock';
import { useOwnPrefs, useSavePrefs } from '../settings/preferences';

export function DefaultSoundRow(): ReactNode {
  const prefs = useOwnPrefs();
  const save = useSavePrefs('Alarm sound');
  if (prefs === undefined) return <ListRow title="Alarm sound" icon="bell" disabled />;
  return (
    <SoundPicker
      title="Alarm sound"
      sheetTitle="Sound for new alarms"
      sound={prefs.clock.sound}
      compact={false}
      disabled={false}
      onChange={(sound) => {
        save(() => ({ clock: { sound } }));
      }}
    />
  );
}

export function DefaultSnoozeLimitRow(): ReactNode {
  const prefs = useOwnPrefs();
  const save = useSavePrefs('Snooze limit');
  if (prefs === undefined) return <ListRow title="Snooze limit" icon="repeat" disabled />;
  return (
    <ListRow
      title="Snooze limit"
      icon="repeat"
      trailing={
        <NumberStepper
          label="Snooze limit"
          value={prefs.clock.snooze_limit ?? 0}
          min={0}
          max={Number.MAX_SAFE_INTEGER}
          step={1}
          formatValue={snoozeLimitText}
          onChange={(limit) => {
            save(() => ({ clock: { snooze_limit: limit === 0 ? null : limit } }));
          }}
        />
      }
    />
  );
}
