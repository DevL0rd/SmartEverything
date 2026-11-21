import type {
  PlannerBedtime,
  PlannerPreferences,
  PlannerSleep,
  PlannerSleepSounds,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  addPlannerEventListener,
  plannerLinked,
  sleepSoundState,
  startSleepSound,
  stopSleepSound,
  type SleepSoundState,
} from '../../../../modules/health-connect';
import { playPlannerSleepSound, readPlannerSleep } from '../../../api/planner';
import { ValueStore, useValue } from '../../../design/external-store';
import { PLANNER_PREFIX } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useSession } from '../../../store/selectors';
import { apiPerson, usePlannerPreferences, type PlannerPerson, useSavePrefs } from '../../planner';
import type { SleepPlayer } from './sleep-sound-model';
import type { SleepWindow } from './sleep-chart-model';

export function sleepKey(person: PlannerPerson, window: SleepWindow): readonly unknown[] {
  return [...PLANNER_PREFIX, 'sleep', person, window.from, window.to];
}

export function useSleepNights(
  person: PlannerPerson,
  window: SleepWindow,
): UseQueryResult<PlannerSleep> {
  return useScreenQuery({
    queryKey: sleepKey(person, window),
    queryFn: ({ signal }) => readPlannerSleep(apiPerson(person), window.from, window.to, signal),
  });
}

export function useBedtimePrefs(): UseQueryResult<PlannerPreferences> {
  return usePlannerPreferences(null);
}

export interface BedtimeSaves {
  readonly bedtime: (edit: (bedtime: PlannerBedtime) => PlannerBedtime) => void;
  readonly sleepSounds: (edit: (sounds: PlannerSleepSounds) => PlannerSleepSounds) => void;
}

export function useBedtimeSaves(): BedtimeSaves {
  const saveBedtime = useSavePrefs('Bedtime');
  const saveSounds = useSavePrefs('Sleep sounds');
  return {
    bedtime: (edit): void => {
      saveBedtime((prefs) => ({ bedtime: edit(prefs.bedtime) }));
    },
    sleepSounds: (edit): void => {
      saveSounds((prefs) => ({ sleep_sounds: edit(prefs.sleep_sounds) }));
    },
  };
}

export const nativeSleepPlayer: SleepPlayer = {
  linked: plannerLinked,
  start: startSleepSound,
  stop: stopSleepSound,
};

const live = new ValueStore<SleepSoundState | null>(null);

function refreshSleepState(): void {
  background(
    sleepSoundState().then((state) => {
      live.set(state);
    }),
    'planner.sleep_sound_state_failed',
  );
}

export function useSleepSoundLive(): SleepSoundState | null {
  useEffect(() => {
    if (!plannerLinked()) return undefined;
    refreshSleepState();
    const subscription = addPlannerEventListener((event) => {
      if (event.event !== 'sleep_sound') return;
      live.set({
        playing: event.state === 'playing',
        title: event.title ?? null,
        endsAt: event.endsAt ?? null,
      });
    });
    return (): void => {
      subscription.remove();
    };
  }, []);
  return useValue(live);
}

export interface SleepSoundControl {
  readonly here: boolean;
  readonly play: (sounds: PlannerSleepSounds) => Promise<void>;
  readonly stop: () => Promise<void>;
}

export function useSleepSoundControl(): SleepSoundControl {
  const clientId = useSession().client.id;
  const target = plannerLinked() ? { clientId } : {};
  return {
    here: 'clientId' in target,
    play: async (sounds): Promise<void> => {
      if (sounds.sound === null) return;
      await playPlannerSleepSound(apiPerson(null), {
        action: 'play',
        sound: sounds.sound,
        timer_minutes: sounds.timer_minutes,
        fade_seconds: sounds.fade_seconds,
        ...target,
      });
    },
    stop: async (): Promise<void> => {
      await playPlannerSleepSound(apiPerson(null), { action: 'stop', ...target });
    },
  };
}
