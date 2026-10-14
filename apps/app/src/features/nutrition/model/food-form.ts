import {
  NEW_FOOD,
  defaultWaterPercent,
  type FoodChange,
  type FoodKind,
  type FoodRow,
  type NewFood,
  type Nutrient,
  type PortionUnit,
} from '@smarteverything/domain';

export interface NutrientField {
  readonly nutrient: Nutrient;
  readonly label: string;
  readonly unit: 'g' | 'mg';
  readonly main: boolean;
}

export const NUTRIENT_FIELDS: readonly NutrientField[] = [
  { nutrient: 'protein', label: 'Protein', unit: 'g', main: true },
  { nutrient: 'totalCarbohydrate', label: 'Carbs', unit: 'g', main: true },
  { nutrient: 'totalFat', label: 'Fat', unit: 'g', main: true },
  { nutrient: 'sugar', label: 'Sugar', unit: 'g', main: false },
  { nutrient: 'dietaryFiber', label: 'Fibre', unit: 'g', main: false },
  { nutrient: 'saturatedFat', label: 'Saturated fat', unit: 'g', main: false },
  { nutrient: 'sodium', label: 'Sodium', unit: 'mg', main: false },
  { nutrient: 'caffeine', label: 'Caffeine', unit: 'mg', main: false },
];

export interface FoodForm {
  readonly name: string;
  readonly brand: string;
  readonly barcode: string;
  readonly kind: FoodKind;
  readonly basisAmount: string;
  readonly unit: PortionUnit;
  readonly servingAmount: string;
  readonly servingLabel: string;
  readonly kcal: string;
  readonly nutrients: Readonly<Partial<Record<Nutrient, string>>>;
  readonly waterPercent: number;
  readonly favourite: boolean;
}

function shown(value: number | null | undefined, scale = 1): string {
  return value === null || value === undefined ? '' : String(Math.round(value * scale * 100) / 100);
}

export function blankForm(name: string, barcode: string): FoodForm {
  return {
    name,
    brand: '',
    barcode,
    kind: 'food',
    basisAmount: '100',
    unit: 'g',
    servingAmount: '',
    servingLabel: '',
    kcal: '',
    nutrients: {},
    waterPercent: 0,
    favourite: false,
  };
}

export function formOf(food: FoodRow): FoodForm {
  const nutrients: Partial<Record<Nutrient, string>> = {};
  for (const field of NUTRIENT_FIELDS) {
    nutrients[field.nutrient] = shown(food.grams[field.nutrient], field.unit === 'mg' ? 1000 : 1);
  }
  return {
    name: food.name,
    brand: food.brand ?? '',
    barcode: food.barcode ?? '',
    kind: food.kind,
    basisAmount: String(food.basis.amount),
    unit: food.basis.unit,
    servingAmount: food.serving === null ? '' : String(food.serving.amount),
    servingLabel: food.serving?.label ?? '',
    kcal: shown(food.kcal),
    nutrients,
    waterPercent: food.water_percent,
    favourite: food.favourite,
  };
}

export function withKind(form: FoodForm, kind: FoodKind): FoodForm {
  return {
    ...form,
    kind,
    unit: kind === 'drink' ? 'ml' : 'g',
    waterPercent: defaultWaterPercent(kind, false),
  };
}

function number(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? null : Number(trimmed);
}

function gramsOf(form: FoodForm): Partial<Record<Nutrient, number | null>> {
  const grams: Partial<Record<Nutrient, number | null>> = {};
  for (const field of NUTRIENT_FIELDS) {
    const value = number(form.nutrients[field.nutrient] ?? '');
    if (value !== null) {
      grams[field.nutrient] = field.unit === 'mg' ? value / 1000 : value;
    }
  }
  return grams;
}

const PROBLEM_TEXT: Readonly<Record<string, string>> = {
  name: 'Give it a name',
  brand: 'Keep the brand under 120 characters',
  barcode: 'A barcode has 8 to 14 digits',
  basis: 'Enter how much these facts are for',
  serving: 'Enter a serving size in numbers',
  kcal: 'Enter the calories as a number',
  grams: 'Use numbers only',
};

export type FoodCheck =
  | { readonly ok: true; readonly food: NewFood }
  | { readonly ok: false; readonly problems: ReadonlyMap<string, string> };

export function checkForm(form: FoodForm, origin: NewFood['origin']): FoodCheck {
  const servingAmount = number(form.servingAmount);
  const parsed = NEW_FOOD.safeParse({
    name: form.name,
    brand: form.brand.trim() === '' ? null : form.brand,
    barcode: form.barcode.trim() === '' ? null : form.barcode.trim(),
    kind: form.kind,
    basis: { amount: number(form.basisAmount), unit: form.unit },
    serving:
      servingAmount === null
        ? null
        : {
            amount: servingAmount,
            label:
              form.servingLabel.trim() === ''
                ? `${form.servingAmount} ${form.unit}`
                : form.servingLabel,
          },
    kcal: number(form.kcal),
    grams: gramsOf(form),
    water_percent: form.waterPercent,
    origin,
    favourite: form.favourite,
  });
  const problems = new Map<string, string>(
    parsed.success
      ? []
      : parsed.error.issues.map((issue) => [
          String(issue.path[0]),
          PROBLEM_TEXT[String(issue.path[0])] ?? 'Check this value',
        ]),
  );
  if (number(form.kcal) === null) {
    problems.set('kcal', 'Enter the calories');
  }
  return parsed.success && problems.size === 0
    ? { ok: true, food: parsed.data }
    : { ok: false, problems };
}

export function changeOf(food: NewFood): FoodChange {
  return {
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    kind: food.kind,
    basis: food.basis,
    serving: food.serving,
    kcal: food.kcal,
    grams: food.grams,
    water_percent: food.water_percent,
    favourite: food.favourite,
  };
}
