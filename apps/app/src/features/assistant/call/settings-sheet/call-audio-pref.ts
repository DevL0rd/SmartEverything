import {
  CALL_AUDIO_PREF,
  DEFAULT_PAUSE_MS,
  callAudioWith,
  type CallAudio,
  type CallAudioPref,
  type PauseChoiceMs,
} from '@smarteverything/domain';
import { PREFS, savePref, usePref } from '../../../../store/prefs';
import { useEntityStore, useStoreSelector } from '../../../../store/store-context';
import type { StoreState } from '../../../../store/state';
import type { EntityStore } from '../../../../store/entity-store';
import { noteApplied } from '../applied-note';

export function storedCallAudioOf(state: StoreState): CallAudioPref {
  const read = PREFS.callAudio.decode(
    state.tables.layouts.byId[PREFS.callAudio.storageKey]?.layout ?? null,
  );
  return read.status === 'invalid' ? PREFS.callAudio.defaultValue : read.value;
}

export function pauseOf(state: StoreState): PauseChoiceMs {
  return state.settings?.end_of_speech_pause_ms ?? DEFAULT_PAUSE_MS;
}

export function callAudioOf(state: StoreState): CallAudio {
  return callAudioWith(storedCallAudioOf(state), pauseOf(state));
}

export function saveCallAudio(
  store: EntityStore,
  change: Partial<CallAudioPref>,
  applied: string | null,
): void {
  const next = CALL_AUDIO_PREF.parse({ ...storedCallAudioOf(store.get()), ...change });
  savePref(store, PREFS.callAudio, next);
  if (applied !== null) {
    noteApplied(applied);
  }
}

function resetCallAudio(store: EntityStore): void {
  savePref(store, PREFS.callAudio, PREFS.callAudio.defaultValue);
  noteApplied('Reset to defaults');
}

export interface CallAudioControl {
  readonly pref: CallAudio;
  readonly change: (change: Partial<CallAudioPref>, applied: string | null) => void;
  readonly reset: () => void;
}

export function useCallAudio(): CallAudioControl {
  const store = useEntityStore();
  const read = usePref(PREFS.callAudio);
  const pause = useStoreSelector(pauseOf);
  return {
    pref: callAudioWith(read.status === 'ready' ? read.value : PREFS.callAudio.defaultValue, pause),
    change: (change, applied): void => {
      saveCallAudio(store, change, applied);
    },
    reset: (): void => {
      resetCallAudio(store);
    },
  };
}
