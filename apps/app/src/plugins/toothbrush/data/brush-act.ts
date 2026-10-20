import type { BrushAction, BrushSettingsChange } from '@smarteverything/domain';
import { useQueryClient } from '@tanstack/react-query';
import { actOnBrush } from '../../../api/toothbrushes';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { brushPrefix } from './brush-keys';

export interface BrushActor {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly act: (action: BrushAction, failure: string, announce?: boolean) => void;
}

export function useBrushAct(deviceId: string): BrushActor {
  const client = useQueryClient();
  const { busy, problem, run } = useMutationState();
  return {
    busy,
    problem,
    act: (action, failure, announce = false): void => {
      run(
        async () => {
          const result = await actOnBrush(deviceId, action);
          await client.invalidateQueries({ queryKey: brushPrefix(deviceId) });
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

export function useConfigure(deviceId: string): (change: BrushSettingsChange) => void {
  const { act } = useBrushAct(deviceId);
  return (change): void => {
    act({ action: 'configure', settings: change }, 'The setting could not be saved');
  };
}
