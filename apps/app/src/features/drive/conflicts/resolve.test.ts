import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  DRIVE_CONFLICT,
  type DriveConflict,
  type DriveConflictResolve,
} from '@smarteverything/domain';
import type { ToastInput } from '../../../components/toast-store';
import { DRIVE_EVERYWHERE, driveKey } from '../../../queries/keys';
import { ROOT_ID } from '../data/fixtures';

interface Seen {
  resolved: DriveConflictResolve[];
  toasts: ToastInput[];
  fail: boolean;
}

const seen = vi.hoisted((): Seen => ({ resolved: [], toasts: [], fail: false }));

const OPEN: DriveConflict = DRIVE_CONFLICT.parse({
  id: 'f1b2c3d4-0000-4000-8000-000000000070',
  rootId: ROOT_ID,
  itemId: 'e1b2c3d4-0000-4000-8000-000000000004',
  conflictItemId: 'f1b2c3d4-0000-4000-8000-000000000071',
  relPath: 'Home/Budget 2027.xlsx',
  conflictRelPath: 'Home/Budget 2027.sync-conflict.xlsx',
  hubRev: 4,
  baseRev: 3,
  deviceId: 'e1b2c3d4-0000-4000-8000-000000000003',
  profileId: null,
  at: '2026-11-07T12:44:00.000Z',
  resolvedAt: null,
  resolution: null,
});

vi.mock('../../../api/drive', () => ({
  resolveDriveConflict: (body: DriveConflictResolve): Promise<DriveConflict> => {
    seen.resolved.push(body);
    return seen.fail
      ? Promise.reject(new Error('hub said no'))
      : Promise.resolve({
          ...OPEN,
          resolvedAt: '2026-11-07T15:00:00.000Z',
          resolution: body.resolution,
        });
  },
}));
vi.mock('../../../components/toast-store', () => ({
  notify: (input: ToastInput): number => {
    seen.toasts.push(input);
    return seen.toasts.length;
  },
}));

const { resolveConflict } = await import('./resolve');
const { RESOLVE_FAILED } = await import('./conflict-model');

const SIDES = { hub: 'Workstation', client: 'Laptop' };

function clientWithConflicts(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(driveKey('conflicts', { ...DRIVE_EVERYWHERE, rootId: ROOT_ID }), {});
  return client;
}

describe('resolveConflict', () => {
  beforeEach(() => {
    seen.resolved = [];
    seen.toasts = [];
    seen.fail = false;
  });

  it('sends the chosen copy, refreshes the conflict list and says what was kept', async () => {
    const client = clientWithConflicts();
    await expect(
      resolveConflict(client, { conflict: OPEN, resolution: 'keep_client', sides: SIDES }),
    ).resolves.toBe(true);
    expect(seen.resolved).toEqual([{ conflictId: OPEN.id, resolution: 'keep_client' }]);
    expect(seen.toasts).toEqual([{ message: 'Kept the Laptop version', tone: 'positive' }]);
    await vi.waitFor(() => {
      expect(
        client.getQueryState(driveKey('conflicts', { ...DRIVE_EVERYWHERE, rootId: ROOT_ID }))
          ?.isInvalidated,
      ).toBe(true);
    });
  });

  it('keeps the conflict open and says so when the hub refuses', async () => {
    seen.fail = true;
    const client = clientWithConflicts();
    await expect(
      resolveConflict(client, { conflict: OPEN, resolution: 'keep_both', sides: SIDES }),
    ).resolves.toBe(false);
    expect(seen.toasts.map((toast) => [toast.message, toast.tone])).toEqual([
      [RESOLVE_FAILED, 'critical'],
    ]);
    expect(
      client.getQueryState(driveKey('conflicts', { ...DRIVE_EVERYWHERE, rootId: ROOT_ID }))
        ?.isInvalidated,
    ).toBe(false);
  });
});
