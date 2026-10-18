import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import type { Device } from '../../../store/state';
import { MicrowaveAdvanced } from './advanced';
import { cardActions } from './card-actions';
import { stateLine } from './card-model';
import { CookPanel } from './cook-panel';
import { CycleRows } from './cycle-rows';
import { QUICK_CYCLES } from './cycles';
import { useCycles } from './use-cycles';
import { useQuick } from './use-quick';
import { useRun } from './use-run';

function ProgramSheet({
  device,
  onClose,
}: {
  readonly device: Device;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open title="Cooking program" detents={['full']} onClose={onClose}>
      <CookPanel device={device} />
    </Sheet>
  );
}

export function MicrowaveCooking({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="gap-4">
      <CookPanel device={device} />
      <MicrowaveAdvanced device={device} />
    </View>
  );
}

export function MicrowaveProgramRow({ device }: { readonly device: Device }): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title="Cooking program"
        subtitle="Mode, duration, power and temperature"
        icon="heater"
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <ProgramSheet
          device={device}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

export function MicrowaveTile({ device }: { readonly device: Device }): ReactNode {
  const run = useRun(device);
  const quick = useQuick(device, true);
  return <>{cardActions({ device, run, quick, compact: true })}</>;
}

export function MicrowaveQuick({ device }: { readonly device: Device }): ReactNode {
  const [open, setOpen] = useState(false);
  const run = useRun(device);
  const quick = useQuick(device, true);
  const cycles = useCycles(device.id, true);
  const cooking = run.phase === 'running' || run.phase === 'paused';
  return (
    <View className="gap-4">
      <Text variant="footnote" tone="variant" numberOfLines={2}>
        {stateLine(run, cycles[0])}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        {cardActions({ device, run, quick })}
      </View>
      {cooking ? null : (
        <Button
          label="Cooking program"
          icon="heater"
          variant="tonal"
          onPress={() => {
            setOpen(true);
          }}
        />
      )}
      {cycles.length === 0 ? null : (
        <View className="gap-1">
          <Text variant="label" tone="variant">
            Recent cooking
          </Text>
          <CycleRows cycles={cycles.slice(0, QUICK_CYCLES)} label="Recent cooking" />
        </View>
      )}
      {open ? (
        <ProgramSheet
          device={device}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </View>
  );
}
