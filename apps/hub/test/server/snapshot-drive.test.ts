import { API_ENDPOINTS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { pairPhone, useBootedServer, verifiedPublicUrl } from '../support/booted';
import { call } from '../support/server';

const suite = useBootedServer({ linked: true });

async function seen(token: string): Promise<{
  readonly snapshot: readonly string[];
  readonly listed: readonly string[];
}> {
  const { base } = suite.current;
  const snapshot = API_ENDPOINTS.readSnapshot.response.parse(
    (await call(base, token, { method: 'GET', path: '/api/snapshot' })).body,
  );
  const listed = API_ENDPOINTS.listRoots.response.parse(
    (await call(base, token, { method: 'GET', path: '/api/drive/roots' })).body,
  );
  return {
    snapshot: (snapshot.tables.drive_roots ?? []).map((root) => root.id).sort(),
    listed: listed.map((root) => root.id).sort(),
  };
}

describe('the drive folders in the snapshot', () => {
  it('give the owner every drive the roots list shows, with the shared drive among them', async () => {
    const { snapshot, listed } = await seen(suite.current.owner);
    expect(listed.length).toBeGreaterThan(0);
    expect(snapshot).toStrictEqual(listed);
  });

  it('give a member only the drives the roots list shows them', async () => {
    await verifiedPublicUrl(suite.current);
    const phone = await pairPhone(suite.current);
    const { snapshot, listed } = await seen(phone.token);
    expect(snapshot).toStrictEqual(listed);
  });
});
