import type { TreadmillAction, TreadmillSettingsChange } from '@smarteverything/domain';
import { useQueryClient } from '@tanstack/react-query';
import { actOnTreadmill } from '../../../api/treadmills';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { treadmillPrefix } from './treadmill-keys';

export interface TreadmillActor {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly act: (action: TreadmillAction, failure: string, announce?: boolean) => void;
}

export function useTreadmillAct(deviceId: string): TreadmillActor {
  const client = useQueryClient();
  const { busy, problem, run } = useMutationState();
  return {
    busy,
    problem,
    act: (action, failure, announce = false): void => {
      run(
        async () => {
          const result = await actOnTreadmill(deviceId, action);
          await client.invalidateQueries({ queryKey: treadmillPrefix(deviceId) });
          return result;
        },
        {
          failure,
          onDone: (result) => {
            if (!result.ok) {
              notify({ message: failure, detail: result.detail, tone: 'critical' });
            } else if (announce) {
              notify({ message: result.detail, tone: 'positive' });
            }
          },
        },
      );
    },
  };
}

export function useConfigure(deviceId: string): (change: TreadmillSettingsChange) => void {
  const { act } = useTreadmillAct(deviceId);
  return (change): void => {
    act({ action: 'configure', settings: change }, 'The setting could not be saved');
  };
}
