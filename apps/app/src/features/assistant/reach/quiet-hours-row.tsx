import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { QuietHours } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { TimeField, localeUsesHour12, type TimeOfDay } from '../../../components/time-field';
import { twoDigits } from '../../../format/number';
import { useReachUpdate } from './reach-data';
import { ReachLoaded, unsaved } from './reach-loaded';

const STANDARD: QuietHours = { from: '22:00', to: '07:00', urgent: true };

function timeOf(text: string): TimeOfDay {
  const [hour = 0, minute = 0] = text.split(':').map(Number);
  return { hour, minute };
}

function textOf(time: TimeOfDay): string {
  return `${twoDigits(time.hour)}:${twoDigits(time.minute)}`;
}

export function quietSummary(quiet: QuietHours | null): string {
  return quiet === null ? 'Off' : `${quiet.from}–${quiet.to}`;
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
  const hour12 = localeUsesHour12();
  return (
    <View className="gap-4 py-2">
      <TimeField
        label="From"
        value={timeOf(quiet.from)}
        hour12={hour12}
        onChange={(time) => {
          onChange({ ...quiet, from: textOf(time) });
        }}
      />
      <TimeField
        label="To"
        value={timeOf(quiet.to)}
        hour12={hour12}
        onChange={(time) => {
          onChange({ ...quiet, to: textOf(time) });
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
  return (
    <ReachLoaded>
      {(settings) => (
        <>
          <ListRow
            title="Quiet hours"
            subtitle="No calls or notifications from the AI"
            icon="moon"
            value={quietSummary(settings.quiet)}
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
