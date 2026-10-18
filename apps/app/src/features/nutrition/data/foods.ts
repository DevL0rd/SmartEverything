import { type UseQueryResult } from '@tanstack/react-query';
import { BARCODE, type FoodCandidate, type FoodRow } from '@smarteverything/domain';
import { readFoods, searchProducts } from '../../../api/nutrition';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { FOODS_KEY, foodSearchKey } from '../../../queries/health-entries';
import { useScreenQuery } from '../../../queries/use-screen-query';

const SEARCH_PAUSE_MS = 700;
const SEARCH_MIN = 3;

export function useFoods(): UseQueryResult<FoodRow[]> {
  return useScreenQuery({ queryKey: FOODS_KEY, queryFn: readFoods });
}

export function isBarcode(query: string): boolean {
  return BARCODE.safeParse(query.trim()).success;
}

export function useProductSearch(query: string): {
  readonly result: UseQueryResult<FoodCandidate[]>;
  readonly active: boolean;
} {
  const settled = useDebouncedValue(query.trim().toLowerCase(), SEARCH_PAUSE_MS);
  const active = settled.length >= SEARCH_MIN && !isBarcode(settled);
  const result = useScreenQuery({
    queryKey: foodSearchKey(settled),
    queryFn: () => searchProducts(settled),
    enabled: active,
    staleTime: Infinity,
    retry: false,
  });
  return { result, active };
}

export function matchesFood(food: Pick<FoodRow, 'name' | 'brand'>, query: string): boolean {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '');
  const text = `${food.name} ${food.brand ?? ''}`.toLowerCase();
  return words.every((word) => text.includes(word));
}
