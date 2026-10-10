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
  it('by food object stores what the app path stores and counts at once', async () => {
    const result = await tool('log_food', {
      what: 'food',
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

  it('by foodId and multiplier counts the scaled nutrients at once', async () => {
    const saved = await tool('edit_food', {
      action: 'create',
      ...FOOD,
      origin: 'custom',
      favourite: false,
    });
    expect(saved.isError, JSON.stringify(saved.content)).toBe(false);
    const foodId = (await call(booted.base, booted.owner, { method: 'GET', path: '/api/foods' }))
      .body;
    const id = E.listFoods.response.parse(foodId)[0]?.id;
    const result = await tool('log_food', {
      what: 'food',
      foodId: id,
      amount: 100,
      multiplier: 2,
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
    const result = await tool('log_food', {
      what: 'food',
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
});
