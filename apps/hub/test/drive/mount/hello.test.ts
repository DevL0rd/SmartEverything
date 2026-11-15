import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MountFailure, TestClient, openMountRig, type MountRig } from './mount-rig';

let rig: MountRig;
let client: TestClient;

beforeEach(async () => {
  rig = await openMountRig(80);
  client = await rig.connect(rig.posix.node);
});

afterEach(async () => {
  await rig.close();
});

describe('opening the socket', () => {
  it('greets with a session, the lease and the frame limit', async () => {
    const reply = await client.hello();
    expect(reply.resumed).toBe(false);
    expect(reply.leaseMs).toBe(80);
    expect(reply.session).toHaveLength(16);
  });

  it('closes a socket that sends anything before hello', async () => {
    const closed = new Promise<number>((resolve) => {
      client.socket.once('close', resolve);
    });
    client.request('GETATTR', { ino: 1 }).sent.catch(() => undefined);
    expect(await closed).toBe(1008);
  });

  it('refuses a socket without a computer token', async () => {
    await expect(TestClient.open(rig.port, 'sen_unknown')).rejects.toThrow();
  });
});

describe('session resume', () => {
  it('resumes the same session inside the lease', async () => {
    const first = await client.hello();
    const placement = rig.placementOf(rig.posix.node, rig.posix.ownerId, rig.posix.mine.id);
    await client.call('ATTACH', { placementId: placement });
    const second = await rig.connect(rig.posix.node);
    const reply = await second.hello({ session: first.session });
    expect(reply.resumed).toBe(true);
    expect(Buffer.from(reply.session).equals(Buffer.from(first.session))).toBe(true);
    expect(rig.mount.services.registry.all()).toHaveLength(1);
  });

  it('keeps a dropped session for the lease and then forgets it', async () => {
    const first = await client.hello();
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const inside = await rig.connect(rig.posix.node);
    expect((await inside.hello({ session: first.session })).resumed).toBe(true);
    inside.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    const late = await rig.connect(rig.posix.node);
    const after = await late.hello({ session: first.session });
    expect(after.resumed).toBe(false);
    expect(Buffer.from(after.session).equals(Buffer.from(first.session))).toBe(false);
  });

  it('does not resume the session of another computer', async () => {
    const first = await client.hello();
    const other = await rig.connect(rig.posix.memberNode);
    const reply = await other.hello({ session: first.session });
    expect(reply.resumed).toBe(false);
  });

  it('answers a request for an unknown inode with an error and keeps the socket', async () => {
    await client.hello();
    await expect(client.call('GETATTR', { ino: 999_999 })).rejects.toMatchObject({
      code: 'ESTALE',
    });
    await expect(client.call('GETATTR', { ino: 999_999 })).rejects.toBeInstanceOf(MountFailure);
  });
});
