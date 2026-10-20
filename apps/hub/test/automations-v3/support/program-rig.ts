import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  createClientToken,
  hashClientToken,
  type AutomationV3,
  type ClientRow,
  type DeviceRow,
  type FlowNode,
  type JsonValue,
  type PortValue,
  type TriggerNode,
} from '@smarteverything/domain';
import type { AutomationPrograms } from '../../../src/automations/service-programs';
import { automationPrograms } from '../../../src/automations/service-programs';
import type { ProgramEnv } from '../../../src/automations/service-programs-analysis';
import { PluginTurnRefusedError } from '../../../src/ai-tools/plugin-turn';
import type { Caller } from '../../../src/server/auth';
import { Ledger } from '../../../src/ledger/ledger';
import { StoreContext } from '../../../src/store/context';
import { ChangeFeed } from '../../../src/store/feed';
import { migrate } from '../../../src/store/migrate';
import { MIGRATIONS } from '../../../src/store/migrations';
import { assistantRepositories } from '../../../src/store/repositories/areas/assistant';
import { automationRepositories } from '../../../src/store/repositories/areas/automation';
import { computerRepositories } from '../../../src/store/repositories/areas/computers';
import { healthRepositories } from '../../../src/store/repositories/areas/health';
import { homeRepositories } from '../../../src/store/repositories/areas/home';
import { peopleRepositories } from '../../../src/store/repositories/areas/people';
import { platformRepositories } from '../../../src/store/repositories/areas/platform';
import { AutomationFunctionsRepository } from '../../../src/store/repositories/automation-functions';
import { AutomationPlansRepository } from '../../../src/store/repositories/automation-plans';
import { AutomationProgramsRepository } from '../../../src/store/repositories/automation-programs';
import { AutomationRevisionsRepository } from '../../../src/store/repositories/automation-revisions';
import { durableSessionWrite } from '../../../src/store/repositories/dsh-session-durability';
import { SettingsRepository } from '../../../src/store/repositories/settings';
import { Sql } from '../../../src/store/sql';
import type { Store } from '../../../src/store/store';
import { testLogger } from '../../support/logs';
import { addPhoneDevice } from '../../support/phone-fixtures';

interface Person {
  readonly client: ClientRow;
  readonly profileId: string;
  readonly caller: Caller;
}

export interface ProgramRig {
  readonly store: Store;
  readonly env: ProgramEnv;
  readonly service: AutomationPrograms;
  readonly programs: AutomationProgramsRepository;
  readonly revisions: AutomationRevisionsRepository;
  readonly functions: AutomationFunctionsRepository;
  readonly database: DatabaseSync;
  readonly owner: Person;
  readonly member: Person;
  readonly lamp: DeviceRow;
  readonly computer: DeviceRow;
  readonly secretIds: string[];
  readonly refusedTools: string[];
  readonly addPhone: (person: Person, name: string) => DeviceRow;
  readonly close: () => void;
}

const NOW = new Date('2026-10-18T09:00:00.000Z');

function composeStore(context: StoreContext, feed: ChangeFeed): Store {
  const log = testLogger('store');
  const settings = new SettingsRepository(context);
  settings.ensure();
  return {
    feed,
    settings,
    ledger: new Ledger(context, () => settings.read().time_zone),
    now: () => NOW,
    ...homeRepositories(context, log),
    ...computerRepositories(context),
    ...automationRepositories(context),
    ...healthRepositories(context),
    ...assistantRepositories(context),
    ...peopleRepositories(context),
    ...platformRepositories(context),
    write: (work) => context.write(work),
    durableWrite: (work) => durableSessionWrite(context, work),
    close: (): void => undefined,
  };
}

function personOf(store: Store, name: string, role: 'owner' | 'member'): Person {
  const profile = role === 'owner' ? store.profiles.first() : store.profiles.create({ name });
  const client = store.clients.create({
    name: `${name} phone`,
    platform: 'android',
    role,
    tokenHash: hashClientToken(createClientToken()),
    profileId: profile.id,
  });
  return { client, profileId: profile.id, caller: { kind: 'client', client } };
}

function deviceOf(store: Store, kind: 'light' | 'computer', name: string): DeviceRow {
  const [device] = store.devices.upsert([
    {
      provider: 'local',
      externalId: randomUUID(),
      parentId: null,
      kind,
      name,
      model: 'm',
      manufacturer: 'Test',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (device === undefined) throw new Error(`The test ${kind} was not saved.`);
  return device;
}

interface Opened {
  readonly database: DatabaseSync;
  readonly context: StoreContext;
  readonly store: Store;
}

function opened(): Opened {
  const database = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true });
  const sql = new Sql(database);
  migrate(sql, MIGRATIONS, NOW.toISOString(), testLogger());
  const feed = new ChangeFeed(testLogger('store'));
  const context = new StoreContext(sql, feed, () => NOW);
  return { database, context, store: composeStore(context, feed) };
}

function envOf(
  { context, store }: Opened,
  functions: AutomationFunctionsRepository,
  secretIds: readonly string[],
  refusedTools: readonly string[],
): ProgramEnv {
  return {
    store,
    programs: new AutomationProgramsRepository(context),
    revisions: new AutomationRevisionsRepository(context),
    functions,
    plans: new AutomationPlansRepository(context),
    secrets: {
      list: () => secretIds.map((id) => ({ id, name: id, createdAt: '', updatedAt: '' })),
    },
    tools: {
      pluginTurnRefusal: (name) =>
        refusedTools.includes(name)
          ? new PluginTurnRefusedError(name, 'refused in the test')
          : null,
    },
  };
}

export function programRig(): ProgramRig {
  const home = opened();
  const { store, database } = home;
  const secretIds: string[] = [];
  const refusedTools: string[] = [];
  const functions = new AutomationFunctionsRepository(home.context);
  const env = envOf(home, functions, secretIds, refusedTools);
  return {
    store,
    env,
    service: automationPrograms(env),
    programs: env.programs,
    revisions: env.revisions,
    functions,
    database,
    owner: personOf(store, 'Owner', 'owner'),
    member: personOf(store, 'Member', 'member'),
    lamp: deviceOf(store, 'light', 'Lamp'),
    computer: deviceOf(store, 'computer', 'Desk'),
    secretIds,
    refusedTools,
    addPhone: (person, name) =>
      addPhoneDevice(
        { store, directory: '', close: () => Promise.resolve() },
        { clientId: person.client.id, profileId: person.profileId, name },
      ).device,
    close: (): void => {
      database.close();
    },
  };
}

export const lit = (value: JsonValue): PortValue => ({ lit: value });

export function step(
  key: string,
  kind: string,
  ports: Record<string, PortValue>,
  extra: Partial<FlowNode> = {},
): FlowNode {
  return { id: randomUUID(), key, kind, ports, ...extra };
}

export function setPower(key: string, deviceId: string, control = 'power'): FlowNode {
  return step(key, 'device.set', {
    target: lit({ device: deviceId }),
    control: lit(control),
    to: lit(true),
  });
}

export function logLine(key: string, message: string): FlowNode {
  return step(key, 'debug.log', { message: lit(message) });
}

export function trigger(
  key: string,
  kind: string,
  ports: Record<string, PortValue> = {},
): TriggerNode {
  return { id: randomUUID(), key, kind, ports };
}

export function automationOf(
  body: readonly FlowNode[],
  extra: Partial<AutomationV3> = {},
): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [...body] },
    policy: { mode: 'single' },
    ...extra,
  };
}
