import type { NewFood } from '@smarteverything/domain';

interface FoodSpec {
  readonly name: string;
  readonly kind: 'food' | 'drink';
  readonly unit: 'g' | 'ml';
  readonly kcal: number;
  readonly grams: NewFood['grams'];
  readonly water: number;
  readonly serving: NewFood['serving'];
}

const SPECS: readonly FoodSpec[] = [
  {
    name: 'Oatmeal',
    kind: 'food',
    unit: 'g',
    kcal: 380,
    grams: { protein: 13, totalCarbohydrate: 67, totalFat: 7, dietaryFiber: 10 },
    water: 40,
    serving: { amount: 50, label: 'bowl' },
  },
  {
    name: 'Whole milk',
    kind: 'drink',
    unit: 'ml',
    kcal: 61,
    grams: { protein: 3.2, totalCarbohydrate: 4.8, totalFat: 3.3 },
    water: 87,
    serving: { amount: 250, label: 'glass' },
  },
  {
    name: 'Banana',
    kind: 'food',
    unit: 'g',
    kcal: 89,
    grams: { protein: 1.1, totalCarbohydrate: 23, totalFat: 0.3, dietaryFiber: 2.6 },
    water: 75,
    serving: { amount: 118, label: 'medium' },
  },
  {
    name: 'Chicken breast',
    kind: 'food',
    unit: 'g',
    kcal: 165,
    grams: { protein: 31, totalCarbohydrate: 0, totalFat: 3.6 },
    water: 65,
    serving: null,
  },
  {
    name: 'Brown rice',
    kind: 'food',
    unit: 'g',
    kcal: 112,
    grams: { protein: 2.3, totalCarbohydrate: 24, totalFat: 0.8, dietaryFiber: 1.8 },
    water: 70,
    serving: { amount: 150, label: 'cup' },
  },
  {
    name: 'Greek yoghurt',
    kind: 'food',
    unit: 'g',
    kcal: 97,
    grams: { protein: 9, totalCarbohydrate: 4, totalFat: 5 },
    water: 80,
    serving: { amount: 170, label: 'pot' },
  },
  {
    name: 'Salmon fillet',
    kind: 'food',
    unit: 'g',
    kcal: 208,
    grams: { protein: 20, totalCarbohydrate: 0, totalFat: 13 },
    water: 64,
    serving: null,
  },
  {
    name: 'Mixed salad',
    kind: 'food',
    unit: 'g',
    kcal: 20,
    grams: { protein: 1.4, totalCarbohydrate: 3.3, totalFat: 0.2, dietaryFiber: 1.8 },
    water: 94,
    serving: { amount: 120, label: 'bowl' },
  },
  {
    name: 'Wholegrain bread',
    kind: 'food',
    unit: 'g',
    kcal: 247,
    grams: { protein: 13, totalCarbohydrate: 41, totalFat: 3.4, dietaryFiber: 7 },
    water: 38,
    serving: { amount: 40, label: 'slice' },
  },
  {
    name: 'Orange juice',
    kind: 'drink',
    unit: 'ml',
    kcal: 45,
    grams: { protein: 0.7, totalCarbohydrate: 10, totalFat: 0.2 },
    water: 88,
    serving: { amount: 200, label: 'glass' },
  },
  {
    name: 'Almonds',
    kind: 'food',
    unit: 'g',
    kcal: 579,
    grams: { protein: 21, totalCarbohydrate: 22, totalFat: 50, dietaryFiber: 12 },
    water: 5,
    serving: { amount: 28, label: 'handful' },
  },
  {
    name: 'Espresso',
    kind: 'drink',
    unit: 'ml',
    kcal: 2,
    grams: { protein: 0.1, totalCarbohydrate: 0, totalFat: 0, caffeine: 0.2 },
    water: 99,
    serving: { amount: 30, label: 'shot' },
  },
];

function newFood(spec: FoodSpec): NewFood {
  return {
    name: spec.name,
    brand: null,
    barcode: null,
    kind: spec.kind,
    basis: { amount: 100, unit: spec.unit },
    serving: spec.serving,
    kcal: spec.kcal,
    grams: spec.grams,
    water_percent: spec.water,
    origin: 'custom',
    favourite: false,
  };
}

export const FOODS: readonly NewFood[] = SPECS.map(newFood);
