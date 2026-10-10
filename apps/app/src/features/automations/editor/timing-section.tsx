import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { SignalWindowMode } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { timingText } from '../model/signal-text';
import type { SignalTiming } from '../model/signal-triggers';
import { SignalTimingFields } from './signal-timing-fields';

export function TimingSection({
  timing,
  modes,
  pulse,
  onChange,
}: {
  readonly timing: SignalTiming;
  readonly modes: readonly SignalWindowMode[];
  readonly pulse: boolean;
  readonly onChange: (timing: SignalTiming) => void;
}): ReactNode {
  const summary = timingText(timing);
  const [open, setOpen] = useState(summary !== '');
  return (
    <View className="gap-3">
      <ListRow
        title="Timing"
        icon="timer"
        value={summary === '' ? 'Right away' : summary}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open ? (
        <SignalTimingFields timing={timing} modes={modes} pulse={pulse} onChange={onChange} />
      ) : null}
    </View>
  );
}
