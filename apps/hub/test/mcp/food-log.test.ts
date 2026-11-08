import { API_ENDPOINTS as E, HEALTH_ENTRY_INPUT, foodEntryOf } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootServer, verifiedPublicUrl, type Booted } from '../support/booted';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';
import { systemClock } from '../../src/clock';
import { callTool, type ToolResult } from './client';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;
let token: string;

const FOOD = {
  name: 'Fish congee',
  brand: null,
  barcode: null,
  kind: 'food',
  basis: { amount: 100, unit: 'g' },
  serving: { amount: 375, label: '1 portion (375 g)' },
  kcal: 69.3333,
  grams: { protein: 3.4667, totalCarbohydrate: 10.6667, totalFat: 1.3333 },
  water_percent: 0,
} as const;

const { water_percent: waterPercent, ...FOOD_FIELDS } = FOOD;
const EDITED_FOOD = { ...FOOD_FIELDS, waterPercent };

const AT = '2026-10-10T12:00:00.000Z';
const NOW = '2026-10-10T22:04:30.000Z';

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path, {
    clock: { ...systemClock, now: () => new Date(NOW) },
  });
  await verifiedPublicUrl(booted);
  const created = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/mcp/tokens',
    body: { name: 'ChatGPT' },
  });
  token = E.createMcpToken.response.parse(created.body).token;
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

function tool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return callTool(booted.base, token, name, args);
}

async function entries(): Promise<ReturnType<typeof E.readHealthEntries.response.parse>> {
  const reply = await call(booted.base, booted.owner, {
    method: 'GET',
    path: `/api/health/entries?from=${encodeURIComponent('2026-10-09T00:00:00.000Z')}&to=${encodeURIComponent('2026-10-12T00:00:00.000Z')}`,
  });
  return E.readHealthEntries.response.parse(reply.body);
}

async function energy(): Promise<number> {
  const reply = await call(booted.base, booted.owner, {
    method: 'GET',
    path: `/api/health/daily?from=2026-10-09&to=2026-10-12&metrics=energy_in,protein`,
  });
  const rows = E.readHealthDaily.response.parse(reply.body);
  return rows.filter((row) => row.metric === 'energy_in').reduce((sum, row) => sum + row.value, 0);
}

describe('food logged through the AI tool', () => {
  it('returns the saved label facts and corrects and removes a meal without creating another', async () => {
    const logged = await tool('food_log', {
      action: 'food',
      food: {
        name: 'Rice',
        kind: 'food',
        basis: { amount: 150, unit: 'g' },
        kcal: 270,
        grams: { protein: 3, dietaryFiber: 2 },
        water_percent: 65,
      },
      at: AT,
    });
    expect(logged.isError, JSON.stringify(logged.content)).toBe(false);
    const [row] = await entries();
    if (row === undefined) throw new Error('Expected a saved meal');
    expect(row.food?.waterMl).toBe(98);
    expect(JSON.stringify(logged.content)).toContain('dietaryFiber');

    const corrected = await tool('food_log', {
      action: 'update',
      entryId: row.id,
      changes: {
        name: 'Brown rice',
        kcal: 280,
        grams: { protein: null, sodium: 0.01 },
        waterMl: 0,
      },
    });
    expect(corrected.isError, JSON.stringify(corrected.content)).toBe(false);
    const correctedRows = await entries();
    expect(correctedRows).toMatchObject([
      {
        id: row.id,
        start_time: row.start_time,
        food: { name: 'Brown rice', amount: 150, waterMl: 0 },
        data: { name: 'Brown rice', kilocalories: 280 },
      },
    ]);
    expect(correctedRows[0]?.data['grams']).toEqual({ dietaryFiber: 2, sodium: 0.01 });
    const stale = await call(booted.base, booted.owner, {
      method: 'PUT',
      path: `/api/health/entries/${row.id}?expectedVersion=${String(row.version)}`,
      body: {
        type: row.record_type,
        startTime: row.start_time,
        endTime: row.end_time,
        zoneOffsetSeconds: row.zone_offset_seconds,
        data: row.data,
        food: row.food,
      },
    });
    expect(stale.status).toBe(409);
    expect(await energy()).toBe(280);
    const hydration = await call(booted.base, booted.owner, {
      method: 'GET',
      path: '/api/health/daily?from=2026-10-09&to=2026-10-12&metrics=hydration',
    });
    expect(E.readHealthDaily.response.parse(hydration.body)).toEqual([]);

    const removed = await tool('food_log', { action: 'remove', entryId: row.id });
    expect(removed.isError, JSON.stringify(removed.content)).toBe(false);
    expect(await entries()).toEqual([]);
    expect(await energy()).toBe(0);
  });

  it('leaves unprinted nutrients and water out when logging label facts', async () => {
    const result = await tool('food_log', {
      action: 'food',
      food: {
        name: 'Pork',
        kind: 'food',
        basis: { amount: 130, unit: 'g' },
        kcal: 140,
        grams: { protein: 25, sugar: 0 },
      },
      at: AT,
    });
    expect(result.isError, JSON.stringify(result.content)).toBe(false);
    const [row] = await entries();
    expect(row?.food?.amount).toBe(130);
    expect(row?.data['kilocalories']).toBe(140);
    expect(row?.food?.waterMl).toBe(0);
    expect(row?.data['grams']).toEqual({ protein: 25, sugar: 0 });
    const foods = await call(booted.base, booted.owner, { method: 'GET', path: '/api/foods' });
    expect(E.listFoods.response.parse(foods.body)).toEqual([]);
  });

  it('by food object stores what the app path stores and counts at once', async () => {
    const result = await tool('food_log', {
      action: 'food',
      food: FOOD,
      amount: 375,
      meal: 'breakfast',
      at: AT,
    });
    expect(result.isError, JSON.stringify(result.content)).toBe(false);
    const [row] = await entries();
    const expected = foodEntryOf({
      food: FOOD,
      foodId: null,
      amount: 375,
      mealType: 1,
      span: {
        startTime: row?.start_time ?? '',
        endTime: row?.end_time ?? '',
        zoneOffsetSeconds: row?.zone_offset_seconds ?? 0,
      },
    });
    expect(HEALTH_ENTRY_INPUT.parse(expected).data).toEqual(row?.data);
    expect(row?.food).toEqual(expected.food);
    expect(await energy()).toBeCloseTo(260, 0);
  });

  it('by foodId and a larger amount counts the nutrients at once', async () => {
    const saved = await tool('food_edit', {
      action: 'create',
      ...EDITED_FOOD,
      origin: 'custom',
      favourite: false,
    });
    expect(saved.isError, JSON.stringify(saved.content)).toBe(false);
    const foodId = (await call(booted.base, booted.owner, { method: 'GET', path: '/api/foods' }))
      .body;
    const id = E.listFoods.response.parse(foodId)[0]?.id;
    const result = await tool('food_log', {
      action: 'food',
      foodId: id,
      amount: 200,
      meal: 'lunch',
      at: AT,
    });
    expect(result.isError, JSON.stringify(result.content)).toBe(false);
    const [row] = await entries();
    expect(row?.data['kilocalories']).toBeCloseTo(138.67, 1);
    expect(await energy()).toBeCloseTo(138.67, 1);
  });

  it('shows food logged after local midnight in the snapshot a reloading app reads', async () => {
    await call(booted.base, booted.owner, {
      method: 'PATCH',
      path: '/api/settings/home',
      body: { time_zone: 'Asia/Bangkok' },
    });
    const result = await tool('food_log', {
      action: 'food',
      food: FOOD,
      amount: 375,
      meal: 'breakfast',
    });
    expect(result.isError, JSON.stringify(result.content)).toBe(false);
    const reply = await call(booted.base, booted.owner, {
      method: 'GET',
      path: '/api/snapshot?nutrition=true',
    });
    const days = E.readSnapshot.response
      .parse(reply.body)
      .tables.health_daily.filter((row) => row.metric === 'energy_in')
      .map((row) => row.day);
    expect(days).toEqual(['2026-10-11']);
    expect(await energy()).toBeCloseTo(260, 0);
  });

  it('by barcode uses the person’s own saved food and never replaces it with Open Food Facts', async () => {
    const barcode = '5000112637922';
    const created = await tool('food_edit', {
      action: 'create',
      ...EDITED_FOOD,
      barcode,
      origin: 'custom',
      favourite: true,
    });
    expect(created.isError, JSON.stringify(created.content)).toBe(false);
    const result = await tool('food_log', {
      action: 'food',
      barcode,
      amount: 375,
      meal: 'lunch',
      at: AT,
    });
    expect(result.isError, JSON.stringify(result.content)).toBe(false);
    const [row] = await entries();
    const foods = E.listFoods.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/foods' })).body,
    );
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({ origin: 'custom', favourite: true, serving: FOOD.serving });
    expect(row?.food?.foodId).toBe(foods[0]?.id);
    const found = await tool('food_find', { view: 'search', barcode });
    expect(found.isError, JSON.stringify(found.content)).toBe(false);
    expect(JSON.stringify(found.content)).toContain('Fish congee');
    expect(JSON.stringify(found.content)).not.toContain('Open Food Facts');
  });

  it('saving an Open Food Facts product with a saved custom food’s barcode keeps the custom food', async () => {
    const barcode = '5000112637922';
    await tool('food_edit', {
      action: 'create',
      ...EDITED_FOOD,
      barcode,
      origin: 'custom',
      favourite: true,
    });
    const reply = await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/foods',
      body: {
        ...FOOD,
        name: 'Other name',
        barcode,
        serving: null,
        origin: 'open_food_facts',
        favourite: false,
      },
    });
    expect(reply.status).toBeLessThan(300);
    const foods = E.listFoods.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/foods' })).body,
    );
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({
      name: 'Fish congee',
      origin: 'custom',
      favourite: true,
      serving: FOOD.serving,
    });
  });
  it('saving an Open Food Facts product again keeps the saved copy with its serving and favourite', async () => {
    const barcode = '5000112637922';
    const body = { ...FOOD, barcode, origin: 'open_food_facts', favourite: true };
    await call(booted.base, booted.owner, { method: 'POST', path: '/api/foods', body });
    const again = await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/foods',
      body: { ...body, name: 'Renamed upstream', serving: null, favourite: false },
    });
    expect(again.status).toBeLessThan(300);
    const foods = E.listFoods.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/foods' })).body,
    );
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({
      name: 'Fish congee',
      origin: 'open_food_facts',
      favourite: true,
      serving: FOOD.serving,
    });
  });

  it('a custom food saved with a saved product’s barcode becomes custom and keeps the favourite', async () => {
    const barcode = '5000112637922';
    await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/foods',
      body: { ...FOOD, barcode, origin: 'open_food_facts', favourite: true },
    });
    const mine = { amount: 250, label: 'my bowl' };
    await call(booted.base, booted.owner, {
      method: 'POST',
      path: '/api/foods',
      body: { ...FOOD, barcode, serving: mine, origin: 'custom', favourite: false },
    });
    const foods = E.listFoods.response.parse(
      (await call(booted.base, booted.owner, { method: 'GET', path: '/api/foods' })).body,
    );
    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({ origin: 'custom', favourite: true, serving: mine });
  });
});
