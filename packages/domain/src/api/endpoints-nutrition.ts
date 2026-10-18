import { z } from 'zod';
import { BARCODE, FOOD_CANDIDATE, FOOD_CHANGE, FOOD_ROW, FOOD_SEARCH, NEW_FOOD } from '../foods';
import { HEALTH_ENTRY_INPUT, HEALTH_ENTRY_ROW, LOGGABLE_TYPE } from '../health-entries';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING, queryList } from './primitives';

const ENTRY_PARAMS = z.strictObject({ entryId: ID });
const FOOD_PARAMS = z.strictObject({ foodId: ID });

const ENTRY_ENDPOINTS = {
  readHealthEntries: endpoint({
    method: 'GET',
    path: '/api/health/entries',
    access: 'member',
    summary: 'What this profile logged in the app between two moments',
    params: NOTHING,
    query: z.strictObject({
      from: MOMENT,
      to: MOMENT,
      types: queryList(LOGGABLE_TYPE).optional(),
    }),
    body: NO_BODY,
    response: z.array(HEALTH_ENTRY_ROW),
  }),
  readHealthEntry: endpoint({
    method: 'GET',
    path: '/api/health/entries/:entryId',
    access: 'member',
    summary: 'One thing this profile logged in the app, by its id',
    params: ENTRY_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: HEALTH_ENTRY_ROW,
  }),
  createHealthEntry: endpoint({
    method: 'POST',
    path: '/api/health/entries',
    access: 'member',
    summary: 'Log a measurement, a session, a food or a drink for this profile',
    params: NOTHING,
    query: NOTHING,
    body: HEALTH_ENTRY_INPUT,
    response: HEALTH_ENTRY_ROW,
  }),
  updateHealthEntry: endpoint({
    method: 'PUT',
    path: '/api/health/entries/:entryId',
    access: 'member',
    summary: 'Replace something this profile logged; phones save the new version to Health Connect',
    params: ENTRY_PARAMS,
    query: NOTHING,
    body: HEALTH_ENTRY_INPUT,
    response: HEALTH_ENTRY_ROW,
  }),
  retryHealthEntry: endpoint({
    method: 'POST',
    path: '/api/health/entries/:entryId/retry',
    access: 'member',
    summary: 'Forget why an entry could not be saved to Health Connect so phones try again',
    params: ENTRY_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: HEALTH_ENTRY_ROW,
  }),
  deleteHealthEntry: endpoint({
    method: 'DELETE',
    path: '/api/health/entries/:entryId',
    access: 'member',
    summary: 'Delete something this profile logged, here and in Health Connect',
    params: ENTRY_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;

const FOOD_ENDPOINTS = {
  listFoods: endpoint({
    method: 'GET',
    path: '/api/foods',
    access: 'member',
    summary: 'This profile’s foods and drinks: their own, favourites and recently logged',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(FOOD_ROW),
  }),
  createFood: endpoint({
    method: 'POST',
    path: '/api/foods',
    access: 'member',
    summary: 'Save a food or drink for this profile',
    params: NOTHING,
    query: NOTHING,
    body: NEW_FOOD,
    response: FOOD_ROW,
  }),
  updateFood: endpoint({
    method: 'PATCH',
    path: '/api/foods/:foodId',
    access: 'member',
    summary: 'Change a saved food or drink',
    params: FOOD_PARAMS,
    query: NOTHING,
    body: FOOD_CHANGE,
    response: FOOD_ROW,
  }),
  deleteFood: endpoint({
    method: 'DELETE',
    path: '/api/foods/:foodId',
    access: 'member',
    summary: 'Forget a saved food or drink; what was logged stays',
    params: FOOD_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  lookupFood: endpoint({
    method: 'GET',
    path: '/api/foods/lookup',
    access: 'member',
    summary: 'A packaged product by its barcode, from Open Food Facts (cached by the hub)',
    params: NOTHING,
    query: z.strictObject({ barcode: BARCODE }),
    body: NO_BODY,
    response: FOOD_CANDIDATE,
  }),
  searchFoods: endpoint({
    method: 'GET',
    path: '/api/foods/search',
    access: 'member',
    summary: 'Packaged products matching a name, from Open Food Facts (cached by the hub)',
    params: NOTHING,
    query: z.strictObject({ q: z.string().trim().min(2).max(80) }),
    body: NO_BODY,
    response: FOOD_SEARCH,
  }),
} as const;

export const NUTRITION_AREA_ENDPOINTS = { ...ENTRY_ENDPOINTS, ...FOOD_ENDPOINTS } as const;
