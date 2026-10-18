import { API_ENDPOINTS as E, waterEntryOf } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bootServer, type Booted } from './support/booted';
import { captureLogs } from './support/logs';
import { call, temporaryDirectory } from './support/server';

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

async function logGlass(): Promise<string> {
  const reply = await call(booted.base, booted.owner, {
    method: 'POST',
    path: '/api/health/entries',
    body: waterEntryOf(250, {
      startTime: '2026-10-10T10:00:00.000Z',
      endTime: '2026-10-10T10:00:01.000Z',
      zoneOffsetSeconds: 0,
    }),
  });
  return E.createHealthEntry.response.parse(reply.body).id;
}

describe('reading one logged entry', () => {
  it('finds it by its id alone', async () => {
    const id = await logGlass();
    const reply = await call(booted.base, booted.owner, {
      method: 'GET',
      path: `/api/health/entries/${id}`,
    });
    expect(reply.status).toBe(200);
    const row = E.readHealthEntry.response.parse(reply.body);
    expect(row.id).toBe(id);
    expect(row.record_type).toBe('Hydration');
  });

  it('says not found for an entry that does not exist', async () => {
    const reply = await call(booted.base, booted.owner, {
      method: 'GET',
      path: '/api/health/entries/00000000-0000-4000-8000-000000000000',
    });
    expect(reply.status).toBe(404);
  });

  it('says not found after the entry was removed', async () => {
    const id = await logGlass();
    await call(booted.base, booted.owner, { method: 'DELETE', path: `/api/health/entries/${id}` });
    const reply = await call(booted.base, booted.owner, {
      method: 'GET',
      path: `/api/health/entries/${id}`,
    });
    expect(reply.status).toBe(404);
  });
});
