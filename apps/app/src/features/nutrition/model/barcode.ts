import type { FoodRow } from '@smarteverything/domain';

export function savedFoodByBarcode<Food extends Pick<FoodRow, 'barcode'>>(
  foods: readonly Food[],
  barcode: string,
): Food | null {
  return foods.find((food) => food.barcode === barcode) ?? null;
}
