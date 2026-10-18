import { describe, expect, it } from 'vitest';
import { OFF_PRODUCT, candidateOf } from '../../src/foods/open-food-facts';

function candidate(product: Record<string, unknown>): ReturnType<typeof candidateOf> {
  return candidateOf(OFF_PRODUCT.parse({ code: '5000000000001', ...product }));
}

describe('candidateOf', () => {
  it('maps a product to a food per 100 g with its nutrients in grams', () => {
    const food = candidate({
      product_name: 'Rolled oats',
      brands: 'Acme',
      serving_size: '40 g',
      serving_quantity: '40',
      nutriments: {
        'energy-kcal_100g': 370,
        proteins_100g: 13.2,
        carbohydrates_100g: 60,
        fat_100g: 7,
        'saturated-fat_100g': 1.2,
        sugars_100g: 1,
        fiber_100g: 10,
        sodium_100g: 0.01,
      },
    });
    expect(food).toMatchObject({
      name: 'Rolled oats',
      brand: 'Acme',
      barcode: '5000000000001',
      kind: 'food',
      basis: { amount: 100, unit: 'g' },
      serving: { amount: 40, label: '40 g' },
      kcal: 370,
      grams: {
        protein: 13.2,
        totalCarbohydrate: 60,
        totalFat: 7,
        saturatedFat: 1.2,
        sugar: 1,
        dietaryFiber: 10,
        sodium: 0.01,
      },
    });
  });

  it('works out kilocalories from kilojoules when the product lists only those', () => {
    expect(candidate({ product_name: 'Bar', nutriments: { 'energy-kj_100g': 1000 } })?.kcal).toBe(
      239,
    );
    expect(
      candidate({
        product_name: 'Bar',
        nutriments: { 'energy-kj_100g': 1000, 'energy-kcal_100g': 250 },
      })?.kcal,
    ).toBe(250);
    expect(candidate({ product_name: 'Bar', nutriments: {} })?.kcal).toBeNull();
  });

  it('skips nutrient values that are negative, not numbers, or missing', () => {
    const food = candidate({
      product_name: 'Odd',
      nutriments: {
        proteins_100g: -1,
        fat_100g: 'lots',
        sugars_100g: '3.5',
        fiber_100g: null,
      },
    });
    expect(food?.grams).toEqual({ sugar: 3.5 });
  });

  it('treats a product sold in millilitres or listed as a beverage as a drink per 100 ml', () => {
    expect(candidate({ product_name: 'Juice', product_quantity_unit: 'ml' })).toMatchObject({
      kind: 'drink',
      basis: { amount: 100, unit: 'ml' },
    });
    expect(candidate({ product_name: 'Tea', categories_tags: ['en:beverages'] })).toMatchObject({
      kind: 'drink',
      basis: { unit: 'ml' },
    });
  });

  it('gives a drink less water when it is alcoholic', () => {
    const plain = candidate({ product_name: 'Water', categories_tags: ['en:beverages'] });
    const beer = candidate({
      product_name: 'Beer',
      categories_tags: ['en:beverages', 'en:alcoholic-beverages'],
    });
    expect(plain?.water_percent).toBeGreaterThan(beer?.water_percent ?? 100);
  });

  it('names a product by its name, else its generic name, else its brand', () => {
    expect(candidate({ product_name: 'A', generic_name: 'B', brands: 'C' })?.name).toBe('A');
    expect(candidate({ product_name: '', generic_name: 'B', brands: 'C' })?.name).toBe('B');
    expect(candidate({ generic_name: ' ', brands: 'C' })?.name).toBe('C');
    expect(candidate({ product_name: ['Oat', 'Milk'] })?.name).toBe('Oat, Milk');
    expect(candidate({ product_name: 'x'.repeat(300) })?.name).toHaveLength(120);
  });

  it('leaves the brand out when it only repeats the name', () => {
    expect(candidate({ product_name: 'Acme', brands: 'Acme' })?.brand).toBeNull();
    expect(candidate({ product_name: 'Oats' })?.brand).toBeNull();
  });

  it('gives a serving only for a sensible quantity and labels an unlabelled one', () => {
    expect(candidate({ product_name: 'A', serving_quantity: 30 })?.serving).toEqual({
      amount: 30,
      label: '1 serving',
    });
    for (const quantity of [0, -5, 10_001, 'abc']) {
      expect(candidate({ product_name: 'A', serving_quantity: quantity })?.serving).toBeNull();
    }
    expect(candidate({ product_name: 'A' })?.serving).toBeNull();
  });

  it('drops a product with no name or with a code that is not a barcode', () => {
    expect(candidate({})).toBeNull();
    expect(candidate({ product_name: 'A', code: '123' })).toBeNull();
    expect(candidate({ product_name: 'A', code: '12345678901234567' })).toBeNull();
    expect(candidate({ product_name: 'A', code: '5000A00000001' })).toBeNull();
    expect(candidate({ product_name: 'A', code: '12345678' })).not.toBeNull();
  });
});
