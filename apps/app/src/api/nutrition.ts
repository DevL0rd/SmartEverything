import {
  API_ENDPOINTS as E,
  type FoodCandidate,
  type FoodChange,
  type FoodRow,
  type HealthEntryInput,
  type HealthEntryRow,
  type LoggableType,
  type NewFood,
} from '@smarteverything/domain';
import { api } from './transport';

export function readEntries(
  from: number,
  to: number,
  types: readonly LoggableType[],
): Promise<HealthEntryRow[]> {
  return api().call(E.readHealthEntries, {
    query: {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      ...(types.length === 0 ? {} : { types: [...types] }),
    },
  });
}

export function createEntry(entry: HealthEntryInput): Promise<HealthEntryRow> {
  return api().call(E.createHealthEntry, { body: entry });
}

export function updateEntry(entryId: string, entry: HealthEntryInput): Promise<HealthEntryRow> {
  return api().call(E.updateHealthEntry, { params: { entryId }, body: entry });
}

export function retryEntry(entryId: string): Promise<HealthEntryRow> {
  return api().call(E.retryHealthEntry, { params: { entryId } });
}

export async function deleteEntry(entryId: string): Promise<void> {
  await api().call(E.deleteHealthEntry, { params: { entryId } });
}

export function readFoods(): Promise<FoodRow[]> {
  return api().call(E.listFoods, {});
}

export function saveFood(food: NewFood): Promise<FoodRow> {
  return api().call(E.createFood, { body: food });
}

export function changeFood(foodId: string, change: FoodChange): Promise<FoodRow> {
  return api().call(E.updateFood, { params: { foodId }, body: change });
}

export async function forgetFood(foodId: string): Promise<void> {
  await api().call(E.deleteFood, { params: { foodId } });
}

export function lookupBarcode(barcode: string): Promise<FoodCandidate> {
  return api().call(E.lookupFood, { query: { barcode } });
}

export async function searchProducts(query: string): Promise<FoodCandidate[]> {
  const answer = await api().call(E.searchFoods, { query: { q: query } });
  return answer.products;
}
