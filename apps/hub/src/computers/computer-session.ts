import {
  NODE_FRAME,
  type AdapterSink,
  type ComputerAction,
  type ComputerLiveNotice,
  type ComputerParts,
  type ComputerPartsUpdate,
  type ComputerRole,
  type ComputerScopes,
  type ComputerSessionState,
  type HistoryPolicy,
  type JsonValue,
  type MachineActionSupport,
  type NodeFrame,
  type NodeHello,
  type NodeRequest,
  type NodeResult,
  type NodeSampleFrame,
  type ProcessWindow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { MetricHistory } from '../metrics/history';
import { deviceTarget, type ViewDemand, type Viewers } from '../metrics/viewers';
import type { HubLink } from '../node/link';
import { AppFocusTracker, type AppTime } from './app-focus';
import { AppPresence, type AppPresenceOptions } from './app-presence';
import { demandedTopics, nodeDemandOf } from './computer-demand';
import { FrameCounter } from './frame-counter';
import { FreshRead, type FreshViewers } from './fresh-read';
import type { SessionEars } from './computer-ears';
import { isEarFrame, routeEarFrame } from './ear-frames';
import type { SessionEarHosts } from '../listening/ear-hosts';
import { computerExternalId, describeComputer } from './computer-device';
import { offeredMachineActions } from './machine-requests';
import type { ComputerDirectory } from './computer-directory';
import { ComputerOfflineError } from './computer-errors';
import { MergedParts, visibleParts } from './computer-view';
import { HeadlineRecorder, headlineCapabilities } from './headlines';
import { NodeCalls } from './node-calls';
import { sessionCapabilities, sessionReadings } from './session-readings';

type DescriptionFrame = Extract<NodeFrame, { readonly type: 'machine' | 'features' }>;

function isDescription(frame: NodeFrame): frame is DescriptionFrame {
  return frame.type === 'machine' || frame.type === 'features';
}

export interface ComputerSessionOptions extends Pick<AppPresenceOptions, 'signals' | 'personOf'> {
  readonly link: HubLink;
  readonly sink: AdapterSink;
  readonly history: Pick<MetricHistory, 'push'>;
  readonly viewers: Pick<Viewers<ProcessWindow>, 'follow'> & FreshViewers;
  readonly policyOf: (deviceId: string, role: ComputerRole) => HistoryPolicy;
  readonly publish: (notice: ComputerLiveNotice) => void;
  readonly deviceIdOf: (externalId: string) => string | undefined;
  readonly scopesOf: (deviceId: string) => ComputerScopes;
  readonly directory: Pick<ComputerDirectory, 'isHubMachine'>;
  readonly hubComputerResolved: (deviceId: string) => void;
  readonly ears?: SessionEars;
  readonly earHosts?: SessionEarHosts;
  readonly recordAppTime: (time: AppTime) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface ComputerView {
  readonly deviceId: string;
  readonly role: ComputerRole;
  readonly hello: NodeHello;
  readonly at: string | null;
  readonly parts: ComputerParts;
  readonly scopes: ComputerScopes;
}

interface Known {
  readonly hello: NodeHello;
  readonly externalId: string;
}

export class ComputerSession {
  private known: Known | null = null;
  private readonly merged = new MergedParts();
  private readonly headlines: HeadlineRecorder;
  private readonly focus: AppFocusTracker;
  private readonly presence: AppPresence;
  private capabilities = '';
  private deviceId: string | null = null;
  private scopes: ComputerScopes | null = null;
  private readonly counter: FrameCounter;
  private readonly calls: NodeCalls;
  private readonly fresh: FreshRead;
  private readonly stops: (() => void)[] = [];
  private unfollow: (() => void) | null = null;

  constructor(private readonly options: ComputerSessionOptions) {
    this.calls = new NodeCalls(options.link.send);
    this.fresh = new FreshRead(options.viewers);
    this.focus = new AppFocusTracker(options.recordAppTime);
    this.presence = new AppPresence(options, { view: (): ComputerView | null => this.view() });
    this.counter = new FrameCounter(options.log);
    this.headlines = new HeadlineRecorder(options.history, options.sink);
    this.stops.push(
      options.link.onFrame((raw) => {
        this.received(raw);
      }),
    );
  }

  get role(): ComputerRole {
    const machineId = this.known?.hello.machineId;
    const hubMachine = machineId !== undefined && this.options.directory.isHubMachine(machineId);
    return hubMachine ? 'hub' : 'pc';
  }

  machineActions(): readonly MachineActionSupport[] {
    return this.known?.hello.actions ?? [];
  }

  stop(): void {
    this.earsOffline();
    this.options.log.info('computer.session_stopped', {
      externalId: this.known?.externalId,
      deviceId: this.deviceId ?? undefined,
      role: this.role,
    });
    this.focus.end(this.options.now());
    this.presence.end();
    this.calls.close();
    this.known = null;
    this.unfollow?.();
    this.unfollow = null;
    this.stops.splice(0).forEach((stop) => {
      stop();
    });
  }

  owns(externalId: string): boolean {
    return this.known?.externalId === externalId;
  }

  view(): ComputerView | null {
    const { known, scopes } = this;
    const deviceId = known === null ? null : this.resolve(known);
    if (known === null || deviceId === null || scopes === null) {
      return null;
    }
    return {
      deviceId,
      role: this.role,
      hello: known.hello,
      at: this.merged.latestAt,
      parts: visibleParts(this.merged.latest, scopes),
      scopes,
    };
  }

  call(request: NodeRequest): Promise<JsonValue> {
    if (this.known === null) {
      return Promise.reject(new ComputerOfflineError());
    }
    return this.calls.call(request);
  }

  sampled(): Promise<void> {
    return this.deviceId === null ? Promise.resolve() : this.fresh.sample(this.deviceId);
  }

  allow(scopes: ComputerScopes): void {
    this.options.log.info('computer.scopes_sent', {
      externalId: this.known?.externalId,
      deviceId: this.deviceId ?? undefined,
      power: scopes.power,
      apps: scopes.apps,
      system: scopes.system,
    });
    this.scopes = scopes;
    this.presence.revalidate();
    this.options.link.send({ type: 'scopes', scopes });
    const { known, deviceId } = this;
    if (known !== null) {
      this.describeIfChanged(known);
    }
    const session = this.merged.latest.session;
    if (deviceId !== null && session !== undefined) {
      this.focus.observe(deviceId, session, scopes.apps);
    }
    if (deviceId !== null) this.sendDemand(deviceId);
  }

  retune(): void {
    if (this.deviceId !== null) this.sendDemand(this.deviceId);
  }

  private received(raw: unknown): void {
    const frame = NODE_FRAME.safeParse(raw);
    if (!frame.success) {
      this.options.log.warn('computer.frame_invalid', { reason: frame.error.message });
      return;
    }
    const { data } = frame;
    if (isEarFrame(data)) {
      routeEarFrame(this.options, this.deviceId, data);
      return;
    }
    if (isDescription(data)) {
      this.described(data);
      return;
    }
    switch (data.type) {
      case 'hello':
        this.greeted(data.hello);
        return;
      case 'sample':
        this.sampleReceived(data);
        return;
      case 'state':
        this.measured(data.at, data.parts);
        return;
      case 'app_events':
        this.presence.receive(data);
        return;
      case 'reply':
        this.replied(data.id, data.result);
        return;
      case 'report':
        return;
    }
  }

  private described(frame: DescriptionFrame): void {
    if (frame.type === 'machine') {
      this.machineReported(frame.actions, frame.permissions);
    } else {
      this.featuresReported(frame.features);
    }
  }

  private sampleReceived(frame: NodeSampleFrame): void {
    this.measured(frame.at, frame.parts);
    if (frame.key === true) this.fresh.keyFrame();
  }

  private replied(id: string, result: NodeResult): void {
    if (!this.calls.settle(id, result)) {
      this.options.log.warn('computer.reply_unexpected', { id });
    }
  }

  private machineReported(
    actions: NodeHello['actions'],
    permissions: NodeHello['permissions'],
  ): void {
    const { known } = this;
    if (known === null) {
      this.options.log.warn('computer.frame_before_hello', {});
      return;
    }
    this.known = { ...known, hello: { ...known.hello, actions, permissions } };
    this.describeIfChanged(this.known);
  }

  private featuresReported(features: NodeHello['features']): void {
    const { known } = this;
    if (known === null) {
      this.options.log.warn('computer.frame_before_hello', {});
      return;
    }
    this.options.log.info('computer.features_reported', { features: features.length });
    this.known = { ...known, hello: { ...known.hello, features } };
    this.describeIfChanged(this.known);
  }

  private greeted(hello: NodeHello): void {
    const externalId = computerExternalId(hello.machineId);
    this.options.log.info('computer.hello_received', {
      externalId,
      role: this.role,
      os: hello.os.name,
      threads: hello.cpu.threads,
      features: hello.features.length,
      reconnect: this.known !== null,
    });
    this.known = { hello, externalId };
    this.merged.clear();
    this.headlines.reset();
    this.capabilities = '';
    if (this.deviceId === null) {
      this.resolve(this.known);
      return;
    }
    this.allow(this.options.scopesOf(this.deviceId));
    this.earsOnline(this.deviceId);
  }

  private earsOffline(): void {
    if (this.deviceId === null) return;
    this.options.ears?.offline(this.deviceId);
    this.options.earHosts?.leave(this.deviceId);
  }

  private earsOnline(deviceId: string): void {
    this.options.earHosts?.join(deviceId, this.known?.hello.features ?? [], (frame) => {
      this.options.link.send(frame);
    });
    this.options.ears?.online(deviceId, (ear) => {
      this.options.link.send({ type: 'ear', ear });
    });
  }

  private measured(at: string, parts: ComputerPartsUpdate): void {
    const known = this.known;
    if (known === null) {
      this.options.log.warn('computer.frame_before_hello', {});
      return;
    }
    this.merged.merge(at, parts);
    this.counter.count(this.options.now().getTime(), known.externalId, this.deviceId);
    const deviceId = this.resolve(known);
    if (parts.session !== undefined) this.sessionChanged(known, parts.session);
    this.describeIfChanged(known);
    if (deviceId === null) return;
    if (parts.summary !== undefined) {
      this.headlines.record({ deviceId, externalId: known.externalId }, parts.summary, at);
    }
    const scopes = this.scopes;
    if (scopes === null) return;
    this.options.publish({
      type: 'computer_live',
      deviceId,
      at,
      parts: visibleParts(parts, scopes),
    });
  }

  private actions(): ComputerAction[] {
    const known = this.known;
    if (known === null || this.scopes?.power !== true) {
      return [];
    }
    const wake = this.role === 'pc' && known.hello.interfaces.length > 0 ? ['wake' as const] : [];
    return [...known.hello.power, ...wake];
  }

  private sessionChanged(known: Known, session: ComputerSessionState): void {
    this.options.log.trace('computer.session_state', { externalId: known.externalId });
    const deviceId = this.deviceId;
    if (deviceId === null) {
      return;
    }
    const apps = this.scopes?.apps === true;
    sessionReadings(session, apps).forEach((reading) => {
      this.options.sink.state({
        externalId: known.externalId,
        capability: reading.key,
        value: reading.value,
        observedAt: session.at,
      });
    });
    this.focus.observe(deviceId, session, apps);
  }

  private describeIfChanged(known: Known): void {
    const { summary, session } = this.merged.latest;
    const readings = [
      ...(summary === undefined ? [] : headlineCapabilities(summary)),
      ...sessionCapabilities(session ?? null, this.scopes?.apps === true),
    ];
    const device = describeComputer(known.hello, this.role, readings, {
      power: this.actions(),
      machine: offeredMachineActions(this.scopes),
    });
    const capabilities = device.capabilities.map((capability) => capability.key).join(',');
    if (capabilities !== this.capabilities) {
      this.options.log.debug('computer.capabilities_changed', () => ({
        externalId: known.externalId,
        count: device.capabilities.length,
        actions: this.actions().length,
        first: this.capabilities === '',
      }));
      this.capabilities = capabilities;
      this.options.sink.devices([device]);
    }
  }

  private resolve(known: Known): string | null {
    if (this.deviceId !== null) {
      return this.deviceId;
    }
    const deviceId = this.options.deviceIdOf(known.externalId);
    if (deviceId === undefined) {
      return null;
    }
    this.deviceId = deviceId;
    this.options.log.info('computer.session_resolved', {
      externalId: known.externalId,
      deviceId,
      role: this.role,
    });
    if (this.role === 'hub') this.options.hubComputerResolved(deviceId);
    this.allow(this.options.scopesOf(deviceId));
    this.follow(deviceId);
    this.earsOnline(deviceId);
    return deviceId;
  }

  private follow(deviceId: string): void {
    this.unfollow = this.options.viewers.follow(deviceTarget(deviceId), (demand) => {
      this.demanded(deviceId, demand);
    });
  }

  private demanded(deviceId: string, demand: ViewDemand<ProcessWindow>): void {
    this.merged.retain(demandedTopics(demand));
    this.sendDemand(deviceId);
  }

  private sendDemand(deviceId: string): void {
    if (this.known === null || this.scopes === null) return;
    const demand = nodeDemandOf(
      this.options.viewers.demand(deviceTarget(deviceId)),
      this.options.policyOf(deviceId, this.role),
      this.scopes.processes,
    );
    this.options.log.debug('computer.demand_sent', () => ({
      deviceId,
      topics: Object.keys(demand.topics).join(','),
      processes: demand.processes !== undefined,
      intervalMs: demand.history?.interval_ms,
      windowMs: demand.history?.window_ms,
    }));
    this.options.link.send({ type: 'demand', demand });
  }
}
