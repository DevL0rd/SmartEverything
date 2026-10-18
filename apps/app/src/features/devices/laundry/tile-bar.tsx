import type { ReactNode } from 'react';
import { ProgressBar } from '../../../components/charts';
import type { Device } from '../../../store/state';
import { progressOf, type CycleView } from './cycles';
import { useCycles } from './use-cycles';
import { useLaundry, type Laundry } from './use-laundry';

export function Bar({
  laundry,
  cycles,
}: {
  readonly laundry: Laundry;
  readonly cycles: CycleView;
}): ReactNode {
  const { state } = laundry;
  const progress = progressOf(state.remaining, cycles.plannedMinutes);
  if (progress === null || !(state.running || state.key === 'paused') || state.offline) {
    return null;
  }
  return (
    <ProgressBar
      progress={progress}
      colour={state.key === 'paused' ? 'warning' : 'primary'}
      label="Cycle progress"
    />
  );
}

export function LaundryTileBar({ device }: { readonly device: Device }): ReactNode {
  const laundry = useLaundry(device);
  const cycles = useCycles(device.id);
  return <Bar laundry={laundry} cycles={cycles} />;
}
