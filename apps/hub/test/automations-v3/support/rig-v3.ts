import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join } from 'node:path';
import {
  SIGNAL_SOURCES,
  kindSpecOf,
  type AutomationRowV3,
  type AutomationRunRecord,
  type AutomationV3,
  type FlowNode,
  type JsonValue,
  type PortValue,
  type SignalInput,
  type TriggerNode,
} from '@smarteverything/domain';
import { assembleEngineV3 } from '../../../src/automations/engine-v3-assembly';
import type { AssembledEngine } from '../../../src/automations/engine-v3-assembly';
import type { EffectHandlers } from '../../../src/automations/engine-v3-effects';
import type { AnswerFeed } from '../../../src/automations/questions/desk';
import { CommandIssuer } from '../../../src/automations/issue-commands';
import { transientNodeMemory } from '../../../src/automations/world-v3/node-memory';
import { seededRandom } from '../../../src/automations/world-v3/random';
import { persistentFromOwned, withKeptData } from '../../../src/automations/world-v3/variables';
import { KeptData } from '../../../src/automations/world-v3/kept-data';
import type { WorldReadDeps } from '../../../src/automations/world-v3/deps';
import { AutomationNodeStateRepository } from '../../../src/store/repositories/automation-node-state';
import { StoreContext } from '../../../src/store/context';
import { ChangeFeed } from '../../../src/store/feed';
import { AutomationFunctionsRepository } from '../../../src/store/repositories/automation-functions';
import { AutomationOwnedValuesRepository } from '../../../src/store/repositories/automation-owned-values';
import { AutomationRunNodesRepository } from '../../../src/store/repositories/automation-run-nodes';
import { AutomationPlansRepository } from '../../../src/store/repositories/automation-plans';
import { AutomationProgramsRepository } from '../../../src/store/repositories/automation-programs';
import { AutomationRunRecordsRepository } from '../../../src/store/repositories/automation-run-records';
import { Sql } from '../../../src/store/sql';
import { SimulatedClock as TestClock } from '../../../src/clock/simulated';
import { closeSetups, NOW, setup } from '../../support/executor-setup';
import { testLogger } from '../../support/logs';
import type { FinishedRun } from '../../../src/automations/driver/ports';
import type { StartedRun } from '../../../src/automations/webhooks/gateway';

export { closeSetups };

export const SECRET_ID = '5ec2e700-0000-4000-8000-000000000001';

export const SECRET_VALUE = 'hunter2-never-stored';

const LAYOUT = { nodes: {}, frames: [], comments: [] };

const PLACEHOLDER_HASH = 'a'.repeat(64);

type Home = Awaited<ReturnType<typeof setup>>;

async function turns(): Promise<void> {
  for (let turn = 0; turn < 30; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

function openV3(home: Home, clock: TestClock): { database: DatabaseSync; context: StoreContext } {
  const database = new DatabaseSync(join(dirname(home.db.recordings), 'test.db'));
  database.exec('pragma busy_timeout = 5000');
  database.exec('pragma foreign_keys = on');
  const feed = new ChangeFeed(testLogger('store'));
  return { database, context: new StoreContext(new Sql(database), feed, () => clock.now()) };
}

export interface RigOptions {
  readonly extraEffects?: EffectHandlers;
  readonly questions?: AnswerFeed;
}

export class RigV3 {
  readonly clock = new TestClock(NOW.toISOString());
  readonly database: DatabaseSync;
  readonly programs: AutomationProgramsRepository;
  readonly records: AutomationRunRecordsRepository;
  readonly plans: AutomationPlansRepository;
  readonly nodes: AutomationRunNodesRepository;
  readonly owned: AutomationOwnedValuesRepository;
  readonly functions: AutomationFunctionsRepository;
  readonly kept: KeptData;
  readonly finished: FinishedRun[] = [];
  readonly wiring: {
    started?: (start: StartedRun) => void;
    timers?: { readonly changed: () => void };
  } = {};
  private readonly issuer: CommandIssuer;
  private readonly subscribers = new Set<(signal: SignalInput) => void>();
  private assembled: AssembledEngine;

  constructor(
    readonly home: Home,
    private readonly options: RigOptions = {},
  ) {
    const { database, context } = openV3(home, this.clock);
    this.database = database;
    this.programs = new AutomationProgramsRepository(context);
    this.records = new AutomationRunRecordsRepository(context, () => undefined);
    this.plans = new AutomationPlansRepository(context);
    this.nodes = new AutomationRunNodesRepository(context);
    this.owned = new AutomationOwnedValuesRepository(context);
    this.functions = new AutomationFunctionsRepository(context);
    this.kept = new KeptData({
      rows: new AutomationNodeStateRepository(context),
      reset: (): void => undefined,
    });
    this.issuer = new CommandIssuer({
      store: home.db.store,
      database: home.db.database,
      executor: home.executor,
      clock: this.clock,
    });
    this.assembled = this.build();
  }

  onStart(listener: (start: StartedRun) => void): void {
    this.wiring.started = listener;
  }

  useTimers(timers: { readonly changed: () => void }): void {
    this.wiring.timers = timers;
  }

  get engine(): AssembledEngine['engine'] {
    return this.assembled.engine;
  }

  add(program: AutomationV3, name = 'Test automation'): AutomationRowV3 {
    return this.programs.create({
      name,
      enabled: true,
      program,
      layout: LAYOUT,
      planHash: PLACEHOLDER_HASH,
      origin: null,
      author: null,
    });
  }

  setEnabled(id: string, enabled: boolean): void {
    this.database
      .prepare('update automations set enabled = ? where id = ?')
      .run(enabled ? 1 : 0, id);
  }

  press(device: string, action: string): void {
    this.engine.observe({
      source: 'event',
      kind: 'button',
      subject: device,
      field: null,
      value: null,
      previous: null,
      at: this.clock.now().toISOString(),
      profileId: null,
      data: { action },
    });
  }

  settle(): Promise<void> {
    return turns();
  }

  async advance(milliseconds: number): Promise<void> {
    this.clock.advanceTo(new Date(this.clock.now().getTime() + milliseconds).toISOString());
    await turns();
  }

  async until(done: () => boolean): Promise<void> {
    for (let round = 0; round < 200 && !done(); round += 1) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
    }
  }

  restart(): void {
    this.assembled.engine.shutdown();
    this.assembled = this.build();
  }

  runs(automationId: string): AutomationRunRecord[] {
    return this.records
      .summaries(automationId, 100)
      .map((summary) => this.records.byId(summary.id))
      .reverse();
  }

  dump(): string {
    return JSON.stringify(
      ['automation_runs', 'automation_run_nodes', 'automation_plans', 'automation_values'].map(
        (table) => this.database.prepare(`select * from ${table}`).all(),
      ),
    );
  }

  world(): WorldReadDeps {
    const { store } = this.home.db;
    return {
      store,
      executor: this.home.executor,
      clock: this.clock,
      observed: (deviceId, capability) => store.state.value(deviceId, capability),
      presence: { people: () => [] },
      persistent: withKeptData(persistentFromOwned(this.owned), this.kept),
      random: seededRandom,
      memory: transientNodeMemory(),
      signals: { latest: () => [] },
    };
  }

  private build(): AssembledEngine {
    const { store } = this.home.db;
    const { executor } = this.home;
    return assembleEngineV3({
      store,
      repositories: {
        programs: this.programs,
        plans: this.plans,
        records: this.records,
        nodes: this.nodes,
        owned: this.owned,
        functions: this.functions,
      },
      clock: this.clock,
      signals: {
        subscribe: (listener) => {
          this.subscribers.add(listener);
          return (): void => {
            this.subscribers.delete(listener);
          };
        },
      },
      watchState: { load: () => null, save: (): void => undefined, retain: (): void => undefined },
      isPulse: (matcher) => kindSpecOf(SIGNAL_SOURCES, matcher)?.pulse === true,
      ...(this.options.extraEffects === undefined
        ? {}
        : { extraEffects: this.options.extraEffects }),
      ...(this.options.questions === undefined ? {} : { questions: this.options.questions }),
      started: (start) => this.wiring.started?.(start),
      timers: { changed: () => this.wiring.timers?.changed() },
      executor,
      issuer: this.issuer,
      secrets: { resolve: (id) => (id === SECRET_ID ? SECRET_VALUE : null) },
      world: this.world(),
      kept: this.kept,
      place: () => ({ timeZone: 'UTC', location: null }),
      zone: () => 'UTC',
      retain: (runId, rows) => {
        store.automationRuns.retainCommands(runId, rows);
      },
      decisions: { record: (): void => undefined },
      recordRun: (run) => this.finished.push(run),
      refused: (): void => undefined,
      storm: (): void => undefined,
    });
  }
}

export function rigV3(options: RigOptions = {}): Promise<RigV3> {
  return setup().then((home) => new RigV3(home, options));
}

export const lit = (value: JsonValue): PortValue => ({ lit: value });

export const wired = (reference: string): PortValue => {
  const [from = '', port = ''] = reference.split('.');
  return { wire: { from, port } };
};

export function node(
  key: string,
  kind: string,
  ports: Record<string, PortValue>,
  extra: Partial<FlowNode> = {},
): FlowNode {
  return { id: randomUUID(), key, kind, ports, ...extra };
}

export type Expectation = readonly (readonly [string, JsonValue | undefined])[];

function fieldWire(key: string, path: string, nodes: FlowNode[]): PortValue {
  const [port = '', ...rest] = path.split('.');
  if (rest.length === 0) return wired(`trigger.${port}`);
  nodes.push(
    node(`${key}Field`, 'object.get', {
      source: wired(`trigger.${port}`),
      path: lit(rest.join('.')),
      default: lit(null),
    }),
  );
  return wired(`${key}Field.value`);
}

function testOf(
  key: string,
  path: string,
  expected: JsonValue | undefined,
  nodes: FlowNode[],
): string {
  const value = fieldWire(key, path, nodes);
  nodes.push(
    expected === undefined
      ? node(key, 'logic.exists', { value, test: lit('is_null') })
      : node(key, 'logic.compare', { a: value, op: lit('eq'), b: lit(expected) }),
  );
  return key;
}

export function triggerChecks(
  expectation: Expectation,
  answers: { readonly yes: number; readonly no: number },
  act: (value: PortValue) => FlowNode,
): FlowNode[] {
  const nodes: FlowNode[] = [];
  const keys = expectation.map(([path, expected], index) =>
    testOf(`check${String(index)}`, path, expected, nodes),
  );
  let last = keys[0] ?? '';
  keys.slice(1).forEach((key, index) => {
    const both = `both${String(index)}`;
    nodes.push(node(both, 'logic.and', { a: wired(`${last}.result`), b: wired(`${key}.result`) }));
    last = both;
  });
  nodes.push(
    node('pick', 'logic.select', {
      condition: wired(`${last}.result`),
      whenTrue: lit(answers.yes),
      whenFalse: lit(answers.no),
    }),
  );
  return [...nodes, act(wired('pick.value'))];
}

export function trigger(kind: string, ports: Record<string, PortValue>): TriggerNode {
  return { id: randomUUID(), key: kind.split('.').at(-1) ?? kind, kind, ports };
}

export function program(
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
