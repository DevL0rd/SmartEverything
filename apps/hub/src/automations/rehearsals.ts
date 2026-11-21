import { ApiError, AUTOMATION_RUN_ID, JSON_VALUE } from '@smarteverything/domain';
import type { AutomationRunRehearsal, JsonValue, RunNodeRecord } from '@smarteverything/domain';
import type { StepRecord } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { Clock } from '../clock';
import type { Rehearsals, RehearsalRequest } from '../server/handlers/automation-runs';
import { previewOfPorts } from '../store/repositories/automation-run-nodes';
import type { DriverPorts } from './driver/ports';
import { rehearsalOf } from './engine-v3-rehearsal';
import type { Rehearsal, RehearsalSource } from './engine-v3-rehearsal';
import type { Subject } from './engine-v3-start';
import { DryRun } from './sim/dry-run';
import type { BreakpointHit } from './sim/breakpoints';
import type { WouldSend } from './sim/effects-sim';
import type { RunReport, SimStart } from './sim/rig';
import { Simulation } from './sim/simulation';
import type { WorldReadDeps } from './world-v3/deps';

export interface RehearsalPorts {
  readonly clock: Clock;
  readonly base: WorldReadDeps;
  readonly watch: DriverPorts['watch'];
  readonly subjectOf: (automationId: string) => Promise<Subject | undefined>;
  readonly heldSubject: (automationId: string) => Subject | undefined;
  readonly zone: () => string;
}

interface Played {
  readonly outcome: AutomationRunRehearsal['outcome'];
  readonly now: string | null;
  readonly runs: readonly RunReport[];
  readonly commands: readonly WouldSend[];
  readonly records: readonly StepRecord[];
  readonly paused: readonly BreakpointHit[];
  readonly steps: number;
}

const PREVIEW = z.record(z.string(), JSON_VALUE);

function previewOf(value: JsonValue): z.infer<typeof PREVIEW> {
  return PREVIEW.parse(previewOfPorts({ value: { value, type: { t: 'any' } } }).preview);
}

type NodeStep = Extract<StepRecord, { kind: 'node' }>;

class NodeLedger {
  private readonly nodes: RunNodeRecord[] = [];
  private readonly open = new Map<string, number>();

  constructor(
    private readonly runId: string,
    private readonly nodeIds: ReadonlyMap<string, string>,
    private readonly at: string,
  ) {}

  get records(): readonly RunNodeRecord[] {
    return this.nodes;
  }

  add(step: StepRecord): void {
    if (step.kind === 'note') return;
    const nodeId = this.nodeIds.get(step.node);
    if (nodeId === undefined) return;
    if (step.kind === 'capture') this.capture(step.activation, step.value);
    else this.node(step, nodeId);
  }

  private capture(activation: string, value: JsonValue): void {
    const index = this.open.get(activation);
    const kept = index === undefined ? undefined : this.nodes[index];
    if (index !== undefined && kept !== undefined) {
      this.nodes[index] = { ...kept, output_preview: previewOf(value) };
    }
  }

  private node(step: NodeStep, nodeId: string): void {
    const settled = step.status !== 'running' && step.status !== 'waiting';
    const index = this.open.get(step.activation);
    const kept = index === undefined ? undefined : this.nodes[index];
    if (index !== undefined && kept !== undefined && settled) {
      this.nodes[index] = {
        ...kept,
        status: step.status,
        finished_at: this.at,
        duration_ms: 0,
        ...(step.outputs === undefined ? {} : { output_preview: previewOf(step.outputs) }),
      };
      this.open.delete(step.activation);
      return;
    }
    if (!settled) this.open.set(step.activation, this.nodes.length);
    this.nodes.push(this.created(step, nodeId, settled));
  }

  private created(step: NodeStep, nodeId: string, settled: boolean): RunNodeRecord {
    return {
      run_id: AUTOMATION_RUN_ID.parse(this.runId),
      seq: this.nodes.length,
      path: step.activation,
      node_id: nodeId,
      iteration: 0,
      status: step.status,
      started_at: this.at,
      finished_at: settled ? this.at : null,
      duration_ms: settled ? 0 : null,
      input_preview: null,
      output_preview: step.outputs === undefined ? null : previewOf(step.outputs),
      truncated: false,
      error: step.error ?? null,
      command_ids: [],
      late: false,
    };
  }
}

function nodesOf(
  records: readonly StepRecord[],
  runId: string,
  nodeIds: ReadonlyMap<string, string>,
  at: string,
): readonly RunNodeRecord[] {
  const ledger = new NodeLedger(runId, nodeIds, at);
  for (const step of records) ledger.add(step);
  return ledger.records;
}

function sourceFrom(
  ports: RehearsalPorts,
  subject: Subject | undefined,
  source: Omit<RehearsalSource, 'zone' | 'kinds'>,
): Rehearsal | undefined {
  return subject === undefined
    ? undefined
    : rehearsalOf(subject, { ...source, zone: ports.zone, kinds: ports.base.kinds });
}

async function requireSource(ports: RehearsalPorts, request: RehearsalRequest): Promise<Rehearsal> {
  const { inputs, startedBy, trigger } = request;
  const source = sourceFrom(ports, await ports.subjectOf(request.automationId), {
    given: inputs,
    startedBy,
    trigger,
  });
  if (source === undefined) throw new ApiError('not_found', 'There is no such automation.');
  return source;
}

function childOf(
  ports: RehearsalPorts,
  request: RehearsalRequest,
): (automationId: string) => SimStart | undefined {
  return (automationId) =>
    sourceFrom(ports, ports.heldSubject(automationId), { given: {}, startedBy: request.startedBy })
      ?.start;
}

async function dryRun(
  ports: RehearsalPorts,
  request: RehearsalRequest,
  source: Rehearsal,
): Promise<Played> {
  const dry = new DryRun({
    live: { clock: ports.clock, watch: ports.watch, base: ports.base },
    start: source.start,
    overrides: request.overrides,
    breakpoints: request.breakpoints,
    child: childOf(ports, request),
  });
  const report = await dry.finished();
  return {
    outcome: report.run.status,
    now: null,
    runs: [report.run],
    commands: report.commands,
    records: report.records,
    paused: report.paused,
    steps: report.run.steps,
  };
}

async function simulation(
  ports: RehearsalPorts,
  request: RehearsalRequest,
  source: Rehearsal,
): Promise<Played> {
  if (request.scenario === undefined) {
    throw new ApiError('invalid_request', 'A simulation needs a scenario.');
  }
  const report = await new Simulation({
    scenario: request.scenario,
    base: ports.base,
    start: source.start,
    child: childOf(ports, request),
    breakpoints: request.breakpoints,
  }).run();
  const root = report.runs[0];
  return {
    outcome: report.status === 'finished' ? (root?.status ?? 'idle') : report.status,
    now: report.now,
    runs: report.runs,
    commands: report.commands,
    records: report.records,
    paused: report.paused,
    steps: report.steps,
  };
}

export function rehearsals(ports: RehearsalPorts): Rehearsals {
  return {
    run: async (request): Promise<AutomationRunRehearsal> => {
      const source = await requireSource(ports, request);
      const played =
        request.mode === 'dry'
          ? await dryRun(ports, request, source)
          : await simulation(ports, request, source);
      const root = played.runs[0];
      const { nodeIds } = source;
      return {
        outcome: played.outcome,
        error: root?.error ?? null,
        now: played.now,
        steps: played.steps,
        run: null,
        nodes:
          root === undefined
            ? []
            : [...nodesOf(played.records, root.runId, nodeIds, ports.clock.now().toISOString())],
        commands: played.commands.map((sent) => ({ ...sent, targets: [...sent.targets] })),
        paused: played.paused.map((hit) => ({
          runId: hit.runId,
          nodeId: hit.nodeId,
          path: hit.path,
        })),
        outputs: null,
      };
    },
  };
}
