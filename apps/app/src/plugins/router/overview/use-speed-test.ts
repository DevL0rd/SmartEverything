import { useSectionParam } from '../../../components/use-section-param';
import { useRouterTools } from '../router-data';
import { background } from '@smarteverything/logging';

const OPEN = 'open';

export interface SpeedTestControls {
  readonly open: boolean;
  readonly show: () => void;
  readonly close: () => void;
  readonly run: () => Promise<unknown>;
  readonly start: () => void;
}

export function useSpeedTestControls(): SpeedTestControls {
  const [value, set, clear] = useSectionParam('speedtest');
  const tools = useRouterTools();
  const run = (): Promise<unknown> =>
    tools.run('run_speed_test', {}, 'The speed test didn’t start');
  return {
    open: value === OPEN,
    show: (): void => {
      set(OPEN);
    },
    close: clear,
    run,
    start: (): void => {
      set(OPEN);
      background(run(), 'use_speed_test.run_failed');
    },
  };
}
