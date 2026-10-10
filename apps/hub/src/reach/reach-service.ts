import {
  SPEECH_FAILED,
  type AiOutreachRow,
  type CallEnding,
  type CallPerson,
  type NotifyPerson,
  type PluginOrigin,
  type Speak,
  type StartConversation,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { PluginSpeakers } from '../plugins/plugin-reach';
import type { OutreachAnswer, OutreachAnswering, OutreachDesk } from '../assistant-voice/outreach';
import type { Clock } from '../clock';
import type { Store } from '../store/store';
import { speakOnce, type AnnouncingDeps } from './announcing';
import type { AppSpeech } from './app-speech';
import type { CameraParts } from './camera-conversation';
import type { CameraFraming } from './camera-framing';
import type { OpenLive } from './channel-conversation';
import type { HostVoice } from './hosted-call';
import { Hosting } from './hosting';
import { ReachRefusedError } from './reach-errors';
import { mayReach, withinLimit, type Asker } from './reach-guards';
import type { ReachRules } from './reach-rules';
import { callOpening, outcomeText } from './reach-text';
import { Ringing, type RingDevice, type RingPlan, type RingTransport } from './ringing';
import { appOwner, resolveTarget, type ResolvedTarget } from './targets';

export interface ReachAssistant {
  readonly conversationChat: (profileId: string, title: string) => string;
  readonly turn: (chatId: string, text: string, origin: PluginOrigin | null) => void;
  readonly message: (personId: string, text: string) => Promise<string>;
  readonly aiName: () => string;
  readonly liveVideo: () => boolean;
  readonly muteMic: () => boolean;
}

export interface ReachServiceOptions {
  readonly store: Store;
  readonly rules: ReachRules;
  readonly speakers: Pick<PluginSpeakers, 'forDevice'>;
  readonly assistant: ReachAssistant;
  readonly transports: Readonly<Record<RingDevice, RingTransport>>;
  readonly host: HostVoice;
  readonly say: AnnouncingDeps['say'];
  readonly app: Pick<AppSpeech, 'play' | 'refusal'>;
  readonly camera: CameraParts;
  readonly framing: CameraFraming;
  readonly openLive: OpenLive;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Ring {
  readonly personId: string;
  readonly plan: RingPlan;
  readonly how: 'phone' | 'desktop' | 'app';
  readonly reason: string;
  readonly urgent: boolean;
}

const RING_DEVICES: Readonly<Record<CallPerson['device'], readonly RingDevice[]>> = {
  phone: ['phone'],
  desktop: ['desktop'],
  any: ['phone', 'desktop'],
};

export class ReachService implements OutreachDesk {
  readonly ringing: Ringing;
  private readonly hosting: Hosting;

  constructor(private readonly options: ReachServiceOptions) {
    this.ringing = new Ringing({
      store: options.store,
      transports: options.transports,
      opening: callOpening,
      closed: (row): void => {
        this.closed(row);
      },
      clock: options.clock,
      log: options.log,
    });
    this.hosting = new Hosting({
      ...options,
      chatFor: (asker, label): string => this.chatFor(asker, asker.profileId, label),
      aiName: options.assistant.aiName,
      liveVideo: options.assistant.liveVideo,
      muteMic: options.assistant.muteMic,
    });
  }

  start(): void {
    for (const row of this.options.store.aiOutreach.open()) {
      this.options.store.aiOutreach.step(row.id, {
        state: 'failed',
        detail: 'Stopped by a server restart.',
      });
    }
    this.hosting.restoreAll();
  }

  stop(): void {
    this.ringing.stopAll();
    this.hosting.stop();
  }

  call(asker: Asker, body: CallPerson): Promise<AiOutreachRow> {
    return this.ring(asker, {
      personId: body.personId,
      plan: { devices: RING_DEVICES[body.device], only: null },
      how: body.device === 'any' ? 'app' : body.device,
      reason: body.reason,
      urgent: body.urgent,
    });
  }

  async startConversation(asker: Asker, body: StartConversation): Promise<AiOutreachRow> {
    const target = resolveTarget(this.options.store, this.options, asker, body.target);
    if (target.kind === 'app') {
      const device = target.client.platform === 'android' ? 'phone' : 'desktop';
      return this.ring(asker, {
        personId: appOwner(this.options.store, target.client),
        plan: { devices: [device], only: target.client.id },
        how: device,
        reason: body.reason,
        urgent: body.urgent,
      });
    }
    if (target.kind === 'plugin') {
      throw new ReachRefusedError(
        `${target.label} can be spoken through, but a conversation there starts from the device itself.`,
      );
    }
    withinLimit(this.options.store, asker.profileId, this.options.clock.now());
    return target.kind === 'camera'
      ? this.hosting.camera(asker, target, body.reason)
      : this.hosting.channel(asker, target.channel, body.reason);
  }

  camera(
    asker: Asker,
    body: { cameraId: string; reason: string },
    heard?: () => Int16Array,
  ): Promise<AiOutreachRow> {
    const resolved = resolveTarget(this.options.store, this.options, asker, {
      kind: 'device',
      deviceId: body.cameraId,
    });
    if (resolved.kind !== 'camera') {
      throw new ReachRefusedError('That device is not a camera the AI may talk through.');
    }
    withinLimit(this.options.store, asker.profileId, this.options.clock.now());
    return this.hosting.camera(asker, resolved, body.reason, heard);
  }

  async speak(asker: Asker, body: Speak): Promise<AiOutreachRow> {
    const { store } = this.options;
    const target = resolveTarget(store, this.options, asker, body.target);
    const personId = target.kind === 'app' ? appOwner(store, target.client) : asker.profileId;
    if (target.kind === 'app') {
      this.mayDisturb(asker, personId, false);
      const refusal = this.options.app.refusal(target.client);
      if (refusal !== null) {
        throw new ReachRefusedError(refusal);
      }
    }
    withinLimit(store, personId, this.options.clock.now());
    const row = store.aiOutreach.add({
      profile_id: personId,
      chat_id: null,
      from_chat_id: asker.chatId,
      how: target.kind === 'plugin' ? 'message' : target.kind,
      target: targetId(target),
      target_label: target.label,
      reason: body.text.slice(0, 500),
      urgent: false,
      state: 'live',
      detail: null,
      expires_at: null,
      clients: target.kind === 'app' ? [target.client.id] : [],
      origin: asker.origin ?? null,
    });
    const outcome = { returned: false };
    await this.announce(row, target, { clientId: asker.clientId, text: body.text }, outcome);
    outcome.returned = true;
    const after = store.aiOutreach.byId(row.id);
    if (after.state === 'failed') {
      throw new ReachRefusedError(after.detail ?? SPEECH_FAILED);
    }
    return after;
  }

  async notify(asker: Asker, body: NotifyPerson): Promise<AiOutreachRow> {
    const { store } = this.options;
    const name = this.mayDisturb(asker, body.personId, body.urgent);
    const chatId = await this.options.assistant.message(body.personId, body.text);
    return store.aiOutreach.add({
      profile_id: body.personId,
      chat_id: chatId,
      from_chat_id: asker.chatId,
      how: 'message',
      target: body.personId,
      target_label: name,
      reason: body.text.slice(0, 500),
      urgent: body.urgent,
      state: 'sent',
      detail: 'In their newest chat, with a notification.',
      expires_at: null,
      origin: asker.origin ?? null,
    });
  }

  async hangUp(outreachId: string): Promise<AiOutreachRow> {
    const { store } = this.options;
    const stopped = this.ringing.stop(outreachId);
    if (stopped !== null) {
      return stopped;
    }
    const call = this.hosting.call(outreachId);
    if (call !== undefined) {
      await call.end('hung_up');
      return store.aiOutreach.byId(outreachId);
    }
    const row = store.aiOutreach.byId(outreachId);
    throw new ReachRefusedError(
      row.state === 'live'
        ? 'This is playing or on their phone or computer; it ends by itself or from inside the call.'
        : 'This has already finished.',
    );
  }

  answered(answering: OutreachAnswering): OutreachAnswer {
    return this.ringing.answered(answering);
  }

  ended(outreachId: string, reason: CallEnding, summary: string | null): void {
    this.hosting.ended(outreachId);
    const row = this.options.store.aiOutreach.find(outreachId);
    if (row?.state !== 'live') {
      return;
    }
    const closed = this.options.store.aiOutreach.step(outreachId, {
      state: reason === 'failed' ? 'failed' : 'ended',
      detail: summary === null ? null : summary.slice(-2000),
    });
    this.closed(closed);
  }

  private async ring(asker: Asker, ring: Ring): Promise<AiOutreachRow> {
    const name = this.mayDisturb(asker, ring.personId, ring.urgent);
    withinLimit(this.options.store, ring.personId, this.options.clock.now());
    return this.ringing.start(ring.plan, {
      profile_id: ring.personId,
      chat_id: this.chatFor(asker, ring.personId, `Call from ${this.options.assistant.aiName()}`),
      from_chat_id: asker.chatId,
      how: ring.how,
      target: ring.personId,
      target_label: name,
      reason: ring.reason,
      urgent: ring.urgent,
      detail: null,
      origin: asker.origin ?? null,
    });
  }

  private async announce(
    row: AiOutreachRow,
    target: ResolvedTarget,
    line: { readonly clientId: string | null; readonly text: string },
    outcome: { returned: boolean },
  ): Promise<void> {
    const { text } = line;
    const { store, log } = this.options;
    const done = (failure: string | null): void => {
      store.aiOutreach.step(
        row.id,
        failure === null ? { state: 'sent' } : { state: 'failed', detail: failure },
      );
      if (failure !== null && outcome.returned) {
        this.closed(store.aiOutreach.byId(row.id));
      }
    };
    try {
      if (target.kind === 'plugin') {
        await target.speaker.speak(text);
        done(null);
      } else {
        await speakOnce(
          { ...this.options, aiName: this.options.assistant.aiName },
          { id: row.id, profileId: row.profile_id, clientId: line.clientId, text, target, done },
        );
      }
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      done(reason);
      log.warn('reach.speak_failed', { outreachId: row.id, reason });
      throw cause instanceof ReachRefusedError ? cause : new ReachRefusedError(reason);
    }
  }

  private mayDisturb(asker: Asker, personId: string, urgent: boolean): string {
    mayReach(asker, personId);
    const name = this.options.store.profiles.byId(personId).name;
    const quiet = this.options.rules.quietRefusal(personId, name, urgent);
    if (quiet !== null) {
      throw new ReachRefusedError(quiet);
    }
    return name;
  }

  private closed(row: AiOutreachRow): void {
    const from = row.from_chat_id;
    if (from === null || (row.state === 'ended' && from === row.chat_id)) {
      return;
    }
    try {
      this.options.assistant.turn(from, outcomeText(row), row.origin);
    } catch (cause) {
      this.options.log.error('reach.outcome_failed', cause, { outreachId: row.id });
    }
  }

  private chatFor(asker: Asker, personId: string, title: string): string {
    return asker.chatId !== null && asker.profileId === personId
      ? asker.chatId
      : this.options.assistant.conversationChat(personId, title);
  }
}

function targetId(target: ResolvedTarget): string {
  switch (target.kind) {
    case 'camera':
    case 'plugin':
      return target.device.id;
    case 'channel':
      return target.channel.id;
    case 'app':
      return target.client.id;
  }
}
