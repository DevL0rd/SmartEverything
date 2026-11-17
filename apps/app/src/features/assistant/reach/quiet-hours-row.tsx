import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { QuietHours } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { TimeField } from '../../../components/time-field';
import { clockTextOfTime, timeOfClockText, type ClockFormat } from '../../../format/clock-text';
import { useReachUpdate } from './reach-data';
import { ReachLoaded, unsaved } from './reach-loaded';
import { useHour24 } from '../../../store/clock-format';
import { useClockFormat } from '../../clock/format/clock-format';

const STANDARD: QuietHours = { from: '22:00', to: '07:00', urgent: true };

function quietSummary(quiet: QuietHours | null, format: ClockFormat): string {
  return quiet === null ? 'Off' : `${format.text(quiet.from)}–${format.text(quiet.to)}`;
}

interface SheetProps {
  readonly initial: QuietHours | null;
  readonly onClose: () => void;
}

function QuietFields({
  quiet,
  onChange,
}: {
  readonly quiet: QuietHours;
  readonly onChange: (quiet: QuietHours) => void;
}): ReactNode {
  const hour24 = useHour24();
  return (
    <View className="gap-4 py-2">
      <TimeField
        hour24={hour24}
        label="From"
        value={timeOfClockText(quiet.from)}
        onChange={(time) => {
          onChange({ ...quiet, from: clockTextOfTime(time) });
        }}
      />
      <TimeField
        hour24={hour24}
        label="To"
        value={timeOfClockText(quiet.to)}
        onChange={(time) => {
          onChange({ ...quiet, to: clockTextOfTime(time) });
        }}
      />
      <SwitchRow
        title="Let urgent calls through"
        subtitle="The AI says when something is urgent, like smoke or a leak."
        value={quiet.urgent}
        onChange={(urgent) => {
          onChange({ ...quiet, urgent });
        }}
      />
    </View>
  );
}

function QuietSheet({ initial, onClose }: SheetProps): ReactNode {
  const update = useReachUpdate();
  const [quiet, setQuiet] = useState<QuietHours>(initial ?? STANDARD);
  const [on, setOn] = useState(initial !== null);
  const save = (): void => {
    onClose();
    update({ quiet: on ? quiet : null }).catch(unsaved);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Quiet hours"
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button label="Save" onPress={save} />
        </>
      }
    >
      <SwitchRow title="Quiet hours" value={on} onChange={setOn} />
      {on ? <QuietFields quiet={quiet} onChange={setQuiet} /> : null}
    </Sheet>
  );
}

export function QuietHoursRow(): ReactNode {
  const [open, setOpen] = useState(false);
  const format = useClockFormat();
  return (
    <ReachLoaded>
      {(settings) => (
        <>
          <ListRow
            title="Quiet hours"
            subtitle="No calls or notifications from the AI"
            icon="moon"
            value={quietSummary(settings.quiet, format)}
            chevron
            onPress={() => {
              setOpen(true);
            }}
          />
          {open ? (
            <QuietSheet
              initial={settings.quiet}
              onClose={() => {
                setOpen(false);
              }}
            />
          ) : null}
        </>
      )}
    </ReachLoaded>
  );
}
