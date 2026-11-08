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
  type ProcessesUpdate,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { background } from '@smarteverything/logging';
import { appEventsOf, type AppEventsWatch } from './app-events-watch';
import type { ComputerCollector } from './collectors/collector';
import { Sampler } from './collectors/sampler';
import {
  earHostFeatures,
  isRelay,
  machineReport,
  machineChanged,
  powerActions,
  sameFeatures,
} from './computer-node-reports';
import { controlFeatures, type ComputerControls } from './controls/controls';
import type { EarFactory, EarPort } from './ear/computer-ear';
import { type EarHostFactory, type EarHostPort } from './ear/ear-host';
import { receiveEars } from './ear/ear-receive';
import type { NodeLink } from './link';
import { failureOf, NodeFailureError } from './node-failure';
import { PlacementLink } from './placement-link';
import { NodeRequestHandler } from './request-handler';
import { NodeServerRelay } from './server-relay';
import { StateWatch } from './state-watch';

const BASELINE_OWNER = 'baseline';
const HUB_OWNER = 'hub';
const DESKTOP_FEATURES: readonly ComputerFeature[] = ['processes', 'files', 'capture'];

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
  private stopTiling: (() => void) | null = null;
  private hello: NodeHello | null = null;
  private fixedFeatures: readonly ComputerFeature[] = [];
  private session: ComputerSessionState | null = null;
  private window = '';
  private requests = 0;
  private readonly handler: NodeRequestHandler;
  private readonly sampler: Sampler;
  private readonly states: StateWatch;
  private readonly apps: AppEventsWatch;
  private readonly ear: EarPort | null;
  private readonly earHost: EarHostPort | null;
  private readonly relay: NodeServerRelay;
  readonly placements: PlacementLink;

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
      options.earHost?.(
        (key, ear) => {
          options.link.send({ type: 'ears', key, ear });
        },
        (id, heard) => {
          options.link.send({ type: 'ears_scored', id, heard });
        },
        (id, reason) => {
          options.link.send({ type: 'ears_score_failed', id, reason });
        },
      ) ?? null;
    this.apps = appEventsOf(options);
    this.placements = new PlacementLink(options.link.send);
    this.relay = new NodeServerRelay((frame) => {
      options.link.send(frame);
    }, options.log);
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
    this.stopTiling?.();
    this.stopTiling = null;
    this.options.controls.environment.stop();
    this.apps.stop();
    this.relay.stop();
    this.placements.stop();
    background(this.options.controls.tiling.stop(), 'computer_node.tiling_stop_failed');
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
    await this.watchEnvironment();
    const [features, hosting] = await Promise.all([
      controlFeatures(controls, this.options.log),
      earHostFeatures(this.earHost, this.options.log),
    ]);
    const hello = await collector.hello(now());
    const machine = await machineReport(this.options.controls, this.options.log);
    this.fixedFeatures = [...hello.features, ...DESKTOP_FEATURES, ...hosting];
    const complete = {
      ...hello,
      ...machine,
      power: await powerActions(this.options.controls, this.options.log),
      features: [...new Set([...this.fixedFeatures, ...features])],
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
    this.watchTiling();
    await this.watchSession();
  }

  private async watchEnvironment(): Promise<void> {
    try {
      await this.options.controls.environment.start(() => {
        background(this.reportFeatures(), 'computer_node.features_report_failed');
        background(this.reportMachine(), 'computer_node.machine_report_failed');
      });
    } catch (cause) {
      if (cause instanceof NodeFailureError && cause.code === 'no_session') {
        this.options.log.warn('node.environment_unwatched', {
          reason: cause.message,
          consequence: 'screens and windows appear only after the node restarts in a session',
        });
        return;
      }
      this.options.log.error('node.environment_unwatched', cause);
    }
  }

  private async reportFeatures(): Promise<void> {
    const hello = this.hello;
    if (hello === null) return;
    const controlled = await controlFeatures(this.options.controls, this.options.log);
    const features = [...new Set([...this.fixedFeatures, ...controlled])];
    if (this.hello !== hello || sameFeatures(features, hello.features)) return;
    this.hello = { ...hello, features };
    this.options.log.info('node.features_reported', { features });
    this.options.link.send({ type: 'features', features });
  }

  private watchMachine(): void {
    this.stopMachine?.();
    this.stopMachine = this.options.controls.machine.watch(() => {
      background(this.reportMachine(), 'computer_node.machine_report_failed');
    });
  }

  private watchTiling(): void {
    this.stopTiling?.();
    this.stopTiling = this.options.controls.tiling.watchPresence(() => {
      background(this.reportTiling(), 'computer_node.tiling_report_failed');
    });
  }

  private async reportTiling(): Promise<void> {
    const hello = this.hello;
    if (hello === null) return;
    const tiling = await this.options.controls.tiling.features();
    if (this.hello !== hello || hello.features.includes('tiling') === tiling.length > 0) return;
    const features = [...hello.features.filter((feature) => feature !== 'tiling'), ...tiling];
    this.hello = { ...hello, features };
    this.options.log.info('node.features_reported', { tiling: tiling.length > 0 });
    this.options.link.send({ type: 'features', features });
  }

  private async reportMachine(): Promise<void> {
    const hello = this.hello;
    if (hello === null) return;
    const report = await machineReport(this.options.controls, this.options.log);
    if (this.hello !== hello || !machineChanged(hello, report)) return;
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
        this.apps.lockChanged(session.locked);
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

  private received(frame: HubFrame): void {
    if (frame.type === 'request') {
      background(this.answer(frame.id, frame.request), 'computer_node.answer_failed');
      return;
    }
    this.options.log.trace('node.frame_received', { type: frame.type });
    if (frame.type === 'scopes') {
      this.handler.allow(frame.scopes);
      this.apps.watch(this.handler.allows('apps') && this.handler.allows('app_events'));
      this.sync();
      this.sendSession();
      return;
    }
    if (frame.type === 'ear') {
      this.ear?.receive(frame.ear);
      return;
    }
    if (receiveEars(this.earHost, frame, this.options.log) || this.placements.handle(frame)) return;
    if (isRelay(frame)) {
      this.relay.receive(frame);
      return;
    }
    this.demanded(frame.demand);
  }

  private demanded(demand: NodeDemand): void {
    this.demand = demand;
    if (
      demand.history !== undefined &&
      JSON.stringify(demand.history) !== JSON.stringify(this.policy)
    ) {
      this.setHistoryPolicy(demand.history);
    }
    this.sync();
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
