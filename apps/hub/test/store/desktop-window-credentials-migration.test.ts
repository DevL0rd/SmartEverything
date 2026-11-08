import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { hiddenComputer } from '../../src/computers/computer-access';
import { approverClients } from '../../src/machines/approval';
import { StoreContext } from '../../src/store/context';
import { ChangeFeed } from '../../src/store/feed';
import { migrate } from '../../src/store/migrate';
import { MIGRATIONS } from '../../src/store/migrations';
import { DESKTOP_WINDOW_CREDENTIALS_MIGRATION } from '../../src/store/migrations/desktop-window-credentials';
import { ClientsRepository } from '../../src/store/repositories/clients';
import { ComputerNodesRepository } from '../../src/store/repositories/computer-nodes';
import { PersonAccessRepository } from '../../src/store/repositories/person-access';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { Sql } from '../../src/store/sql';
import { testLogger } from '../support/logs';

const NOW = '2026-11-06T00:00:00.000Z';
const HUB_URL = 'https://hub.example';
const BUILT_IN = '0e000000-0000-4000-8000-000000000001';
const BROWSER = '0e000000-0000-4000-8000-000000000002';
const DESKTOP = '0e000000-0000-4000-8000-000000000003';
const WINDOW = '0e000000-0000-4000-8000-000000000004';
const MEMBER_PHONE = '0e000000-0000-4000-8000-000000000005';
const OLD_COMPUTER = 'old-computer';
const DESKTOP_COMPUTER = 'enrolled-computer';
const ROOM = 'workbench';

let database: DatabaseSync;
let context: StoreContext;
let person: string;

function seedClients(): void {
  const insert = database.prepare(
    `insert into clients (id, name, platform, kind, role, built_in, token_hash, created_at, profile_id)
     values (?, 'Desk desktop', ?, ?, ?, ?, ?, ?, ?)`,
  );
  insert.run(BUILT_IN, 'desktop', 'computer', 'owner', 1, 'built-in-token', NOW, null);
  insert.run(BROWSER, 'web', 'browser', 'owner', 0, 'browser-token', NOW, null);
  insert.run(DESKTOP, 'desktop', 'computer', 'owner', 0, 'desktop-token', NOW, null);
  insert.run(WINDOW, 'web', 'browser', 'member', 0, 'old-window-token', NOW, person);
  insert.run(MEMBER_PHONE, 'android', 'phone', 'member', 0, 'member-token', NOW, person);
}

function seedComputer(deviceId: string, windowClientId: string | null): void {
  database
    .prepare(
      `insert into devices
       (id, provider, external_id, kind, name, model, manufacturer, room_id, created_at, updated_at)
       values (?, 'local', ?, 'computer', 'Desk', 'm', 'v', ?, ?, ?)`,
    )
    .run(deviceId, `computer:${deviceId}`, ROOM, NOW, NOW);
  database
    .prepare(
      `insert into computer_nodes
       (device_id, machine_id, token_hash, hub_url, paired_at, revoked_at, window_client_id)
       values (?, ?, ?, ?, ?, null, ?)`,
    )
    .run(deviceId, `machine-${deviceId}`, `node-token-${deviceId}`, HUB_URL, NOW, windowClientId);
}

beforeEach(() => {
  database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const log = testLogger();
  context = new StoreContext(new Sql(database), new ChangeFeed(log), () => new Date(NOW));
  migrate(
    context.sql,
    MIGRATIONS.filter(
      (migration) => migration.version < DESKTOP_WINDOW_CREDENTIALS_MIGRATION.version,
    ),
    NOW,
    log,
  );
  person = new ProfilesRepository(context).create({ name: 'Robin' }).id;
  seedClients();
  database.prepare("insert into rooms (id, name) values (?, 'Workbench')").run(ROOM);
  seedComputer(OLD_COMPUTER, WINDOW);
  seedComputer(DESKTOP_COMPUTER, DESKTOP);
  seedComputer('standalone-computer', null);
  database
    .prepare(
      `insert into computer_runtime_grants (device_id, runtime, token_hash)
       values (?, 'codex', 'runtime-grant')`,
    )
    .run(OLD_COMPUTER);
});

afterEach(() => {
  database.close();
});

function migrateWindowCredentials(): void {
  migrate(context.sql, MIGRATIONS, NOW, testLogger());
}

it('revokes generated window credentials and preserves enrolled clients, Computer identities and runtime grants', () => {
  const nodes = database.prepare(
    `select device_id, machine_id, token_hash, hub_url, paired_at, revoked_at, window_client_id
     from computer_nodes order by device_id`,
  );
  const before = nodes.all();

  migrateWindowCredentials();

  expect(database.prepare('select id, token_hash from clients order by id').all()).toEqual([
    { id: BUILT_IN, token_hash: 'built-in-token' },
    { id: BROWSER, token_hash: 'browser-token' },
    { id: DESKTOP, token_hash: 'desktop-token' },
    { id: MEMBER_PHONE, token_hash: 'member-token' },
  ]);
  expect(nodes.all()).toEqual(
    before.map((node) =>
      node['device_id'] === OLD_COMPUTER ? { ...node, window_client_id: null } : node,
    ),
  );
  expect(database.prepare('select * from computer_runtime_grants').all()).toEqual([
    { device_id: OLD_COMPUTER, runtime: 'codex', token_hash: 'runtime-grant' },
  ]);
  expect(database.prepare('pragma foreign_key_check').all()).toEqual([]);
});

it('changes the person of an active linked Computer when its Desktop client chooses a profile', () => {
  const revokedComputer = 'revoked-computer';
  seedComputer(revokedComputer, DESKTOP);
  database
    .prepare('update computer_nodes set revoked_at = ? where device_id = ?')
    .run(NOW, revokedComputer);
  migrateWindowCredentials();
  const clients = new ClientsRepository(context);
  const computerNodes = new ComputerNodesRepository(context);
  const other = new ProfilesRepository(context).create({ name: 'Sam' }).id;

  expect(computerNodes.personOf(DESKTOP_COMPUTER)).toBeNull();
  expect(clients.useProfile(DESKTOP, other).profile_id).toBe(other);
  expect(computerNodes.personOf(DESKTOP_COMPUTER)).toBe(other);
  expect(computerNodes.personOf(OLD_COMPUTER)).toBe(person);
  expect(
    database
      .prepare('select profile_id from computer_nodes where device_id = ?')
      .get(revokedComputer),
  ).toEqual({ profile_id: null });
});

it('rolls back the Desktop profile change if its linked Computer cannot be moved', () => {
  migrateWindowCredentials();
  const clients = new ClientsRepository(context);
  const computerNodes = new ComputerNodesRepository(context);
  database.exec(
    `create trigger refuse_computer_profile before update of profile_id on computer_nodes
     begin select raise(abort, 'Computer profile change refused'); end`,
  );

  expect(() => clients.useProfile(DESKTOP, person)).toThrow('Computer profile change refused');
  expect(clients.byId(DESKTOP).profile_id).toBeNull();
  expect(computerNodes.personOf(DESKTOP_COMPUTER)).toBeNull();
});

it('moves a surviving Desktop and its linked Computer to the heir when removing their profile', () => {
  database.prepare('update clients set profile_id = ? where id = ?').run(person, DESKTOP);
  migrateWindowCredentials();
  const profiles = new ProfilesRepository(context);
  const clients = new ClientsRepository(context);
  const computerNodes = new ComputerNodesRepository(context);
  const heir = new PersonAccessRepository(context).homeOwner();

  expect(computerNodes.personOf(DESKTOP_COMPUTER)).toBe(person);
  profiles.remove(person);
  expect(clients.byId(DESKTOP).profile_id).toBe(heir);
  expect(computerNodes.personOf(DESKTOP_COMPUTER)).toBe(heir);
  expect(computerNodes.personOf(OLD_COMPUTER)).toBeNull();
});

it('keeps the Computer visible to its assigned person and routes approvals to their phone', () => {
  migrateWindowCredentials();
  const computerNodes = new ComputerNodesRepository(context);
  const people = {
    clients: new ClientsRepository(context),
    profiles: new ProfilesRepository(context),
    personAccess: new PersonAccessRepository(context),
  };
  const device = { id: OLD_COMPUTER, kind: 'computer' } as const;

  expect(computerNodes.personOf(OLD_COMPUTER)).toBe(person);
  expect(hiddenComputer({ computerNodes }, { owner: false, profileId: person }, device)).toBe(
    false,
  );
  const other = people.profiles.create({ name: 'Sam' }).id;
  expect(hiddenComputer({ computerNodes }, { owner: false, profileId: other }, device)).toBe(true);
  expect(approverClients(people, computerNodes.personOf(OLD_COMPUTER))).toEqual([MEMBER_PHONE]);
  expect(computerNodes.roomOfWindow(DESKTOP)).toBe('Workbench');
  expect(database.prepare('select room_id from devices where id = ?').get(OLD_COMPUTER)).toEqual({
    room_id: ROOM,
  });
});

it('keeps the assigned person on a remote re-pair and follows an associated Desktop on a local re-pair', () => {
  migrateWindowCredentials();
  const computerNodes = new ComputerNodesRepository(context);
  const other = new ProfilesRepository(context).create({ name: 'Sam' }).id;
  const binding = {
    deviceId: OLD_COMPUTER,
    machineId: `machine-${OLD_COMPUTER}`,
    tokenHash: 'replacement-node-token',
    hubUrl: HUB_URL,
  };

  computerNodes.bind({ ...binding, windowClientId: null, profileId: other });
  expect(computerNodes.personOf(OLD_COMPUTER)).toBe(person);

  computerNodes.bind({ ...binding, windowClientId: DESKTOP, profileId: null });
  expect(computerNodes.personOf(OLD_COMPUTER)).toBeNull();
});
