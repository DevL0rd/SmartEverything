import {
  COMPUTER_SCOPE_OFF,
  DEFAULT_HISTORY_POLICY,
  SUMMARY_IDLE_INTERVAL_MS,
  type ComputerFeature,
  type ComputerSessionState,
  type HistoryPolicy,
  type HubFrame,
  type JsonValue,
  type NodeDemand,
  type NodeHello,
  type NodeRequest,
  type PowerAction,
  type ProcessesUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { background } from '@smarteverything/logging';
import type { ComputerCollector } from './collectors/collector';
import { Sampler } from './collectors/sampler';
import { controlFeatures, type ComputerControls } from './controls/controls';
import type { EarFactory, EarPort } from './ear/computer-ear';
import { isEarsFrame, type EarHostFactory, type EarHostPort, type EarsFrame } from './ear/ear-host';
import type { NodeLink } from './link';
import { failureOf, NodeFailureError } from './node-failure';
import { NodeRequestHandler } from './request-handler';
import { StateWatch } from './state-watch';

const BASELINE_OWNER = 'baseline';
const HUB_OWNER = 'hub';
const DESKTOP_FEATURES: readonly ComputerFeature[] = ['processes', 'files', 'capture'];

function pickMachine(hello: NodeHello): Pick<NodeHello, 'actions' | 'permissions'> {
  return { actions: hello.actions, permissions: hello.permissions };
}

export interface ComputerNodeOptions {
  readonly collector: ComputerCollector;
  readonly controls: ComputerControls;
  readonly link: NodeLink;
  readonly now: () => Date;
  readonly log: Logger;
  readonly history?: HistoryPolicy;
  readonly ear?: EarFactory | undefined;
  readonly earHost?: EarHostFactory | undefined;
}

export class ComputerNode {
  private policy: HistoryPolicy;
  private demand: NodeDemand = { topics: {} };
  private sampling = false;
  private unsubscribe: (() => void) | null = null;
  private stopMachine: (() => void) | null = null;
  private hello: NodeHello | null = null;
  private session: ComputerSessionState | null = null;
  private window = '';
  private requests = 0;
  private readonly handler: NodeRequestHandler;
  private readonly sampler: Sampler;
  private readonly states: StateWatch;
  private readonly ear: EarPort | null;
  private readonly earHost: EarHostPort | null;

  constructor(private readonly options: ComputerNodeOptions) {
    this.policy = options.history ?? DEFAULT_HISTORY_POLICY;
    this.handler = new NodeRequestHandler(options.controls);
    this.sampler = new Sampler({
      readers: {
        ...options.collector.readers,
        processes: (tick): ProcessesUpdate | null => options.controls.processes.read(tick),
      },
      policy: this.policy,
      emit: (frame): void => {
        options.link.send(frame);
      },
      now: (): number => options.now().getTime(),
      log: options.log,
    });
    this.ear =
      options.ear?.((message) => {
        options.link.send({ type: 'ear', ear: message });
      }) ?? null;
    this.earHost =
      options.earHost?.((key, ear) => {
        options.link.send({ type: 'ears', key, ear });
      }) ?? null;
    this.states = new StateWatch({
      controls: options.controls,
      allows: (scope): boolean => this.handler.allows(scope),
      emit: (parts): void => {
        options.link.send({ type: 'state', at: options.now().toISOString(), parts });
      },
      log: options.log,
    });
  }

  start(): void {
    this.options.log.info('node.computer_starting', {
      intervalMs: this.policy.interval_ms,
      windowMs: this.policy.window_ms,
    });
    this.unsubscribe = this.options.link.onFrame((frame) => {
      this.received(frame);
    });
    background(this.greet(), 'computer_node.greet_failed');
  }

  stop(): void {
    this.options.log.info('node.computer_stopping', {
      greeted: this.hello !== null,
      requests: this.requests,
    });
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopMachine?.();
    this.stopMachine = null;
    this.hello = null;
    this.halt();
    if (this.ear !== null) {
      background(this.ear.stop(), 'computer_node.ear_stop_failed');
    }
    if (this.earHost !== null) {
      background(this.earHost.stop(), 'computer_node.ear_host_stop_failed');
    }
    this.states.stop();
    this.options.collector.stop();
    this.options.controls.processes.stop();
    this.session = null;
    this.options.controls.session.stop().catch((cause: unknown) => {
      this.options.log.error('node.session_stop_failed', cause);
    });
  }

  setHistoryPolicy(policy: HistoryPolicy): void {
    this.policy = policy;
    this.sampler.setPolicy(policy);
    if (this.sampling) {
      this.options.collector.track(policy);
    }
  }

  private async greet(): Promise<void> {
    const { collector, controls, link, now } = this.options;
    const greetStartedAt = performance.now();
    const [features, hosting] = await Promise.all([
      controlFeatures(controls, this.options.log),
      this.earHostFeatures(),
    ]);
    const hello = await collector.hello(now());
    const machine = await this.machineReport();
    const complete = {
      ...hello,
      ...machine,
      power: await this.powerActions(),
      features: [...new Set([...hello.features, ...DESKTOP_FEATURES, ...features, ...hosting])],
    };
    if (this.unsubscribe === null) {
      this.options.log.debug('node.greet_abandoned', { reason: 'stopped_while_greeting' });
      return;
    }
    this.options.log.info('node.hello_sent', {
      power: complete.power,
      features: complete.features,
      greetMs: Math.round(performance.now() - greetStartedAt),
    });
    this.hello = complete;
    link.send({ type: 'hello', hello: complete });
    this.sync();
    this.watchMachine();
    await this.watchSession();
  }

  private async earHostFeatures(): Promise<readonly ComputerFeature[]> {
    if (this.earHost === null) {
      return [];
    }
    try {
      await this.earHost.load();
      return ['ear_host'];
    } catch (cause) {
      this.options.log.error('node.ear_host_unavailable', cause, {
        consequence: 'this computer cannot listen for cameras, walkie and Discord',
      });
      return [];
    }
  }

  private async machineReport(): Promise<Pick<NodeHello, 'actions' | 'permissions'>> {
    try {
      const report = await this.options.controls.machine.report();
      return { actions: [...report.actions], permissions: [...report.permissions] };
    } catch (cause) {
      this.options.log.error('node.machine_unknown', cause);
      return { actions: [], permissions: [] };
    }
  }

  private watchMachine(): void {
    this.stopMachine?.();
    this.stopMachine = this.options.controls.machine.watch(() => {
      background(this.reportMachine(), 'computer_node.machine_report_failed');
    });
  }

  private async reportMachine(): Promise<void> {
    const hello = this.hello;
    if (hello === null) return;
    const report = await this.machineReport();
    const signature = JSON.stringify(report);
    if (this.hello !== hello || signature === JSON.stringify(pickMachine(hello))) return;
    this.hello = { ...hello, ...report };
    this.options.log.info('node.machine_reported', {
      ready: report.actions.filter((action) => action.state === 'ready').length,
      needsPermission: report.actions.filter((action) => action.state === 'needs_permission')
        .length,
    });
    this.options.link.send({ type: 'machine', ...report });
  }

  private async watchSession(): Promise<void> {
    try {
      await this.options.controls.session.start((session) => {
        this.session = session;
        this.options.log.debug('node.session_changed', {});
        this.sendSession();
      });
      this.options.log.debug('node.session_watching', {});
    } catch (cause) {
      if (cause instanceof NodeFailureError && cause.code === 'no_session') {
        this.options.log.warn('node.session_unavailable', {
          reason: cause.message,
          consequence: 'lock, focus, media and volume are not available',
        });
        return;
      }
      this.options.log.error('node.session_unavailable', cause);
    }
  }

  private sendSession(): void {
    const session = this.session;
    if (session === null || this.unsubscribe === null) {
      return;
    }
    const visible = this.handler.allows('apps') ? session : { ...session, focused: null };
    this.options.link.send({
      type: 'state',
      at: this.options.now().toISOString(),
      parts: { session: visible },
    });
  }

  private async powerActions(): Promise<PowerAction[]> {
    try {
      return await this.options.controls.power.available();
    } catch (cause) {
      this.options.log.error('node.power_unknown', cause);
      return [];
    }
  }

  private received(frame: HubFrame): void {
    if (frame.type === 'request') {
      background(this.answer(frame.id, frame.request), 'computer_node.answer_failed');
      return;
    }
    this.options.log.trace('node.frame_received', { type: frame.type });
    if (frame.type === 'scopes') {
      this.handler.allow(frame.scopes);
      this.sync();
      this.sendSession();
      return;
    }
    if (frame.type === 'ear') {
      this.ear?.receive(frame.ear);
      return;
    }
    if (isEarsFrame(frame)) {
      this.earsReceived(frame);
      return;
    }
    this.demand = frame.demand;
    const { history } = frame.demand;
    if (history !== undefined && JSON.stringify(history) !== JSON.stringify(this.policy)) {
      this.setHistoryPolicy(history);
    }
    this.sync();
  }

  private earsReceived(frame: EarsFrame): void {
    if (this.earHost === null) {
      this.options.log.warn('node.ears_unsupported', { type: frame.type });
      return;
    }
    this.earHost.receive(frame);
  }

  private sync(): void {
    if (this.hello === null) {
      return;
    }
    this.states.sync(this.demand.topics);
    if (!this.handler.allows('metrics')) {
      this.halt();
      return;
    }
    if (!this.sampling) {
      this.sampling = true;
      this.options.collector.track(this.policy);
      this.sampler.start();
      this.sampler.demand(BASELINE_OWNER, { summary: SUMMARY_IDLE_INTERVAL_MS });
    }
    this.syncDemand();
  }

  private syncDemand(): void {
    const { processes, ...topics } = this.demand.topics;
    const watching = processes !== undefined && this.handler.allows('processes');
    const window = watching ? (this.demand.processes ?? null) : null;
    this.sampler.demand(HUB_OWNER, watching ? { ...topics, processes } : topics);
    const signature = JSON.stringify(window);
    if (signature !== this.window) {
      this.window = signature;
      this.options.controls.processes.watch(window);
      this.sampler.poke('processes');
    }
  }

  private halt(): void {
    if (!this.sampling) {
      return;
    }
    this.sampling = false;
    this.sampler.release(HUB_OWNER);
    this.sampler.release(BASELINE_OWNER);
    this.sampler.stop();
    this.options.collector.track(null);
    this.options.controls.processes.watch(null);
    this.window = '';
  }

  private async answer(id: string, request: NodeRequest): Promise<void> {
    const hello = this.hello;
    this.requests += 1;
    try {
      if (hello === null) {
        this.options.log.warn('node.request_early', { requestId: id, verb: request.verb });
        throw new NodeFailureError('failed', 'The computer is still starting.');
      }
      const value = await this.valueOf(request, hello);
      this.options.link.send({ type: 'reply', id, result: { ok: true, value } });
    } catch (cause) {
      this.options.log.debug('node.reply_failed', {
        requestId: id,
        verb: request.verb,
        errorName: cause instanceof Error ? cause.name : typeof cause,
        failureCode: cause instanceof NodeFailureError ? cause.code : undefined,
      });
      this.options.link.send({
        type: 'reply',
        id,
        result: { ok: false, failure: failureOf(cause) },
      });
    }
  }

  private async valueOf(request: NodeRequest, hello: NodeHello): Promise<JsonValue> {
    if (request.verb !== 'history') {
      return this.handler.handle(request, hello);
    }
    if (!this.handler.allows('metrics')) {
      throw new NodeFailureError('scope_off', COMPUTER_SCOPE_OFF.metrics);
    }
    return this.sampler.backfill(request.query);
  }
}
