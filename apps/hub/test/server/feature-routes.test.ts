import {
  DRIVE_LIBRARY_ENDPOINTS,
  DRIVE_STORAGE_ENDPOINTS,
  GOOGLE_ENDPOINTS,
  PHOTOS_ENDPOINTS,
  PLANNER_CLOCK_ENDPOINTS,
  PLANNER_ENDPOINTS,
  PLANNER_ITEM_ENDPOINTS,
  buildPath,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { useBootedServer } from '../support/booted';
import { call } from '../support/server';

const suite = useBootedServer({ linked: false });

const FEATURES = {
  ...DRIVE_LIBRARY_ENDPOINTS,
  ...DRIVE_STORAGE_ENDPOINTS,
  ...PHOTOS_ENDPOINTS,
  ...PLANNER_ENDPOINTS,
  ...PLANNER_ITEM_ENDPOINTS,
  ...PLANNER_CLOCK_ENDPOINTS,
  ...GOOGLE_ENDPOINTS,
};

const NO_ROUTE = 'There is no route at this address.';

function sample(path: string): string {
  const names = path
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1));
  return buildPath(path, Object.fromEntries(names.map((name) => [name, 'sample'])));
}

describe('the Drive, Photos, Planner and Google routes', () => {
  it('answers every endpoint of the contract from a running hub', async () => {
    const missing: string[] = [];
    for (const [name, endpoint] of Object.entries(FEATURES)) {
      const reply = await call(suite.current.base, null, {
        method: endpoint.method,
        path: sample(endpoint.path),
      });
      if (reply.status === 404 && JSON.stringify(reply.body).includes(NO_ROUTE)) {
        missing.push(`${name} ${endpoint.method} ${endpoint.path}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
