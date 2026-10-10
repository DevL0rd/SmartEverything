import { z } from 'zod';
import { ACCENTS } from './client-prefs';
import { FITNESS_GOALS, MAX_HEART_RATE } from './fitness-settings';

export const PROFILE_NAME = z.string().trim().min(1).max(40);

export const SEXES = ['female', 'male'] as const;

export type Sex = (typeof SEXES)[number];

export const HEIGHT_LIMITS = { min: 100, max: 250 } as const;

export const HEIGHT_CM = z.int().min(HEIGHT_LIMITS.min).max(HEIGHT_LIMITS.max);

export const SCALE_USER = z.int().min(0).max(255);

const DAY = z.iso.date();
const MOMENT = z.iso.datetime({ offset: true });

export const PROFILE_ROW = z.strictObject({
  id: z.uuid(),
  name: PROFILE_NAME,
  colour: z.enum(ACCENTS),
  sex: z.enum(SEXES).nullable(),
  birth_date: DAY.nullable(),
  height_cm: HEIGHT_CM.nullable(),
  scale_user: SCALE_USER.nullable(),
  fitness_goals: FITNESS_GOALS,
  max_heart_rate: MAX_HEART_RATE.nullable(),
  position: z.int().min(0),
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type ProfileRow = z.infer<typeof PROFILE_ROW>;

export const FIRST_PROFILE_NAME = 'Me';

const PROFILE_FIELDS = {
  name: PROFILE_NAME,
  colour: z.enum(ACCENTS),
  sex: z.enum(SEXES).nullable(),
  birth_date: DAY.nullable(),
  height_cm: HEIGHT_CM.nullable(),
  scale_user: SCALE_USER.nullable(),
};

export const NEW_PROFILE = z.strictObject(PROFILE_FIELDS).partial().required({ name: true });

export type NewProfile = z.infer<typeof NEW_PROFILE>;

export const PROFILE_CHANGE = z
  .strictObject(PROFILE_FIELDS)
  .partial()
  .refine((change) => Object.keys(change).length > 0, {
    message: 'name at least one field to change',
  });

export type ProfileChange = z.infer<typeof PROFILE_CHANGE>;

export interface BodyFacts {
  readonly sex: Sex;
  readonly age: number;
  readonly heightCm: number;
}

function wholeYears(birthDate: string, on: Date): number {
  const born = new Date(`${birthDate}T00:00:00Z`);
  const years = on.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < born.getUTCMonth() ||
    (on.getUTCMonth() === born.getUTCMonth() && on.getUTCDate() < born.getUTCDate());
  return beforeBirthday ? years - 1 : years;
}

export function bodyFactsOf(
  profile: Pick<ProfileRow, 'sex' | 'birth_date' | 'height_cm'>,
  on: Date,
): BodyFacts | null {
  if (profile.sex === null || profile.birth_date === null || profile.height_cm === null) {
    return null;
  }
  return {
    sex: profile.sex,
    age: wholeYears(profile.birth_date, on),
    heightCm: profile.height_cm,
  };
}

export function missingBodyFacts(
  profile: Pick<ProfileRow, 'sex' | 'birth_date' | 'height_cm'>,
): boolean {
  return profile.sex === null || profile.birth_date === null || profile.height_cm === null;
}

export const PROFILE_DETAILS_PUSH_DATA = z.strictObject({
  kind: z.literal('profile_details'),
  profileId: z.uuid(),
});

export type ProfileDetailsPushData = z.infer<typeof PROFILE_DETAILS_PUSH_DATA>;

export function profileDetailsPush(profile: Pick<ProfileRow, 'id' | 'name'>): {
  readonly title: string;
  readonly body: string;
  readonly data: ProfileDetailsPushData;
} {
  return {
    title: 'See your body composition',
    body: `Add ${profile.name === 'Me' ? 'your' : `${profile.name}’s`} height, birthday and sex to get body fat, muscle and more.`,
    data: { kind: 'profile_details', profileId: profile.id },
  };
}

export function fitnessReady(
  profile: Pick<ProfileRow, 'sex' | 'birth_date' | 'height_cm'>,
): boolean {
  return !missingBodyFacts(profile);
}
