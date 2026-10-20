import { randomUUID } from 'node:crypto';
import { ApiError, RUN_CAUSE } from '@smarteverything/domain';
import type { AutomationRowV3, JsonValue, SignalInput } from '@smarteverything/domain';
import type { EffectRequest, NodeResult } from '@smarteverything/flow/interpret/frames';
import { RUN_AUTOMATION_KIND } from '@smarteverything/flow/interpret/run-automation';
import { resolveBudgets } from '@smarteverything/flow/state/budgets';
import type { CancelReason, RunState } from '@smarteverything/flow/state/run-state';
import { failureLine, Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Cancel } from '../clock';
import { SignalWatchers } from '../signals/signal-watchers';
import { RunDriver } from './driver/admission';
import type { Occurrence, Submission } from './driver/admission';
import { bootRuns } from './driver/boot';
import type { BootReport } from './driver/boot';
import { FeedbackChains, ignoresOwnChange } from './driver/feedback';
import { RunParkStore } from './driver/park-store';
import type { DriverPorts, FinishedRun, RunScope, RunSink, RunStart } from './driver/ports';
import { calledFire, childCall, childOutcome, effectRun, Finishes } from './engine-v3-children';
import type { RunOutputs } from './engine-v3-children';
import { admissionParts } from './engine-v3-admission';
import { armTriggers, listensOnWebhook } from './engine-v3-triggers';
import { PlanBook } from './engine-v3-plans';
import { engineSink } from './engine-v3-sink';
import { STOP_AUTOMATION_KIND, stopAutomation } from './engine-v3-stop';
import {
  contextOf,
  freshState,
  ignoresOwn,
  jsonRecord,
  nodeKeys,
  restartedSubject,
  signatureOf,
  triggerKeyOf,
  triggerNode,
  triggerSignal,
} from './engine-v3-start';
import type { StartRequest, Subject } from './engine-v3-start';
import type { EngineV3Ports, Loaded, SyncReport } from './engine-v3-types';
import { admissionCheck } from './triggers-v3/admit';
import { compileTriggers, signalFire, watchedOf } from './triggers-v3/armers';
import type { CompiledTriggers } from './triggers-v3/armers';
import { calledRun } from './triggers-v3/called';
import type { TriggerFire } from './triggers-v3/payload';

export type { EngineV3Ports, SyncReport } from './engine-v3-types';

export class EngineV3 {
  readonly driver: RunDriver;
  readonly parks: RunParkStore;
  private readonly loaded = new Map<string, Loaded>();
  private readonly book: PlanBook;
  private readonly triggers = new Map<string, SignalInput | null>();
  private readonly nodeKeys = new Map<string, ReadonlyMap<string, string>>();
  private readonly chains = new FeedbackChains();
  private readonly finishes = new Finishes();
  private readonly watchers: SignalWatchers;
  private readonly log: Logger;

  constructor(private readonly ports: EngineV3Ports) {
    this.log = ports.log ?? new Logger('hub.automations');
    this.book = new PlanBook(ports.repositories, this.log);
    this.parks = new RunParkStore(ports.repositories.records, ports.clock);
    this.watchers = new SignalWatchers({
      clock: ports.clock,
      timeZone: ports.zone,
      state: ports.watchState,
      fire: (automationId, signal, triggerId): void => {
        this.signalled(automationId, signal, triggerId);
      },
    });
    this.driver = new RunDriver({
      ports: this.driverPorts(),
      decisions: ports.decisions,
      log: this.log,
      ...(ports.yieldNow === undefined ? {} : { yieldNow: ports.yieldNow }),
    });
  }

  get automations(): readonly string[] {
    return [...this.loaded.keys()];
  }

  sync(): SyncReport {
    const rows = this.ports.repositories.programs.list();
    const present = new Set(rows.map((row) => row.id));
    const gone = [...this.loaded.keys()].filter((id) => !present.has(id));
    for (const id of gone) this.unload(id, 'removed');
    const results = rows.map((row) => this.apply(row));
    this.watchers.prune();
    const count = (kind: 'loaded' | 'unchanged' | 'refused'): number =>
      results.filter((result) => result === kind).length;
    return {
      loaded: count('loaded'),
      unchanged: count('unchanged'),
      removed: gone.length,
      refused: count('refused'),
    };
  }

  reload(automationId: string): void {
    const row = this.ports.repositories.programs.find(automationId);
    if (row === undefined) this.unload(automationId, 'removed');
    else this.apply(row);
    this.watchers.prune();
  }

  boot(): BootReport {
    const { records, plans, programs } = this.ports.repositories;
    return bootRuns({
      records,
      plans,
      clock: this.ports.clock,
      driver: this.driver,
      parks: this.parks,
      enabled: (id) => programs.find(id)?.enabled === true,
      rebuild: (state) => this.restart(state),
    });
  }

  observe(signal: SignalInput): void {
    this.watchers.observe(signal);
  }

  start(
    automationId: string,
    given: Readonly<Record<string, JsonValue>>,
    startedBy: string | null,
  ): Submission {
    const held = this.loaded.get(automationId);
    if (held === undefined) {
      throw new ApiError('not_found', 'The automation is not enabled, so it cannot be run.');
    }
    const { program } = held.subject;
    const called = calledRun({
      automationId,
      nodes: program.triggers,
      declared: program.inputs,
      given,
      at: this.ports.clock.now(),
    });
    if (!called.ok) throw new ApiError('invalid_request', called.message);
    return this.submit(held, {
      fire: called.value.fire,
      signal: null,
      inputs: called.value.inputs,
      causeChain: [],
      manual: true,
      startedBy,
      parentRunId: null,
    });
  }

  cancel(runId: string, reason: CancelReason): boolean {
    return this.driver.cancel(runId, reason);
  }

  subjectOf(automationId: string): Subject | undefined {
    const row = this.ports.repositories.programs.find(automationId);
    return row === undefined ? undefined : this.book.compile(row);
  }

  listensTo(webhookPath: string): boolean {
    return listensOnWebhook(this.loaded.values(), webhookPath);
  }

  cancelAutomation(automationId: string, reason: CancelReason, key?: string): number {
    return this.driver.cancelAutomation(automationId, reason, key);
  }

  async finished(runId: string): Promise<RunOutputs> {
    return (await this.finishes.wait(runId)).outputs;
  }

  outcome(runId: string): Promise<FinishedRun> {
    return this.finishes.wait(runId);
  }

  shutdown(): void {
    this.watchers.stop();
    for (const held of this.loaded.values()) held.disarm();
    this.loaded.clear();
    this.driver.shutdown(this.parks.kept);
  }

  private apply(row: AutomationRowV3): 'loaded' | 'unchanged' | 'refused' {
    if (!row.enabled) {
      this.unload(row.id, 'disabled');
      return 'unchanged';
    }
    const held = this.loaded.get(row.id);
    if (held?.signature === signatureOf(row, this.ports.place())) return 'unchanged';
    const subject = this.book.compile(row);
    if (subject === undefined) {
      this.unload(row.id, 'disabled');
      return 'refused';
    }
    held?.disarm();
    const compiled = compileTriggers(row.id, subject.program.triggers);
    this.loaded.set(row.id, {
      subject,
      signature: signatureOf(row, this.ports.place()),
      compiled,
      disarm: this.arm(subject, compiled),
    });
    this.watchers.replace(row.id, watchedOf(compiled, this.ports.isPulse));
    return 'loaded';
  }

  private unload(automationId: string, reason: 'disabled' | 'removed'): void {
    const held = this.loaded.get(automationId);
    held?.disarm();
    this.loaded.delete(automationId);
    if (held !== undefined) this.watchers.replace(automationId, null);
    this.driver.cancelAutomation(automationId, reason);
  }

  private arm(subject: Subject, compiled: CompiledTriggers): Cancel {
    return armTriggers(this.ports, subject, compiled, {
      fire: (fire) => {
        this.fire(fire, null);
      },
      problem: (problem) => {
        this.log.warn('automation.trigger_problem', { ...problem });
      },
    });
  }

  private signalled(automationId: string, signal: SignalInput, triggerId: string): void {
    const held = this.loaded.get(automationId);
    if (held === undefined) return;
    const fire = signalFire(held.compiled, signal, triggerId);
    if (fire === null) return;
    const node = triggerNode(held.subject.program, triggerId);
    if (ignoresOwnChange(automationId, ignoresOwn(node), signal)) return;
    this.fire(fire, signal);
  }

  private fire(fire: TriggerFire, signal: SignalInput | null): Submission | undefined {
    const held = this.loaded.get(fire.automationId);
    if (held === undefined) return undefined;
    return this.submit(held, {
      fire,
      signal,
      inputs: {},
      causeChain: this.chains.chainOf(signal),
      manual: false,
      startedBy: null,
      parentRunId: null,
    });
  }

  private submit(held: Loaded, request: StartRequest): Submission {
    const { subject } = held;
    const { program } = subject;
    const limits = resolveBudgets(program.budgets);
    const occurrence: Occurrence = {
      automationId: subject.id,
      name: subject.name,
      policy: program.policy,
      limits: { startBucket: limits.startBucket, feedback: limits.feedback },
      trigger: request.signal,
      causeChain: request.causeChain,
      manual: request.manual,
      urgent: false,
      startedBy: request.startedBy,
      admit: request.manual
        ? undefined
        : admissionCheck(admissionParts(this.ports, subject, request.fire), request.fire),
      start: (runId) => {
        this.ports.started?.({ signal: request.signal, runId, automationId: subject.id });
        return this.begin(subject, request, runId);
      },
    };
    return this.driver.submit(occurrence);
  }

  private begin(subject: Subject, request: StartRequest, runId: string): RunStart {
    const now = this.ports.clock.now().getTime();
    const state = freshState(
      { ...subject, callees: this.book.calleesOf(subject.plan) },
      request,
      runId,
      now,
    );
    const trigger = triggerSignal(request.fire, request.signal);
    this.ports.repositories.records.create({
      id: runId,
      automationId: subject.id,
      revision: subject.revision,
      ownerProfileId: null,
      controlKey: subject.program.policy.key ?? null,
      parentRunId: request.parentRunId,
      status: 'queued',
      mode: 'live',
      planHash: subject.hash,
      trigger: jsonRecord(trigger),
      causeChain: z.array(RUN_CAUSE).parse(
        request.causeChain.map((link) => ({
          automation_id: link.automationId,
          run_id: link.runId,
        })),
      ),
      startedBy: request.startedBy,
    });
    this.chains.begin(runId, request.causeChain, now);
    this.triggers.set(runId, trigger);
    this.nodeKeys.set(runId, nodeKeys(subject.program));
    return this.runStart(subject, state, request.startedBy);
  }

  private restart(state: RunState): RunStart {
    const row = this.ports.repositories.programs.find(state.automationId);
    const ref = state.planRefs[0];
    if (row === undefined || ref === undefined) {
      throw new ApiError('not_found', 'The automation of the waiting run no longer exists.');
    }
    const plan = this.book.stored(ref.hash);
    this.triggers.set(state.runId, state.trigger);
    this.nodeKeys.set(state.runId, nodeKeys(row.definition));
    const subject = restartedSubject(row, state, ref.hash, { plan, lookup: this.book });
    return this.runStart(subject, state, null);
  }

  private runStart(subject: Subject, state: RunState, startedBy: string | null): RunStart {
    return {
      state,
      context: contextOf(subject, triggerKeyOf(state), {
        ...this.ports.world,
        clock: this.ports.clock,
        zone: this.ports.zone,
      }),
      name: subject.name,
      kind: 'live',
      startedBy,
      key: subject.program.policy.key,
    };
  }

  private driverPorts(): DriverPorts {
    const { clock, storm, refused } = this.ports;
    return {
      clock,
      monotonic: () => performance.now(),
      ids: randomUUID,
      storm,
      perform: (request, scope) => this.perform(request, scope),
      watch: this.ports.watch,
      afterCancel: (request, result): void => {
        this.log.warn('automation.effect_landed_after_cancel', {
          kind: request.kind,
          path: request.path,
          ok: result.ok,
        });
      },
      refused,
      recordRun: (finished): void => {
        this.ports.recordRun(finished);
        this.finishes.settle(finished);
      },
      sink: this.sinkOf(),
    };
  }

  private sinkOf(): RunSink {
    const { clock, repositories, trace } = this.ports;
    return engineSink({
      clock,
      records: repositories.records,
      nodes: repositories.nodes,
      parks: this.parks,
      chains: this.chains,
      closed: (runId) => {
        this.triggers.delete(runId);
        this.nodeKeys.delete(runId);
      },
      nodeId: (runId, key) => this.nodeKeys.get(runId)?.get(key),
      settle: (finished) => {
        this.finishes.settle(finished);
      },
      keep: (runId, outputs) => {
        this.finishes.keep(runId, outputs);
      },
      trace,
    });
  }

  private perform(request: EffectRequest, scope: RunScope): Promise<NodeResult> {
    if (request.kind === RUN_AUTOMATION_KIND) return this.callChild(request.params);
    if (request.kind === STOP_AUTOMATION_KIND) {
      return Promise.resolve(
        stopAutomation(request.params, (id, reason, key) => this.cancelAutomation(id, reason, key)),
      );
    }
    const trigger = this.triggers.get(scope.runId) ?? null;
    return this.ports.effects(request, effectRun(scope, trigger, this.ports.retain));
  }

  private async callChild(params: Readonly<Record<string, JsonValue>>): Promise<NodeResult> {
    const call = childCall(params);
    const target = call === undefined ? undefined : this.loaded.get(call.automation);
    if (call === undefined || target === undefined) {
      return { ok: false, class: 'NotFound', message: 'The automation to run is not enabled' };
    }
    const submission = this.submit(target, {
      fire: calledFire(target, call.automation, this.ports.clock),
      signal: null,
      inputs: call.inputs,
      causeChain: call.causeChain,
      manual: false,
      startedBy: null,
      parentRunId: call.parentRunId,
    });
    if (submission.kind === 'refused') {
      return { ok: false, class: 'Refused', message: failureLine(submission.error) };
    }
    if (!call.wait) {
      await this.driver.firstHold(submission.runId);
      return { ok: true, value: {} };
    }
    return childOutcome(await this.finishes.wait(submission.runId));
  }
}
