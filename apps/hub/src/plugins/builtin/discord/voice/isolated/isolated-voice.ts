import { randomUUID } from 'node:crypto';
import { Logger } from '@smarteverything/logging';
import type { ChildCrash, ChildHost } from '../../../../isolation/child-host';
import { READY_EVENT } from '../../../../isolation/frames';
import {
  VoiceConnectError,
  type VoiceBackend,
  type VoiceConnect,
  type VoiceGateway,
} from '../link';
import { CONNECT_CALL, EVENT, type VoiceCommand, type VoiceEvent } from './protocol';
import { RemoteLink } from './remote-link';

const CONNECT_MS = 30_000;

export class IsolatedVoice implements VoiceBackend {
  private readonly links = new Map<string, RemoteLink>();
  private readonly gateways = new Map<string, VoiceGateway>();
  private readonly listeners: (() => void)[] = [];
  private problem: string | null = null;

  constructor(
    private readonly host: ChildHost,
    private readonly log: Logger = new Logger('hub.plugins'),
  ) {
    host.onEvent((name, payload) => {
      this.received(name, payload);
    });
    host.onCrash((crash) => {
      this.crashed(crash);
    });
  }

  readonly connect: VoiceConnect = async (request) => {
    const { guildId, channelId, muted, gateway } = request;
    const linkId = randomUUID();
    const release = this.host.hold();
    const unwatch = gateway.watch(guildId, {
      server: (data) => {
        this.command({ name: 'server', payload: { guildId, data } });
      },
      state: (data) => {
        this.command({ name: 'state', payload: { guildId, data } });
      },
    });
    this.gateways.set(guildId, gateway);
    const link = new RemoteLink({
      linkId,
      channelId,
      muted,
      host: this.host,
      finished: (): void => {
        this.links.delete(linkId);
        unwatch();
        release();
      },
    });
    this.links.set(linkId, link);
    try {
      await this.host.call(CONNECT_CALL, { linkId, guildId, channelId, muted }, CONNECT_MS);
    } catch (cause) {
      this.links.delete(linkId);
      unwatch();
      release();
      throw new VoiceConnectError(channelId, cause);
    }
    this.issueIs(null);
    return link;
  };

  issue = (): string | null => this.problem;

  onIssue(listener: () => void): void {
    this.listeners.push(listener);
  }

  private issueIs(problem: string | null): void {
    if (this.problem === problem) {
      return;
    }
    this.problem = problem;
    this.listeners.forEach((listener) => {
      listener();
    });
  }

  private command(command: VoiceCommand): void {
    this.host.send(command.name, command.payload);
  }

  private crashed(crash: ChildCrash): void {
    this.issueIs(
      `Voice stopped unexpectedly (${crash.signal ?? `exit code ${String(crash.code)}`}) and restarts in ${String(Math.ceil(crash.restartInMs / 1000))} s. Text keeps working.`,
    );
    [...this.links.values()].forEach((link) => {
      link.closedBy('closed', crash.error);
    });
  }

  private received(name: string, payload: unknown): void {
    if (name === READY_EVENT) {
      this.issueIs(null);
      return;
    }
    const event = EVENT.safeParse({ name, payload });
    if (event.success) {
      this.dispatch(event.data);
    } else {
      this.log.warn('plugin.voice_event_invalid', { name, reason: event.error.message });
    }
  }

  private dispatch(event: VoiceEvent): void {
    if (event.name === 'gatewaySend') {
      const { guildId, payload } = event.payload;
      this.gateways.get(guildId)?.send(guildId, payload);
      return;
    }
    const link = this.links.get(event.payload.linkId);
    if (link !== undefined) {
      this.relay(link, event);
    }
  }

  private relay(link: RemoteLink, event: Exclude<VoiceEvent, { name: 'gatewaySend' }>): void {
    switch (event.name) {
      case 'speaking':
        link.heard(event.payload.userId);
        return;
      case 'audio':
        link.packet(event.payload.streamId, event.payload.packet);
        return;
      case 'audioEnd':
        link.streamEnded(event.payload.streamId);
        return;
      case 'dave':
        this.log.warn('voice.dave_failed', event.payload.trouble);
        return;
      case 'closed': {
        const { reason, cause } = event.payload;
        link.closedBy(reason, cause === null ? null : new Error(cause));
      }
    }
  }
}
