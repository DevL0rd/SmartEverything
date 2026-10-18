import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listPersonAccess, listAccessAudit } = vi.hoisted(() => ({
  listPersonAccess: vi.fn(() => Promise.resolve([])),
  listAccessAudit: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../../../api/person-access', () => ({
  listPersonAccess,
  listAccessAudit,
  changePersonAccess: vi.fn(),
  revokePerson: vi.fn(),
}));

vi.mock('../../../queries/use-screen-query', () => ({ useScreenQuery: vi.fn() }));

vi.mock('../../../store/selectors', () => ({ useIsOwner: vi.fn() }));

const { accessAuditQuery, peopleAccessQuery } = await import('./access-data');

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient();
  listPersonAccess.mockClear();
  listAccessAudit.mockClear();
});

afterEach(() => {
  client.clear();
});

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('the access queries', () => {
  it('ask the hub for the people only on an owner device', async () => {
    const member = new QueryObserver(client, peopleAccessQuery(false)).subscribe(() => undefined);
    await settle();
    expect(listPersonAccess).not.toHaveBeenCalled();
    member();
    const owner = new QueryObserver(client, peopleAccessQuery(true)).subscribe(() => undefined);
    await settle();
    expect(listPersonAccess).toHaveBeenCalledTimes(1);
    owner();
  });

  it('read the audit log only on an owner device', async () => {
    const member = new QueryObserver(client, accessAuditQuery(false, 5, null)).subscribe(
      () => undefined,
    );
    await settle();
    expect(listAccessAudit).not.toHaveBeenCalled();
    member();
    const owner = new QueryObserver(client, accessAuditQuery(true, 5, null)).subscribe(
      () => undefined,
    );
    await settle();
    expect(listAccessAudit).toHaveBeenCalledWith(5, null);
    owner();
  });
});
