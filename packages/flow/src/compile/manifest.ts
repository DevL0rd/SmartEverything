import type {
  FlowType,
  InputPortDecl,
  JsonValue,
  NodeKind,
  PortValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Plan, PlanOp } from './plan';
import type { At, PlanPorts } from './plan-parts';
import type { BUDGET_CLASS } from './plan-parts';
import { TEXT } from './plan-parts';

export const REF_SLOTS = [
  'device',
  'room',
  'group',
  'scene',
  'person',
  'computer',
  'phone',
  'camera',
  'chat',
  'value',
  'automation',
  'function',
  'secret',
] as const;

export const MANIFEST_SLOTS = [...REF_SLOTS, 'control', 'tool', 'host'] as const;

export type ManifestSlot = (typeof MANIFEST_SLOTS)[number];

export const MANIFEST_BUDGETS = ['command', 'effects', 'effects_person'] as const;

export type ManifestBudget = (typeof MANIFEST_BUDGETS)[number];

const IDS = z.array(TEXT);

export const MANIFEST = z.strictObject({
  uses: z.record(z.enum(MANIFEST_SLOTS), IDS),
  dynamic: z.array(z.enum(MANIFEST_SLOTS)),
  budgets: z.array(z.enum(MANIFEST_BUDGETS)),
  ai: z.boolean(),
  owner: z.boolean(),
  missing: IDS,
});

export type Manifest = z.infer<typeof MANIFEST>;

export type ManifestKind = Pick<NodeKind, 'id' | 'inputs' | 'access'>;

export type ManifestKinds = (id: string) => ManifestKind | undefined;

export interface CalleeRef {
  readonly fn: string;
  readonly pin: number | undefined;
}

export type ResolvePlan = (callee: CalleeRef) => Plan | undefined;

export interface OpPorts {
  readonly at: At;
  readonly kind: string;
  readonly ports: PlanPorts;
}

export interface Closure {
  readonly plans: readonly Plan[];
  readonly missing: readonly string[];
}

export const AI_KIND = 'ai.wake';
export const HTTP_KIND = 'http.request';
export const HTTP_URL_PORT = 'url';

const TARGET_SLOTS: readonly ManifestSlot[] = ['device', 'room', 'group'];

const TARGET_KEYS: Readonly<Record<string, ManifestSlot>> = {
  device: 'device',
  devices: 'device',
  room: 'room',
  group: 'group',
};

const OPTION_SLOTS: Readonly<Record<string, ManifestSlot>> = {
  'device.controls': 'control',
  'device.operations': 'control',
  tools: 'tool',
};

function present(op: PlanOp | undefined): readonly PlanOp[] {
  return op === undefined ? [] : [op];
}

function branching(op: PlanOp): readonly PlanOp[] {
  if (op.op === 'branch') return [...op.rows.map((row) => row.then), ...present(op.else)];
  if (op.op === 'switch') return [...op.cases.map((row) => row.then), ...present(op.default)];
  if (op.op === 'try') {
    return [op.body, ...op.catches.map((row) => row.then), ...present(op.finally)];
  }
  return [];
}

export function childOps(op: PlanOp): readonly PlanOp[] {
  if (op.op === 'seq') return op.ops;
  if (op.op === 'loop' || op.op === 'with_effect') return [op.body];
  if (op.op === 'parallel') return op.branches.map((branch) => branch.body);
  if (op.op === 'state_op' || op.op === 'wait') return Object.values(op.scopes ?? {});
  return branching(op);
}

export function walkOps(root: PlanOp): readonly PlanOp[] {
  return [root, ...childOps(root).flatMap(walkOps)];
}

export function planOps(plan: Plan): readonly PlanOp[] {
  return [plan.body, ...(plan.onFailure === undefined ? [] : [plan.onFailure])].flatMap(walkOps);
}

export function kindOf(kinds: ManifestKinds, id: string): ManifestKind {
  const kind = kinds(id);
  if (kind === undefined) throw new Error(`no node kind is called "${id}"`);
  return kind;
}

export const ASK_KIND = 'notify.ask';

export function portsOf(op: PlanOp): OpPorts | undefined {
  if (op.op === 'wait' && op.wait.kind === 'answer') {
    return {
      at: op.at,
      kind: ASK_KIND,
      ports: { person: op.wait.person, question: op.wait.question },
    };
  }
  if (op.op === 'effect' || op.op === 'with_effect')
    return { at: op.at, kind: op.kind, ports: op.params };
  if (op.op === 'read' || op.op === 'state_op' || op.op === 'compute') {
    return { at: op.at, kind: op.kind, ports: op.ports };
  }
  return undefined;
}

export function calleeLabel(callee: CalleeRef): string {
  return `${callee.fn}@${callee.pin === undefined ? 'latest' : String(callee.pin)}`;
}

export function callsIn(plan: Plan): readonly CalleeRef[] {
  const found = new Map<string, CalleeRef>();
  for (const op of planOps(plan)) {
    if (op.op === 'call') {
      const callee = { fn: op.fn, pin: op.pin };
      found.set(calleeLabel(callee), callee);
    }
  }
  return [...found.values()];
}

export function closureOf(plan: Plan, resolve: ResolvePlan): Closure {
  const seen = new Set<string>();
  const plans: Plan[] = [plan];
  const missing = new Set<string>();
  const visit = (current: Plan): void => {
    for (const callee of callsIn(current)) {
      const label = calleeLabel(callee);
      if (seen.has(label)) continue;
      seen.add(label);
      const resolved = resolve(callee);
      if (resolved === undefined) {
        missing.add(callee.fn);
      } else {
        plans.push(resolved);
        visit(resolved);
      }
    }
  };
  visit(plan);
  return { plans, missing: [...missing].sort() };
}

interface Draft {
  readonly uses: Map<ManifestSlot, Set<string>>;
  readonly dynamic: Set<ManifestSlot>;
  readonly budgets: Set<ManifestBudget>;
  readonly missing: Set<string>;
  readonly flags: Set<'ai' | 'owner'>;
}

function draftOf(): Draft {
  return {
    uses: new Map(),
    dynamic: new Set(),
    budgets: new Set(),
    missing: new Set(),
    flags: new Set(),
  };
}

function idsOf(draft: Draft, slot: ManifestSlot): Set<string> {
  const held = draft.uses.get(slot);
  if (held !== undefined) return held;
  const created = new Set<string>();
  draft.uses.set(slot, created);
  return created;
}

function isRecord(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isList(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function addIds(draft: Draft, slot: ManifestSlot, value: JsonValue | undefined): void {
  if (typeof value === 'string') idsOf(draft, slot).add(value);
  else if (isList(value)) for (const item of value) addIds(draft, slot, item);
}

function addTarget(draft: Draft, value: JsonValue): void {
  if (!isRecord(value)) return;
  for (const [key, slot] of Object.entries(TARGET_KEYS)) addIds(draft, slot, value[key]);
}

function addEntries(
  draft: Draft,
  type: Extract<FlowType, { t: 'record' }>,
  record: Readonly<Record<string, JsonValue>>,
): void {
  for (const [key, item] of Object.entries(record)) {
    const fieldType = type.fields?.[key] ?? type.values;
    if (fieldType !== undefined) addTyped(draft, fieldType, item);
  }
}

function addTyped(draft: Draft, type: FlowType, value: JsonValue): void {
  if (type.t === 'ref') {
    if (type.of === 'target') addTarget(draft, value);
    else addIds(draft, type.of, value);
  } else if (type.t === 'optional') {
    addTyped(draft, type.of, value);
  } else if (type.t === 'list' && isList(value)) {
    for (const item of value) addTyped(draft, type.of, item);
  } else if (type.t === 'record' && isRecord(value)) {
    addEntries(draft, type, value);
  }
}

function slotsIn(type: FlowType): readonly ManifestSlot[] {
  if (type.t === 'ref') return type.of === 'target' ? TARGET_SLOTS : [type.of];
  if (type.t === 'optional' || type.t === 'list') return slotsIn(type.of);
  if (type.t !== 'record') return [];
  return [
    ...Object.values(type.fields ?? {}).flatMap(slotsIn),
    ...(type.values === undefined ? [] : slotsIn(type.values)),
  ];
}

function directSlot(kindId: string, decl: InputPortDecl): ManifestSlot | undefined {
  if (kindId === HTTP_KIND && decl.name === HTTP_URL_PORT) return 'host';
  return OPTION_SLOTS[decl.ui?.optionsFrom ?? ''];
}

function addHost(draft: Draft, text: string): void {
  const url = URL.canParse(text) ? new URL(text) : undefined;
  if (url !== undefined && url.host !== '' && /^https?:$/.test(url.protocol)) {
    idsOf(draft, 'host').add(url.host);
  } else draft.dynamic.add('host');
}

function addDirect(draft: Draft, slot: ManifestSlot, value: JsonValue): void {
  if (slot === 'host') addHost(draft, typeof value === 'string' ? value : '');
  else addIds(draft, slot, value);
}

function scanPort(draft: Draft, kindId: string, decl: InputPortDecl, value: PortValue): void {
  const direct = directSlot(kindId, decl);
  if ('lit' in value) {
    addTyped(draft, decl.type, value.lit);
    if (direct !== undefined) addDirect(draft, direct, value.lit);
    return;
  }
  for (const slot of slotsIn(decl.type)) draft.dynamic.add(slot);
  if (direct !== undefined) draft.dynamic.add(direct);
}

function scanKind(draft: Draft, kinds: ManifestKinds, kindId: string, ports: PlanPorts): void {
  const kind = kindOf(kinds, kindId);
  if (kind.id === AI_KIND) draft.flags.add('ai');
  if (kind.access === 'owner') draft.flags.add('owner');
  for (const decl of kind.inputs) {
    const given = ports[decl.name];
    const value = given ?? (decl.default === undefined ? undefined : { lit: decl.default });
    if (value !== undefined) scanPort(draft, kind.id, decl, value);
  }
}

function resolveBudget(
  budget: z.infer<typeof BUDGET_CLASS>,
  durable: boolean,
): ManifestBudget | undefined {
  if (budget === 'none') return undefined;
  if (budget === 'effects_if_durable') return durable ? 'effects' : undefined;
  return budget;
}

function scanBudget(draft: Draft, op: PlanOp): void {
  const budget =
    op.op === 'effect' || op.op === 'with_effect'
      ? resolveBudget(op.budget, true)
      : op.op === 'set_var'
        ? resolveBudget(op.budget, op.source !== 'run')
        : op.op === 'wait' && op.wait.kind === 'answer'
          ? 'effects_person'
          : undefined;
  if (budget !== undefined) draft.budgets.add(budget);
}

function scanOp(draft: Draft, kinds: ManifestKinds, op: PlanOp): void {
  const owned = portsOf(op);
  if (owned !== undefined) scanKind(draft, kinds, owned.kind, owned.ports);
  if (op.op === 'call') idsOf(draft, 'function').add(op.fn);
  if (op.op === 'run') idsOf(draft, 'automation').add(op.automation);
  if (op.op === 'set_var' && op.source === 'home') addIds(draft, 'value', op.value);
  scanBudget(draft, op);
}

function sorted<T extends string>(values: ReadonlySet<T>): T[] {
  return [...values].sort();
}

function finish(draft: Draft): Manifest {
  return MANIFEST.parse({
    uses: Object.fromEntries(MANIFEST_SLOTS.map((slot) => [slot, sorted(idsOf(draft, slot))])),
    dynamic: sorted(draft.dynamic),
    budgets: sorted(draft.budgets),
    ai: draft.flags.has('ai'),
    owner: draft.flags.has('owner'),
    missing: sorted(draft.missing),
  });
}

export function manifestOf(plan: Plan, kinds: ManifestKinds, resolve: ResolvePlan): Manifest {
  const draft = draftOf();
  const closure = closureOf(plan, resolve);
  for (const member of closure.plans) {
    for (const op of planOps(member)) scanOp(draft, kinds, op);
  }
  for (const fn of closure.missing) draft.missing.add(fn);
  return finish(draft);
}
