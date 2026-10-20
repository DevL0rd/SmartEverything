import type { BottleAction, BottleUvStartBody } from '@smarteverything/domain';
import { useQueryClient } from '@tanstack/react-query';
import { actOnBottle, startBottleUv } from '../../../api/bottles';
import { notify } from '../../../components/toast-store';
import { useMutationState } from '../../../store/mutation';
import { bottlePrefix } from './bottle-keys';

interface BottleActor {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly act: (
    action: BottleAction,
    failure: string,
    announce?: boolean,
    onOk?: () => void,
  ) => void;
  readonly clean: (body: BottleUvStartBody) => void;
}

export function useBottleAct(deviceId: string): BottleActor {
  const client = useQueryClient();
  const { busy, problem, run } = useMutationState();
  return {
    busy,
    problem,
    act: (action, failure, announce = false, onOk): void => {
      run(
        async () => {
          const result = await actOnBottle(deviceId, action);
          await client.invalidateQueries({ queryKey: bottlePrefix(deviceId) });
          return result;
        },
        {
          failure,
          onDone: (result) => {
            if (!result.ok) {
              notify({ message: failure, detail: result.detail, tone: 'critical' });
            } else {
              if (announce) {
                notify({ message: result.detail, tone: 'positive' });
              }
              onOk?.();
            }
          },
        },
      );
    },
    clean: (body): void => {
      run(
        async () => {
          const result = await startBottleUv(deviceId, body);
          await client.invalidateQueries({ queryKey: bottlePrefix(deviceId) });
          return result;
        },
        {
          failure: 'The clean could not be started',
          onDone: (result) => {
            notify({
              message: result.ok ? result.detail : 'The clean could not be started',
              ...(result.ok ? {} : { detail: result.detail }),
              tone: result.ok ? 'positive' : 'critical',
            });
          },
        },
      );
    },
  };
}
