import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import {
  ApiError,
  MCP_TOOL_AREAS,
  TEMPLATE_SCOPES,
  createClientToken,
  hashClientToken,
  type ClientRow,
  type PersonAccessChange,
  type ProfileRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ownerProfileOf } from '../../src/transcripts/owner';
import { clientForToken } from '../../src/server/auth';
import { clientSocketsOf } from '../../src/server/client-sockets';
import { AccessLifecycle } from '../../src/server/access-lifecycle';
import type { AccessService } from '../../src/server/access';
import {
  effectiveClientById,
  hasOwnerDevice,
  type AccessEntry,
} from '../../src/server/person-access';
import { Sql } from '../../src/store/sql';
import { repairPersonAccess } from '../../src/store/person-access-repair';
import { accessServiceFor } from '../support/access-service';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const HOME: AccessEntry = {
  remote: '192.168.1.20',
  forwarded: false,
  host: null,
  statusOnly: false,
};
const START = new Date('2026-10-18T10:00:00.000Z');

let opened: TestStore;
let moment: Date;
let ownerPerson: string;

function pair(
  role: 'owner' | 'member',
  profileId: string,
  name = 'Phone',
): { readonly token: string; readonly client: ClientRow } {
  const token = createClientToken();
  const client = opened.store.clients.create({
    name,
    platform: 'android',
    role,
    tokenHash: hashClientToken(token),
    profileId,
  });
  return { token, client };
}

function person(name: string, change: PersonAccessChange): ProfileRow {
  const profile = opened.store.profiles.create({ name });
  opened.store.personAccess.change(profile.id, change);
  return profile;
}

function raw(work: (database: DatabaseSync) => void): void {
  const database = new DatabaseSync(join(opened.directory, 'test.db'));
  try {
    work(database);
  } finally {
    database.close();
  }
}

function refusal(work: () => unknown): ApiError {
  try {
    work();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

beforeEach(async () => {
  captureLogs();
  moment = START;
  opened = await testStore((): Date => moment);
  const created = opened.store.clients.create(
    { name: 'This computer', platform: 'desktop', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  );
  ownerPerson = opened.store.profiles.activeOf(created.id).id;
});

afterEach(async () => {
  await opened.close();
});

describe('a bad or missing access row', () => {
  it('never locks the owner devices out, whatever the stored limits look like', () => {
    const owner = pair('owner', ownerPerson);
    raw((database) => {
      database.exec(
        `update person_access set scopes = '{"areas":["gone"],"extra":1}', conditions = '{"x":1}', budget = '{"daily":"x"}'`,
      );
    });
    const resolved = clientForToken(opened.store, owner.token, HOME);
    expect(resolved.role).toBe('owner');
    expect(opened.store.personAccess.standing(ownerPerson)).toMatchObject({
      known: true,
      role: 'owner',
    });
  });

  it('lets a member keep working while only its limits are unreadable', () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    const phone = pair('member', kid.id);
    raw((database) => {
      database.exec(`update person_access set scopes = '{"areas":"all"}' where role = 'member'`);
    });
    expect(clientForToken(opened.store, phone.token, HOME).role).toBe('member');
  });

  it('keeps an owner device an owner and refuses a member device when the row is gone', () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    const phone = pair('member', kid.id);
    const viewer = pair('owner', kid.id, 'Viewer');
    raw((database) => {
      database.exec(`delete from person_access where role = 'member'`);
    });
    expect(clientForToken(opened.store, viewer.token, HOME).id).toBe(viewer.client.id);
    expect(refusal(() => clientForToken(opened.store, phone.token, HOME)).code).toBe('forbidden');
    expect(opened.store.personAccess.standing(kid.id)).toStrictEqual({
      known: false,
      reason: 'missing',
    });
  });

  it('is repaired at start: unknown areas and keys are dropped, missing keys come from the template', () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    raw((database) => {
      database.exec(
        `update person_access set scopes = '{"areas":["settings","gone","home"],"channels":{"mode":"bad"}}',
         conditions = '{"home_only":true,"stray":1}' where role = 'member'`,
      );
    });
    expect(() => opened.store.personAccess.list()).toThrow();
    const repaired = repairAgainstFile();
    expect(repaired).toBe(1);
    const row = opened.store.personAccess.byProfile(kid.id);
    expect(row.scopes.areas).toStrictEqual(['home', 'settings']);
    expect(row.scopes.channels).toStrictEqual({ mode: 'all', ids: [] });
    expect(row.conditions).toStrictEqual({ home_only: true, schedule: null });
    expect(repairAgainstFile()).toBe(0);
  });
});

function repairAgainstFile(): number {
  let repaired = 0;
  raw((database) => {
    repaired = repairPersonAccess(new Sql(database), testLogger('repair'));
  });
  return repaired;
}

describe('repairing areas that no longer exist', () => {
  it('gives a person the template areas when none of the stored ones is known any more', () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    raw((database) => {
      database.exec(`update person_access set scopes = '{"areas":["gone"]}' where role = 'member'`);
    });
    expect(repairAgainstFile()).toBe(1);
    expect(opened.store.personAccess.byProfile(kid.id).scopes.areas).toStrictEqual(
      TEMPLATE_SCOPES.child.areas,
    );
  });
});

describe('the expiry sweep', () => {
  it('still unpairs an ended guest whose stored limits cannot be read', () => {
    const guest = person('Guest', {
      role: 'guest',
      template: 'guest',
      expires_at: '2026-10-18T09:00:00.000Z',
    });
    const phone = pair('member', guest.id);
    raw((database) => {
      database.exec(`update person_access set scopes = '{"areas":3}' where role = 'guest'`);
    });
    new AccessLifecycle({
      store: opened.store,
      now: (): Date => moment,
      clientRemoved: (): void => undefined,
      clientPaused: (): void => undefined,
      lapseGrants: (): void => undefined,
    }).sweep();
    expect(opened.store.clients.list().map((client) => client.id)).not.toContain(phone.client.id);
  });
});

describe('the list of areas', () => {
  it('is the list the stored limits were last checked against; changing it needs a look at the stored rows', () => {
    expect(MCP_TOOL_AREAS).toStrictEqual([
      'home',
      'devices',
      'computers',
      'control',
      'automations',
      'history',
      'health',
      'nutrition',
      'cameras',
      'talk',
      'assistant',
      'settings',
      'people',
      'plugins',
      'system',
      'everything',
    ]);
  });
});

describe('the schedule of a person', () => {
  const window = { from: '09:00', to: '11:00', urgent: false };

  it('pauses a member device inside the window, audits it, and lets it back in outside', () => {
    const kid = person('Kid', {
      role: 'member',
      template: 'child',
      conditions: { home_only: false, schedule: window },
    });
    const phone = pair('member', kid.id);
    expect(refusal(() => clientForToken(opened.store, phone.token, HOME)).code).toBe('forbidden');
    expect(opened.store.accessAudit.list(5)).toMatchObject([
      { kind: 'refused_condition', client_id: phone.client.id },
    ]);
    moment = new Date('2026-10-18T11:00:00.000Z');
    expect(clientForToken(opened.store, phone.token, HOME).id).toBe(phone.client.id);
  });

  it('keeps the read-only status visible and never binds an owner person or an owner device', () => {
    const kid = person('Kid', {
      role: 'member',
      template: 'child',
      conditions: { home_only: false, schedule: window },
    });
    const phone = pair('member', kid.id);
    expect(clientForToken(opened.store, phone.token, { ...HOME, statusOnly: true }).role).toBe(
      'member',
    );
    const owner = pair('owner', ownerPerson);
    opened.store.personAccess.change(ownerPerson, {
      conditions: { home_only: false, schedule: window },
    });
    expect(clientForToken(opened.store, owner.token, HOME).role).toBe('owner');
    opened.store.clients.useProfile(owner.client.id, kid.id);
    expect(clientForToken(opened.store, owner.token, HOME).role).toBe('member');
  });
});

describe('seeing the home as another person', () => {
  it('limits every role read to the person, not only the request path', () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    const phone = pair('owner', ownerPerson);
    expect(effectiveClientById(opened.store, phone.client.id).role).toBe('owner');
    expect(hasOwnerDevice(opened.store, ownerPerson)).toBe(true);
    opened.store.clients.useProfile(phone.client.id, kid.id);
    expect(effectiveClientById(opened.store, phone.client.id).role).toBe('member');
    expect(hasOwnerDevice(opened.store, kid.id)).toBe(false);
    expect(opened.store.clients.byId(phone.client.id).role).toBe('owner');
  });
});

describe('the owner person', () => {
  it('stays the home owner person when the desktop looks at a member person', () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    const desktop = opened.store.clients.owner();
    if (desktop === undefined) throw new Error('the desktop exists');
    opened.store.clients.useProfile(desktop.id, kid.id);
    expect(ownerProfileOf(opened.store)).toBe(ownerPerson);
    expect(opened.store.personAccess.change(kid.id, { template: 'guest' }).template).toBe('guest');
  });

  it('refuses to demote the home owner person', () => {
    const second = person('Partner', { role: 'owner', template: 'owner' });
    expect(() => opened.store.personAccess.change(ownerPerson, { role: 'member' })).toThrow();
    expect(opened.store.personAccess.change(second.id, { role: 'member' }).role).toBe('member');
  });
});

describe('revoking and expiring', () => {
  let access: AccessService;
  let owner: ClientRow;

  beforeEach(() => {
    access = accessServiceFor(opened, (): Date => moment);
    const desktop = opened.store.clients.owner();
    if (desktop === undefined) throw new Error('the desktop exists');
    owner = desktop;
  });

  it('withdraws the pairing codes still open for the person and closes every kind of socket', () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    const phone = pair('member', kid.id);
    const { code } = access.startPairing('member', owner.id, kid.id);
    const closed: number[] = [];
    clientSocketsOf(opened.store).track(phone.client.id, {
      close: (closeCode): void => {
        closed.push(closeCode);
      },
      once: (): void => undefined,
    });
    new AccessLifecycle({
      store: opened.store,
      now: (): Date => moment,
      clientRemoved: (): void => undefined,
      clientPaused: (): void => undefined,
      lapseGrants: (): void => undefined,
    }).revoke(kid.id, owner.id);
    expect(closed).toStrictEqual([4001]);
    expect(
      refusal(() => access.claim({ code, name: 'Late', platform: 'android', remote: 'phone' }))
        .code,
    ).toBe('pairing_code_invalid');
  });

  it('asks a changed person for a new code when an owner pairing outlived the owner role', () => {
    const partner = person('Partner', { role: 'owner', template: 'owner' });
    const { code } = access.startPairing('owner', owner.id, partner.id);
    opened.store.personAccess.change(partner.id, { role: 'member' });
    expect(
      refusal(() => access.claim({ code, name: 'Tablet', platform: 'android', remote: 'tablet' }))
        .code,
    ).toBe('conflict');
  });

  it('closes tracked sockets of a device that is removed', () => {
    const kid = person('Kid', { role: 'member', template: 'child' });
    const phone = pair('member', kid.id);
    const closed: string[] = [];
    clientSocketsOf(opened.store).track(phone.client.id, {
      close: (_code, reason): void => {
        closed.push(reason);
      },
      once: (): void => undefined,
    });
    opened.store.clients.remove(phone.client.id);
    expect(closed).toStrictEqual(['token withdrawn']);
  });
});
