import { useEffect } from 'react';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import { bodyFactsOf, effectiveFitnessGoals, type ProfileRow } from '@smarteverything/domain';
import { setWatchUser, type WatchUserInput } from '../../../modules/health-connect';
import { rawErrorText } from '../../format/errors';
import { useActiveProfile, useBodyReadings } from '../../store/people';

const log = new Logger('app.watch');

function maxHeartRateOf(profile: ProfileRow, age: number): number {
  if (profile.max_heart_rate !== null) {
    return profile.max_heart_rate;
  }
  return Math.round(age <= 40 ? 220 - age : 207 - 0.7 * age);
}

function userOf(profile: ProfileRow, weightKg: number | null): WatchUserInput | null {
  const facts = bodyFactsOf(profile, new Date());
  if (facts === null || weightKg === null || profile.birth_date === null) {
    return null;
  }
  const goals = effectiveFitnessGoals(profile.fitness_goals);
  return {
    heightCm: facts.heightCm,
    weightKg,
    birthDate: profile.birth_date,
    female: facts.sex === 'female',
    maxHeartRate: maxHeartRateOf(profile, facts.age),
    stepGoal: goals.steps,
    calorieGoal: goals.move_kcal,
    activeMinutes: goals.active_minutes,
  };
}

function send(user: WatchUserInput): void {
  setWatchUser(user).then(
    (sent) => {
      log.info('watch.user_sent', { watches: sent });
    },
    (error: unknown) => {
      log.warn('watch.user_not_sent', { reason: rawErrorText(error) });
    },
  );
}

export function useWatchUserSync(enabled: boolean): void {
  const profile = useActiveProfile();
  const weightKg = useBodyReadings(profile?.id ?? null)[0]?.weight_kg ?? null;
  const user = profile === null ? null : userOf(profile, weightKg);
  const key = user === null ? null : JSON.stringify(user);
  const known = profile !== null;
  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (key === null) {
      if (known) {
        log.info('watch.user_not_sent', {
          reason:
            'height, birth date, sex and a weigh-in are needed for the watch’s calorie and heart-rate maths',
        });
      }
      return;
    }
    send(WATCH_USER.parse(JSON.parse(key)));
  }, [enabled, key, known]);
}

const WATCH_USER = z.strictObject({
  heightCm: z.int(),
  weightKg: z.number(),
  birthDate: z.string(),
  female: z.boolean(),
  maxHeartRate: z.int(),
  stepGoal: z.int(),
  calorieGoal: z.int(),
  activeMinutes: z.int(),
});
