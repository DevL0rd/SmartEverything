import { z } from 'zod';
import {
  COMPUTER_AI_RUNTIME,
  harnessTargetKey,
  type AiHarnessCatalogue,
  type AiHarnessHost,
  type AiHarnessTarget,
  type AiModelRoute,
  type ComputerAiRuntime,
} from '@smarteverything/domain';
import { harnessHostReason } from '../../model/harness-context';
import { COMPUTER_ENGINE_LABELS } from '../../provider/computer-engine';
import type { EngineCatalogue, EngineComputer } from '../../provider/engine-catalogue';

export const HUB_SOURCE = 'server';
const HUB_NAME = 'Home Hub';
const HUB_LABEL = 'Home Hub · OpenRouter';
const OFFLINE_NOTE = 'offline';

type Plan = 'anthropic' | 'openai';

const PLAN_NAMES: Readonly<Record<Plan, string>> = {
  anthropic: 'Claude plan',
  openai: 'ChatGPT plan',
};

const RUNTIME_PLAN: Readonly<Record<ComputerAiRuntime, Plan>> = {
  claude: 'anthropic',
  codex: 'openai',
};

type SourceHealth = 'live' | 'offline' | 'attention';

export interface LibrarySource {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly kind: 'hub' | 'machine' | 'plan';
  readonly health: SourceHealth;
  readonly note: string | null;
}

export interface SourceFacts {
  readonly harness: AiHarnessCatalogue | undefined;
  readonly engines: EngineCatalogue | undefined;
  readonly owner: boolean;
}

export function sourceChipLabel(source: LibrarySource): string {
  return source.note === null ? source.label : `${source.label} · ${source.note}`;
}

function machineId(target: AiHarnessTarget): string {
  return target.kind === 'server' ? HUB_SOURCE : `device:${target.device_id}`;
}

function planId(plan: Plan): string {
  return `plan:${plan}`;
}

interface Machine {
  readonly id: string;
  readonly name: string;
  readonly online: boolean;
  readonly problem: string | null;
}

function hostMachine(host: AiHarnessHost): Machine {
  return {
    id: machineId(host.target),
    name: host.target.kind === 'server' ? HUB_NAME : host.name,
    online: host.online,
    problem: harnessHostReason(host),
  };
}

function computerMachine(computer: EngineComputer): Machine {
  return {
    id: `device:${computer.device_id}`,
    name: computer.name,
    online: computer.online,
    problem: computer.reason,
  };
}

function machinesOf(facts: SourceFacts): readonly Machine[] {
  const known = new Map<string, Machine>();
  for (const host of facts.harness?.hosts ?? [])
    known.set(machineId(host.target), hostMachine(host));
  for (const computer of facts.engines?.computers ?? []) {
    const machine = computerMachine(computer);
    const previous = known.get(machine.id);
    known.set(machine.id, previous ?? machine);
  }
  return [...known.values()];
}

function machineSource(machine: Machine): LibrarySource {
  const hub = machine.id === HUB_SOURCE;
  const health: SourceHealth = !machine.online
    ? 'offline'
    : machine.problem === null
      ? 'live'
      : 'attention';
  return {
    id: machine.id,
    name: machine.name,
    label: hub ? HUB_LABEL : machine.name,
    kind: hub ? 'hub' : 'machine',
    health,
    note: health === 'offline' ? OFFLINE_NOTE : null,
  };
}

function planFailure(routes: readonly AiModelRoute[]): string | null {
  if (routes.length === 0 || routes.some((route) => route.state === 'ready')) return null;
  const failed = routes.find((route) => route.state === 'unavailable');
  return failed?.state === 'unavailable' && failed.failure.code === 'subscription_unavailable'
    ? 'signed out'
    : 'unavailable';
}

function planSource(plan: Plan, facts: SourceFacts): LibrarySource | null {
  const routes = (facts.harness?.routes ?? []).filter((route) => route.auth.provider === plan);
  const installed = (facts.engines?.computers ?? []).some(
    (computer) => RUNTIME_PLAN[computer.runtime] === plan,
  );
  if (routes.length === 0 && !installed) return null;
  const note = planFailure(routes);
  return {
    id: planId(plan),
    name: PLAN_NAMES[plan],
    label: PLAN_NAMES[plan],
    kind: 'plan',
    health: note === null ? 'live' : 'attention',
    note,
  };
}

export function librarySources(facts: SourceFacts): readonly LibrarySource[] {
  const machines = machinesOf(facts).map(machineSource);
  const hub = machines.find((source) => source.kind === 'hub') ?? {
    id: HUB_SOURCE,
    name: HUB_NAME,
    label: HUB_LABEL,
    kind: 'hub' as const,
    health: 'live' as const,
    note: null,
  };
  const computers = machines.filter((source) => source.kind === 'machine');
  const plans = (['anthropic', 'openai'] as const).flatMap((plan) => {
    const source = planSource(plan, facts);
    return source === null ? [] : [source];
  });
  return [hub, ...computers, ...plans];
}

const NATIVE_KEY = z.tuple([COMPUTER_AI_RUNTIME, z.string()]);

type KeyedCandidate =
  | { readonly kind: 'route'; readonly routeId: string }
  | { readonly kind: 'computer'; readonly runtime: ComputerAiRuntime; readonly model: string }
  | { readonly kind: 'catalogue' };

function keyedCandidate(key: string): KeyedCandidate {
  if (key.startsWith('dsh:')) return { kind: 'route', routeId: key.split(':')[1] ?? '' };
  if (!key.startsWith('[')) return { kind: 'catalogue' };
  const parsed = NATIVE_KEY.safeParse(JSON.parse(key));
  return parsed.success
    ? { kind: 'computer', runtime: parsed.data[0], model: parsed.data[1] }
    : { kind: 'catalogue' };
}

export function isNativeKey(key: string): boolean {
  return keyedCandidate(key).kind === 'computer';
}

export interface CandidateWhere {
  readonly sources: readonly string[];
  readonly line: string | null;
  readonly blame: string;
  readonly ready: boolean;
}

function routeWhere(route: AiModelRoute | undefined, facts: SourceFacts): CandidateWhere {
  if (route === undefined)
    return { sources: [], line: null, blame: 'This model is no longer offered.', ready: false };
  const host = facts.harness?.hosts.find(
    (row) => harnessTargetKey(row.target) === harnessTargetKey(route.supplier),
  );
  const name = route.supplier.kind === 'server' ? HUB_NAME : (host?.name ?? 'Machine unavailable');
  const plan = route.auth.provider === 'openrouter' ? null : route.auth.provider;
  return {
    sources: [machineId(route.supplier), ...(plan === null ? [] : [planId(plan)])],
    line: `${plan === null ? 'OpenRouter' : PLAN_NAMES[plan]} on ${name}`,
    blame: routeBlame(route, host, name),
    ready: route.state !== 'unavailable',
  };
}

function routeBlame(route: AiModelRoute, host: AiHarnessHost | undefined, name: string): string {
  if (route.state === 'unavailable') return route.failure.message;
  if (host === undefined) return `${name} isn’t available.`;
  if (!host.online) return `${name} is offline`;
  return harnessHostReason(host) ?? 'Not available for this chat’s machine.';
}

function supplies(
  runtime: ComputerAiRuntime,
  model: string,
  facts: SourceFacts,
): readonly EngineComputer[] {
  return (facts.engines?.computers ?? []).filter(
    (computer) => computer.runtime === runtime && computer.models.some((row) => row.id === model),
  );
}

function computerReady(computer: EngineComputer): boolean {
  return computer.online && computer.enabled && computer.reason === null;
}

function computerBlame(
  computers: readonly EngineComputer[],
  model: string,
  facts: SourceFacts,
): string {
  if (!facts.owner) return 'Only the owner can use models on their computers.';
  const first = computers[0];
  if (first === undefined) return 'No computer offers this model.';
  if (!first.online) return `${first.name} is offline`;
  if (!first.enabled) return `${first.name} is turned off`;
  if (first.reason !== null) return first.reason;
  return first.models.some((row) => row.id === model && !row.available)
    ? `Not available on ${first.name}`
    : 'Not available right now.';
}

function computerWhere(
  runtime: ComputerAiRuntime,
  model: string,
  facts: SourceFacts,
): CandidateWhere {
  const computers = supplies(runtime, model, facts);
  const names = computers.map((computer) => computer.name).join(', ');
  const label = COMPUTER_ENGINE_LABELS[runtime].name;
  return {
    sources: [
      ...computers.map((computer) => `device:${computer.device_id}`),
      planId(RUNTIME_PLAN[runtime]),
    ],
    line: names === '' ? label : `${label} on ${names}`,
    blame: computerBlame(computers, model, facts),
    ready: computers.some(computerReady),
  };
}

export function candidateWhere(
  key: string,
  supplier: string | undefined,
  facts: SourceFacts,
): CandidateWhere {
  const keyed = keyedCandidate(key);
  if (keyed.kind === 'route') {
    return routeWhere(
      facts.harness?.routes.find((route) => route.id === keyed.routeId),
      facts,
    );
  }
  if (keyed.kind === 'computer') return computerWhere(keyed.runtime, keyed.model, facts);
  return {
    sources: [HUB_SOURCE],
    line: `${supplier ?? 'OpenRouter'} on ${HUB_NAME}`,
    blame: 'Not offered by Home Hub or your computers.',
    ready: true,
  };
}

export function matchesSources(
  rowSources: readonly string[],
  selected: ReadonlySet<string>,
): boolean {
  return selected.size === 0 || rowSources.some((id) => selected.has(id));
}
