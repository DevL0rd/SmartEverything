import {
  NODE_FRAME,
  type AdapterSink,
  type ComputerAction,
  type ComputerScopes,
  type ComputerSessionState,
  type ComputerSnapshot,
  type JsonValue,
  type NodeHello,
  type NodeRequest,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { MetricHistory } from '../metrics/history';
import { deviceTarget, type Viewers } from '../metrics/viewers';
import type { HubLink } from '../node/link';
import { AppFocusTracker, type AppTime } from './app-focus';
import { computerExternalId, describeComputer } from './computer-device';
import { ComputerOfflineError } from './computer-errors';
import { headlineCapabilities, headlineValues } from './headlines';
import { NodeCalls } from './node-calls';
import { sessionCapabilities, sessionReadings } from './session-readings';

const STATE_EVERY_MS = 10_000;

export interface ComputerSessionOptions {
  readonly link: HubLink;
  readonly sink: AdapterSink;
  readonly history: Pick<MetricHistory, 'push'>;
  readonly viewers: Pick<Viewers, 'watch' | 'watched'>;
  readonly deviceIdOf: (externalId: string) => string | undefined;
  readonly scopesOf: (deviceId: string) => ComputerScopes;
  readonly host: boolean;
  readonly recordAppTime: (time: AppTime) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

export interface ComputerView {
  readonly deviceId: string;
  readonly hello: NodeHello;
  readonly snapshot: ComputerSnapshot | null;
  readonly session: ComputerSessionState | null;
  readonly scopes: ComputerScopes;
}

interface Known {
  readonly hello: NodeHello;
  readonly externalId: string;
}

export class ComputerSession {
  private known: Known | null = null;
  private snapshot: ComputerSnapshot | null = null;
  private session: ComputerSessionState | null = null;
  private readonly focus: AppFocusTracker;
  private capabilities = '';
  private deviceId: string | null = null;
  private scopes: ComputerScopes | null = null;
  private stateAt = 0;
  private readonly calls: NodeCalls;
  private readonly stops: (() => void)[] = [];

  constructor(private readonly options: ComputerSessionOptions) {
    this.calls = new NodeCalls(options.link.send);
    this.focus = new AppFocusTracker(options.recordAppTime);
    this.stops.push(
      options.link.onFrame((raw) => {
        this.received(raw);
      }),
    );
  }

  stop(): void {
    this.focus.end(this.options.now());
    this.calls.close();
    this.known = null;
    this.stops.splice(0).forEach((stop) => {
      stop();
    });
  }

  owns(externalId: string): boolean {
    return this.known?.externalId === externalId;
  }

  view(): ComputerView | null {
    const { known, deviceId, scopes } = this;
    if (known === null || deviceId === null || scopes === null) {
      return null;
    }
    return { deviceId, hello: known.hello, snapshot: this.snapshot, session: this.session, scopes };
  }

  call(request: NodeRequest): Promise<JsonValue> {
    if (this.known === null) {
      return Promise.reject(new ComputerOfflineError());
    }
    return this.calls.call(request);
  }

  allow(scopes: ComputerScopes): void {
    this.scopes = scopes;
    this.options.link.send({ type: 'scopes', scopes });
    const { known, deviceId, session } = this;
    if (known !== null) {
      this.describeIfChanged(known);
    }
    if (deviceId !== null && session !== null) {
      this.focus.observe(deviceId, session, scopes.apps);
    }
  }

  private received(raw: unknown): void {
    const frame = NODE_FRAME.safeParse(raw);
    if (!frame.success) {
      this.options.log.warn('computer.frame_invalid', { reason: frame.error.message });
      return;
    }
    if (frame.data.type === 'hello') {
      this.greeted(frame.data.hello);
      return;
    }
    if (frame.data.type === 'snapshot') {
      this.measured(frame.data.snapshot);
      return;
    }
    if (frame.data.type === 'session') {
      this.sessionChanged(frame.data.session);
      return;
    }
    if (frame.data.type === 'reply' && !this.calls.settle(frame.data.id, frame.data.result)) {
      this.options.log.warn('computer.reply_unexpected', { id: frame.data.id });
    }
  }

  private greeted(hello: NodeHello): void {
    this.known = { hello, externalId: computerExternalId(hello) };
    this.capabilities = '';
    this.stateAt = 0;
  }

  private measured(snapshot: ComputerSnapshot): void {
    const known = this.known;
    if (known === null) {
      this.options.log.warn('computer.snapshot_before_hello', {});
      return;
    }
    this.snapshot = snapshot;
    this.describeIfChanged(known);
    const deviceId = this.resolve(known);
    if (deviceId === null) {
      return;
    }
    const at = new Date(snapshot.at);
    const values = headlineValues(snapshot);
    values.forEach((item) => {
      this.options.history.push(deviceId, item.key, item.value, at);
    });
    if (at.getTime() - this.stateAt < STATE_EVERY_MS) {
      return;
    }
    this.stateAt = at.getTime();
    values.forEach((item) => {
      this.options.sink.state({
        externalId: known.externalId,
        capability: item.key,
        value: item.rounded,
        observedAt: snapshot.at,
      });
    });
  }

  private actions(): ComputerAction[] {
    const known = this.known;
    if (known === null || this.scopes?.power !== true) {
      return [];
    }
    const wake = !this.options.host && known.hello.interfaces.length > 0 ? ['wake' as const] : [];
    return [...known.hello.power, ...wake];
  }

  private sessionChanged(session: ComputerSessionState): void {
    const known = this.known;
    if (known === null) {
      this.options.log.warn('computer.session_before_hello', {});
      return;
    }
    this.session = session;
    this.describeIfChanged(known);
    const deviceId = this.resolve(known);
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
    const readings = [
      ...(this.snapshot === null ? [] : headlineCapabilities(this.snapshot)),
      ...sessionCapabilities(this.session, this.scopes?.apps === true),
    ];
    const device = describeComputer(known.hello, readings, this.actions());
    const capabilities = device.capabilities.map((capability) => capability.key).join(',');
    if (capabilities !== this.capabilities) {
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
    this.allow(this.options.scopesOf(deviceId));
    this.follow(deviceId);
    return deviceId;
  }

  private follow(deviceId: string): void {
    const target = deviceTarget(deviceId);
    const pace = (watched: boolean): void => {
      this.options.link.send({ type: 'pace', pace: watched ? 'live' : 'idle' });
    };
    this.stops.push(this.options.viewers.watch(target, pace));
    pace(this.options.viewers.watched(target));
  }
}
