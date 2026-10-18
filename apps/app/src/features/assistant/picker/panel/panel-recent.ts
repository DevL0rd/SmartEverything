import { CLIENT_PREFS, type Engine } from '@smarteverything/domain';
import { notify } from '../../../../components/toast-store';
import { usePref } from '../../../../store/prefs';
import { isComputerEngine, nativeModelKey } from '../../provider/computer-engine';
import type { NativeModelRequest } from '../../provider/subscription-models';
import type { ModelPick } from '../model-choice';

export const RECENT_MAX = 5;

function idOf(engine: Engine | undefined, model: string): string {
  return engine !== undefined && isComputerEngine(engine)
    ? nativeModelKey(engine.kind, model)
    : model;
}

export function recentIdOfEngine(engine: Engine): string | null {
  return engine.model === null ? null : idOf(engine, engine.model);
}

export function recentIdOf(pick: ModelPick): string {
  return idOf(pick.engine, pick.model);
}

export function recentIdOfNative(request: NativeModelRequest): string {
  return nativeModelKey(request.runtime, request.model);
}

export function withRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((entry) => entry !== id)].slice(0, RECENT_MAX);
}

export interface RecentModels {
  readonly ids: readonly string[];
  readonly record: (id: string) => void;
}

export function useRecentModels(): RecentModels {
  const pref = usePref(CLIENT_PREFS.ai_models);
  if (pref.status === 'invalid') {
    return {
      ids: [],
      record: (): void => {
        notify({
          message: pref.reason,
          tone: 'critical',
          action: { label: 'Reset', onPress: pref.reset },
        });
      },
    };
  }
  return {
    ids: pref.value.recent,
    record: (id): void => {
      pref.set({ ...pref.value, recent: withRecent(pref.value.recent, id) });
    },
  };
}
