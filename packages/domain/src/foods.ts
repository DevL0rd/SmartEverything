import { z } from 'zod';
import { NUTRIENTS } from './health';
import { PORTION_UNITS, type PortionUnit } from './health-entries';

export const FOOD_KINDS = ['food', 'drink'] as const;

export type FoodKind = (typeof FOOD_KINDS)[number];

export const FOOD_ORIGINS = ['custom', 'open_food_facts'] as const;

export type FoodOrigin = (typeof FOOD_ORIGINS)[number];

export type Nutrient = (typeof NUTRIENTS)[number];

const AMOUNT = z.number().min(0).max(100_000);
const MOMENT = z.iso.datetime({ offset: true });
const ID = z.uuid();

export const NUTRIENT_GRAMS = z.partialRecord(z.enum(NUTRIENTS), AMOUNT);

export type NutrientGrams = z.infer<typeof NUTRIENT_GRAMS>;

export const BARCODE = z.string().regex(/^[0-9]{8,14}$/, '8 to 14 digits');

export const FOOD_BASIS = z.strictObject({
  amount: z.number().positive().max(10_000),
  unit: z.enum(PORTION_UNITS),
});

export type FoodBasis = z.infer<typeof FOOD_BASIS>;

export const FOOD_SERVING = z.strictObject({
  amount: z.number().positive().max(10_000),
  label: z.string().trim().min(1).max(60),
});

export type FoodServing = z.infer<typeof FOOD_SERVING>;

const FOOD_FIELDS = {
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().min(1).max(120).nullable(),
  barcode: BARCODE.nullable(),
  kind: z.enum(FOOD_KINDS),
  basis: FOOD_BASIS,
  serving: FOOD_SERVING.nullable(),
  kcal: AMOUNT.nullable(),
  grams: NUTRIENT_GRAMS,
  water_percent: z.int().min(0).max(100),
};

export const FOOD_CANDIDATE = z.strictObject(FOOD_FIELDS);

export type FoodCandidate = z.infer<typeof FOOD_CANDIDATE>;

export const NEW_FOOD = z.strictObject({
  ...FOOD_FIELDS,
  origin: z.enum(FOOD_ORIGINS),
  favourite: z.boolean(),
});

export type NewFood = z.infer<typeof NEW_FOOD>;

export const FOOD_CHANGE = NEW_FOOD.omit({ origin: true })
  .partial()
  .refine((change) => Object.keys(change).length > 0, {
    message: 'name at least one field to change',
  });

export type FoodChange = z.infer<typeof FOOD_CHANGE>;

export const FOOD_ROW = z.strictObject({
  id: ID,
  profile_id: ID,
  ...FOOD_FIELDS,
  origin: z.enum(FOOD_ORIGINS),
  favourite: z.boolean(),
  last_used_at: MOMENT.nullable(),
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type FoodRow = z.infer<typeof FOOD_ROW>;

export const FOOD_SEARCH = z.strictObject({
  products: z.array(FOOD_CANDIDATE),
});

export interface Portion {
  readonly kilocalories: number | null;
  readonly grams: NutrientGrams;
  readonly waterMl: number;
}

type FoodFacts = Pick<FoodCandidate, 'kind' | 'basis' | 'kcal' | 'grams' | 'water_percent'>;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function portionOf(food: FoodFacts, amount: number): Portion {
  const factor = amount / food.basis.amount;
  const grams: NutrientGrams = {};
  for (const nutrient of NUTRIENTS) {
    const per = food.grams[nutrient];
    if (per !== undefined) {
      grams[nutrient] = rounded(per * factor);
    }
  }
  return {
    kilocalories: food.kcal === null ? null : rounded(food.kcal * factor),
    grams,
    waterMl: waterMlOf(food, amount),
  };
}

export function waterMlOf(
  food: Pick<FoodFacts, 'kind' | 'basis' | 'water_percent'>,
  amount: number,
): number {
  return Math.round((amount * food.water_percent) / 100);
}

export function defaultWaterPercent(kind: FoodKind, alcoholic: boolean): number {
  return kind === 'drink' && !alcoholic ? 100 : 0;
}

export function unitLabel(unit: PortionUnit): string {
  return unit === 'ml' ? 'ml' : 'g';
}

const GOAL = (max: number): z.ZodNullable<z.ZodInt> => z.int().min(1).max(max).nullable();

export const NUTRITION_PREF = z.strictObject({
  energyKcal: GOAL(10_000),
  proteinG: GOAL(1000),
  carbohydrateG: GOAL(2000),
  fatG: GOAL(1000),
  glassMl: z.int().min(50).max(2000),
});

export type NutritionPref = z.infer<typeof NUTRITION_PREF>;

export const NUTRITION_GOAL_KEYS = ['energyKcal', 'proteinG', 'carbohydrateG', 'fatG'] as const;

export type NutritionGoalKey = (typeof NUTRITION_GOAL_KEYS)[number];

export interface NutritionGoalLimit {
  readonly label: string;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly suggested: number;
}

export const NUTRITION_GOAL_LIMITS: Readonly<Record<NutritionGoalKey, NutritionGoalLimit>> = {
  energyKcal: { label: 'Calories', unit: 'kcal', min: 800, max: 6000, step: 50, suggested: 2000 },
  proteinG: { label: 'Protein', unit: 'g', min: 10, max: 400, step: 5, suggested: 100 },
  carbohydrateG: { label: 'Carbs', unit: 'g', min: 10, max: 800, step: 5, suggested: 250 },
  fatG: { label: 'Fat', unit: 'g', min: 10, max: 300, step: 5, suggested: 70 },
};

export const GLASS_SIZES = [150, 200, 250, 300, 330, 400, 500] as const;
