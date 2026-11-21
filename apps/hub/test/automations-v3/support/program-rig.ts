import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import {
  createClientToken,
  hashClientToken,
  type AutomationV3,
  type AutomationV4,
  type ClientRow,
  type DeviceRow,
  type FlowNode,
  type JsonValue,
  type PortValue,
  type TriggerNode,
} from '@smarteverything/domain';
import type { AutomationPrograms } from '../../../src/automations/service-programs';
import { automationPrograms } from '../../../src/automations/service-programs';
import { createKindCatalog } from '../../../src/automations/plugin-kinds/catalog';
import type { ProgramEnv } from '../../../src/automations/service-programs';
import { PluginTurnRefusedError } from '../../../src/ai-tools/plugin-turn';
import type { Caller } from '../../../src/server/auth';
import { AutomationFunctionsRepository } from '../../../src/store/repositories/automation-functions';
import { AutomationPlansRepository } from '../../../src/store/repositories/automation-plans';
import { AutomationProgramsRepository } from '../../../src/store/repositories/automation-programs';
import { AutomationRevisionsRepository } from '../../../src/store/repositories/automation-revisions';
import { openSeededStore, type SeededStore } from '../../support/store';
import type { StoreContext } from '../../../src/store/context';
import { testLogger } from '../../support/logs';
import { testStoreHost } from '../../support/store-host';
import { graphAutomation } from './graph-of';
import { addPhoneDevice } from '../../support/phone-fixtures';
import { hubLayout } from '../../../src/data-layout';

interface Person {
  readonly client: ClientRow;
  readonly profileId: string;
  readonly caller: Caller;
}

export interface ProgramRig {
  readonly store: SeededStore;
  readonly env: ProgramEnv;
  readonly service: AutomationPrograms;
  readonly programs: AutomationProgramsRepository;
  readonly revisions: AutomationRevisionsRepository;
  readonly functions: AutomationFunctionsRepository;
  readonly plans: AutomationPlansRepository;
  readonly database: DatabaseSync;
  readonly owner: Person;
  readonly member: Person;
  readonly lamp: DeviceRow;
  readonly computer: DeviceRow;
  readonly secretIds: string[];
  readonly refusedTools: string[];
  readonly addPhone: (person: Person, name: string) => DeviceRow;
  readonly close: () => Promise<void>;
}

export const RIG_NOW = new Date('2026-10-18T09:00:00.000Z');

function personOf(store: SeededStore, name: string, role: 'owner' | 'member'): Person {
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

function deviceOf(store: SeededStore, kind: 'light' | 'computer', name: string): DeviceRow {
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
  readonly directory: string;
  readonly database: DatabaseSync;
  readonly context: StoreContext;
  readonly store: SeededStore;
}

async function opened(): Promise<Opened> {
  const directory = mkdtempSync(join(tmpdir(), 'hub-program-rig-'));
  const store = await openSeededStore({
    host: testStoreHost(),
    path: join(directory, 'test.db'),
    log: testLogger('store'),
    now: () => RIG_NOW,
    systemTimeZone: 'UTC',
    driveFolders: null,
  });
  return { directory, database: store.database, context: store.context, store };
}

function envOf(
  { store }: Opened,
  secretIds: readonly string[],
  refusedTools: readonly string[],
): ProgramEnv {
  return {
    store,
    kinds: createKindCatalog(),
    engine: {
      retire: () => Promise.resolve(),
      functionsChanged: () => Promise.resolve(),
      settled: () => Promise.resolve(),
    },
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

export async function programRig(): Promise<ProgramRig> {
  const home = await opened();
  const { store, database, directory } = home;
  const secretIds: string[] = [];
  const refusedTools: string[] = [];
  const env = envOf(home, secretIds, refusedTools);
  return {
    store,
    env,
    service: automationPrograms(env),
    programs: new AutomationProgramsRepository(home.context),
    revisions: new AutomationRevisionsRepository(home.context),
    functions: new AutomationFunctionsRepository(home.context),
    plans: new AutomationPlansRepository(home.context),
    database,
    owner: personOf(store, 'Owner', 'owner'),
    member: personOf(store, 'Member', 'member'),
    lamp: deviceOf(store, 'light', 'Lamp'),
    computer: deviceOf(store, 'computer', 'Desk'),
    secretIds,
    refusedTools,
    addPhone: (person, name) =>
      addPhoneDevice(
        {
          store,
          directory: '',
          layout: hubLayout('/unused', {}),
          close: () => Promise.resolve(),
        },
        { clientId: person.client.id, profileId: person.profileId, name },
      ).device,
    close: async (): Promise<void> => {
      await store.close();
      rmSync(directory, { recursive: true, force: true });
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
): AutomationV4 {
  return graphAutomation(
    {
      version: 3,
      kind: 'automation',
      triggers: [],
      inputs: [],
      outputs: [],
      variables: [],
      body: { nodes: [...body] },
      policy: { mode: 'single' },
      ...extra,
    },
    STATIC_KIND_LOOKUP,
  );
}
