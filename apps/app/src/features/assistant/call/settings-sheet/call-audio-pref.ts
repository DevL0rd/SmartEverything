import { CALL_AUDIO_PREF, type CallAudioPref } from '@smarteverything/domain';
import { PREFS, savePref, usePref } from '../../../../store/prefs';
import { useEntityStore } from '../../../../store/store-context';
import type { StoreState } from '../../../../store/state';
import type { EntityStore } from '../../../../store/entity-store';
import { noteApplied } from '../applied-note';

export function callAudioOf(state: StoreState): CallAudioPref {
  const read = PREFS.callAudio.decode(
    state.tables.layouts.byId[PREFS.callAudio.storageKey]?.layout ?? null,
  );
  return read.status === 'invalid' ? PREFS.callAudio.defaultValue : read.value;
}

export function saveCallAudio(
  store: EntityStore,
  change: Partial<CallAudioPref>,
  applied: string | null,
): void {
  const next = CALL_AUDIO_PREF.parse({ ...callAudioOf(store.get()), ...change });
  savePref(store, PREFS.callAudio, next);
  if (applied !== null) {
    noteApplied(applied);
  }
}

export function resetCallAudio(store: EntityStore): void {
  savePref(store, PREFS.callAudio, PREFS.callAudio.defaultValue);
  noteApplied('Reset to defaults');
}

export interface CallAudioControl {
  readonly pref: CallAudioPref;
  readonly change: (change: Partial<CallAudioPref>, applied: string | null) => void;
  readonly reset: () => void;
}

export function useCallAudio(): CallAudioControl {
  const store = useEntityStore();
  const read = usePref(PREFS.callAudio);
  return {
    pref: read.status === 'ready' ? read.value : PREFS.callAudio.defaultValue,
    change: (change, applied): void => {
      saveCallAudio(store, change, applied);
    },
    reset: (): void => {
      resetCallAudio(store);
    },
  };
}
