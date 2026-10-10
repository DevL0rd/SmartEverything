import {
  FOOD_CANDIDATE,
  defaultWaterPercent,
  type FoodCandidate,
  type Nutrient,
  type NutrientGrams,
} from '@smarteverything/domain';
import { z } from 'zod';

const NUMBER = z.union([z.number(), z.string()]).transform((value) => Number(value));

const TEXT = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value.join(', ') : value).trim());

export const OFF_PRODUCT = z.object({
  code: z.string(),
  product_name: TEXT.optional(),
  generic_name: TEXT.optional(),
  brands: TEXT.optional(),
  serving_size: z.string().optional(),
  serving_quantity: NUMBER.optional(),
  product_quantity_unit: z.string().optional(),
  categories_tags: z.array(z.string()).optional(),
  nutriments: z.record(z.string(), z.unknown()).optional(),
});

export type OffProduct = z.infer<typeof OFF_PRODUCT>;

export const OFF_FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'serving_size',
  'serving_quantity',
  'product_quantity_unit',
  'categories_tags',
  'nutriments',
].join(',');

const NUTRIENT_FIELDS: readonly (readonly [string, Nutrient])[] = [
  ['proteins', 'protein'],
  ['carbohydrates', 'totalCarbohydrate'],
  ['fat', 'totalFat'],
  ['saturated-fat', 'saturatedFat'],
  ['trans-fat', 'transFat'],
  ['monounsaturated-fat', 'monounsaturatedFat'],
  ['polyunsaturated-fat', 'polyunsaturatedFat'],
  ['sugars', 'sugar'],
  ['fiber', 'dietaryFiber'],
  ['sodium', 'sodium'],
  ['cholesterol', 'cholesterol'],
  ['caffeine', 'caffeine'],
  ['calcium', 'calcium'],
  ['iron', 'iron'],
  ['potassium', 'potassium'],
  ['magnesium', 'magnesium'],
  ['zinc', 'zinc'],
  ['vitamin-a', 'vitaminA'],
  ['vitamin-c', 'vitaminC'],
  ['vitamin-d', 'vitaminD'],
];

const KJ_PER_KCAL = 4.184;

function amountOf(nutriments: Readonly<Record<string, unknown>>, field: string): number | null {
  const parsed = NUMBER.safeParse(nutriments[`${field}_100g`]);
  return parsed.success && Number.isFinite(parsed.data) && parsed.data >= 0 ? parsed.data : null;
}

function kcalOf(nutriments: Readonly<Record<string, unknown>>): number | null {
  const kcal = amountOf(nutriments, 'energy-kcal');
  if (kcal !== null) {
    return kcal;
  }
  const kj = amountOf(nutriments, 'energy-kj');
  return kj === null ? null : Math.round((kj / KJ_PER_KCAL) * 10) / 10;
}

function gramsOf(nutriments: Readonly<Record<string, unknown>>): NutrientGrams {
  const grams: NutrientGrams = {};
  for (const [field, nutrient] of NUTRIENT_FIELDS) {
    const amount = amountOf(nutriments, field);
    if (amount !== null) {
      grams[nutrient] = amount;
    }
  }
  return grams;
}

function nameOf(product: OffProduct): string | null {
  const name = [product.product_name, product.generic_name, product.brands].find(
    (text) => text !== undefined && text !== '',
  );
  return name === undefined ? null : name.slice(0, 120);
}

function servingOf(product: OffProduct): FoodCandidate['serving'] {
  const amount = product.serving_quantity;
  if (amount === undefined || !Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
    return null;
  }
  const label = (product.serving_size ?? '').trim();
  return { amount, label: label === '' ? '1 serving' : label.slice(0, 60) };
}

function brandOf(product: OffProduct, name: string): string | null {
  const brand = product.brands ?? '';
  return brand === '' || brand === name ? null : brand.slice(0, 120);
}

function isLiquid(product: OffProduct, categories: readonly string[]): boolean {
  return (
    product.product_quantity_unit?.toLowerCase() === 'ml' || categories.includes('en:beverages')
  );
}

export function candidateOf(product: OffProduct): FoodCandidate | null {
  const name = nameOf(product);
  if (name === null || !/^[0-9]{8,14}$/.test(product.code)) {
    return null;
  }
  const categories = product.categories_tags ?? [];
  const liquid = isLiquid(product, categories);
  const kind = liquid ? 'drink' : 'food';
  const nutriments = product.nutriments ?? {};
  return FOOD_CANDIDATE.parse({
    name,
    brand: brandOf(product, name),
    barcode: product.code,
    kind,
    basis: { amount: 100, unit: liquid ? 'ml' : 'g' },
    serving: servingOf(product),
    kcal: kcalOf(nutriments),
    grams: gramsOf(nutriments),
    water_percent: defaultWaterPercent(kind, categories.includes('en:alcoholic-beverages')),
  });
}
