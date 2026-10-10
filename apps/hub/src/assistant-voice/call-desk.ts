import {
  assistantLabel,
  type AssistantVoiceClientMessage,
  type CallEnding,
  type CallSource,
  type ClientRow,
  type SightFrame,
} from '@smarteverything/domain';
import { opusCodec, toSpeech, type OpusCodec } from './audio';
import { hostedCallOf } from './call-hosted';
import { conversationHooks, type CallHooksDeps } from './call-hooks';
import {
  PLAYOUT_SLACK_MS,
  socketCallLink,
  type CallEndpoint,
  type VoiceEndpoint,
} from './call-link';
import { CallLive, type Call, type CallDeskOptions, type SightBudget } from './call-parts';
import { CallRecord } from './call-record';
import { adoptEndpoint, holdCall } from './call-resume';
import { routeSight, SightCalls, type SightMessage } from './call-sight-desk';
import { callSightOf } from './call-sight-ports';
import { EndpointSlot } from './call-slot';
import { Conversation } from './conversation';
import { combined, Outbox } from './outbox';
import type {
  HostedCall,
  HostedCallRequest,
  HostedListening,
  HostedSpeaking,
  OutreachAnswer,
  OutreachDesk,
} from './outreach';
import { callerOf, hostedCallerOf, type Caller } from './persona';
import { answeredCaller } from './plugin-caller';
import type { SpeechSource } from './speech-input';
import { NoSuchCallError, type VideoSource } from './video';

type CallStart = Extract<AssistantVoiceClientMessage, { type: 'call_start' }>;

export type { CallDeskOptions };

interface CallSpec {
  readonly id: string;
  readonly endpoint: CallEndpoint;
  readonly caller: Caller;
  readonly chatId: string;
  readonly source: CallSource | null;
  readonly opening: string | null;
  readonly outreachId: string | null;
  readonly decoder: OpusCodec | null;
  readonly speech: SpeechSource;
  readonly speaking: HostedSpeaking | null;
  readonly listening: HostedListening | null;
  readonly pluginId: string | null;
  readonly place: string | null;
  readonly heard?: () => Int16Array;
}

const NOTHING_CALLING = 'Nothing is calling you right now.';

export class CallDesk {
  private readonly calls = new Map<string, Call>();
  readonly sights = new SightCalls(() => this.calls.values());
  private readonly outbox = new Outbox();
  private readonly deps: CallHooksDeps;
  private outreach: OutreachDesk | null = null;
  private budget: SightBudget | null = null;

  constructor(private readonly options: CallDeskOptions) {
    this.deps = {
      options,
      outbox: this.outbox,
      ended: (call, reason, detail): void => {
        this.ended(call, reason, detail);
      },
    };
  }

  attachOutreach(desk: OutreachDesk): void {
    this.outreach = desk;
  }

  attachBudget(budget: SightBudget): void {
    this.budget = budget;
  }

  async start(endpoint: VoiceEndpoint, client: ClientRow, message: CallStart): Promise<void> {
    await this.calls.get(endpoint.id)?.conversation.end('replaced');
    const caller = callerOf(this.options.store, client, message.device);
    const chatId = this.options.responder.chatForCall({
      profileId: caller.profileId,
      clientId: client.id,
      device: caller.device,
      chatId: message.chatId ?? null,
    });
    const answer = this.answer(message, client.id, chatId);
    if (answer?.kind === 'refused') {
      endpoint.send({
        type: 'ended',
        callId: message.callId,
        reason: 'failed',
        detail: answer.reason,
      });
      return;
    }
    this.options.log.info('voice.call_started', { callId: message.callId, source: message.source });
    await this.open({
      id: message.callId,
      endpoint,
      caller: answeredCaller(caller, answer),
      chatId,
      source: message.source,
      opening: answer?.opening ?? null,
      outreachId: message.answering ?? null,
      decoder: opusCodec(),
      speech: message.gated === true ? 'gated-client' : 'echo-cancelled',
      speaking: null,
      listening: null,
      pluginId: null,
      place: null,
    });
  }

  async host(request: HostedCallRequest): Promise<HostedCall> {
    const call = await this.open({
      id: request.callId,
      endpoint: request.endpoint,
      caller: hostedCallerOf(this.options.store, request.caller),
      chatId: request.opening.chatId,
      source: null,
      opening: request.opening.text,
      outreachId: request.opening.outreachId,
      decoder: null,
      speech: request.listening?.echoFree === true ? 'echo-free' : 'raw',
      speaking: request.speaking,
      listening: request.listening ?? null,
      pluginId: request.pluginId ?? null,
      place: request.place ?? null,
      ...(request.heard === undefined
        ? {}
        : { heard: this.backlog(request.callId, request.heard) }),
    });
    this.options.log.info('voice.call_hosted', { callId: call.id });
    return hostedCallOf(call);
  }

  private backlog(callId: string, heard: () => Int16Array): () => Int16Array {
    return (): Int16Array => {
      const words = heard();
      this.options.log.info('voice.backlog_sent', { callId, audioMs: words.length / 16 });
      return words;
    };
  }

  attachVideo(callId: string, source: VideoSource): () => void {
    const call = this.byId(callId);
    if (call === undefined) {
      throw new NoSuchCallError(callId);
    }
    const stop = source.onFrame((frame) => {
      call.conversation.video(frame);
    });
    call.detachers.push(stop);
    return (): void => {
      const index = call.detachers.indexOf(stop);
      if (index >= 0) {
        call.detachers.splice(index, 1);
        stop();
      }
    };
  }

  audio(endpointId: string, packet: Uint8Array): void {
    const call = this.calls.get(endpointId);
    if (call === undefined) {
      return;
    }
    if (call.decoder !== null) {
      call.conversation.hear(toSpeech(call.decoder.decode(packet)));
    }
  }

  sightFrame(endpointId: string, frame: SightFrame): void {
    this.calls.get(endpointId)?.sight?.frame(frame);
  }

  activity(endpointId: string, callId: string, speaking: boolean): boolean {
    const call = this.calls.get(endpointId);
    return call?.id !== callId || call.conversation.activity(speaking);
  }

  mute(endpointId: string, callId: string, muted: boolean): void {
    const call = this.calls.get(endpointId);
    if (call?.id === callId) {
      call.live.mute(muted);
      call.conversation.mute(muted);
    }
  }

  interrupt(endpointId: string, callId: string): void {
    const call = this.calls.get(endpointId);
    if (call?.id === callId) {
      call.conversation.interrupt();
    }
  }

  sight(endpointId: string, message: SightMessage): void {
    const call = this.calls.get(endpointId);
    if (call?.id !== message.callId || call.sight === null) {
      this.options.log.warn('voice.sight_refused', { callId: message.callId, type: message.type });
      return;
    }
    routeSight(call, call.sight, message);
  }

  async hangUp(endpointId: string, callId: string | null, reason: CallEnding): Promise<void> {
    const call = this.calls.get(endpointId);
    if (call !== undefined && (callId === null || call.id === callId)) {
      await call.conversation.end(reason);
    }
  }

  detach(endpointId: string): void {
    const call = this.calls.get(endpointId);
    if (call === undefined) {
      return;
    }
    if (call.live.modern) {
      holdCall(call, this.options.log);
    } else {
      void call.conversation.end('disconnected');
    }
  }

  resume(endpoint: VoiceEndpoint, client: ClientRow, callId: string): void {
    const call = this.byId(callId);
    if (call?.caller.clientId !== client.id) {
      endpoint.send({
        type: 'ended',
        callId,
        reason: 'disconnected',
        detail: 'The call is no longer running.',
      });
      return;
    }
    this.calls.delete(call.endpoint.id);
    adoptEndpoint(call, endpoint);
    this.calls.set(endpoint.id, call);
    this.options.log.info('voice.call_resumed', { callId });
  }

  isOpen(callMessageId: string): boolean {
    return [...this.calls.values()].some((call) => call.record.messageId === callMessageId);
  }

  result(eventId: string, text: string): boolean {
    const told = [...this.calls.values()].some((call) =>
      call.conversation.taskUpdate(eventId, text),
    );
    if (told) {
      return true;
    }
    const profileId = this.outbox.ownerOf(eventId);
    if (profileId === null) {
      return false;
    }
    this.outbox.add(
      profileId,
      `[Task update] ${text}\nTell them how it went now, briefly and in your own words, as your own work.`,
    );
    return true;
  }

  async stop(): Promise<void> {
    await Promise.all(
      [...this.calls.values()].map((call) => call.conversation.end('disconnected')),
    );
  }

  private byId(callId: string): Call | undefined {
    return [...this.calls.values()].find((candidate) => candidate.id === callId);
  }

  private answer(message: CallStart, clientId: string, chatId: string): OutreachAnswer | null {
    if (message.answering === undefined) {
      return null;
    }
    if (this.outreach === null) {
      return { kind: 'refused', reason: NOTHING_CALLING };
    }
    return this.outreach.answered({
      outreachId: message.answering,
      callId: message.callId,
      clientId,
      chatId,
    });
  }

  private async open(spec: CallSpec): Promise<Call> {
    const { store } = this.options;
    const record = new CallRecord(store, {
      chatId: spec.chatId,
      profileId: spec.caller.profileId,
      clientId: spec.caller.clientId,
      author: assistantLabel(store.assistantChat.settings()),
      person: spec.caller.person,
    });
    const slack =
      spec.listening?.playoutSlackMs ??
      (spec.decoder === null ? PLAYOUT_SLACK_MS.hosted : PLAYOUT_SLACK_MS.app);
    const slot = new EndpointSlot(spec.endpoint);
    const link = socketCallLink(slot, { callId: spec.id, chatId: spec.chatId }, Date.now, slack);
    const hooks = conversationHooks(this.deps, () => call, spec.speech, spec.listening);
    const call: Call = {
      ...spec,
      endpoint: slot,
      link,
      startedAt: this.options.now(),
      live: new CallLive(),
      sight:
        spec.decoder === null
          ? null
          : callSightOf(
              this.options,
              spec.id,
              () => call,
              () => this.budget,
            ),
      record,
      detachers: [],
      conversation: new Conversation(this.options.provider, link, hooks),
    };
    this.calls.set(slot.id, call);
    const notes = [
      ...(spec.opening === null ? [] : [spec.opening]),
      ...this.outbox.take(spec.caller.profileId),
    ];
    await call.conversation
      .start(notes.length > 0 ? combined(notes) : null, spec.heard)
      .catch(async (cause: unknown) => {
        await call.conversation.end(
          'failed',
          cause instanceof Error ? cause.message : 'Gemini did not connect',
        );
      });
    return call;
  }

  private ended(call: Call, reason: CallEnding, detail: string | null): void {
    if (this.calls.get(call.endpoint.id) === call) {
      this.calls.delete(call.endpoint.id);
    }
    this.teardown(call);
    call.record.close();
    this.options.responder.callEnded(call.chatId, call.record.transcript());
    if (call.outreachId !== null) {
      const summary = call.record.transcript();
      this.outreach?.ended(call.outreachId, reason, summary === '' ? null : summary);
    }
    call.endpoint.send({
      type: 'ended',
      callId: call.id,
      reason,
      detail: detail?.slice(0, 200) ?? null,
    });
    this.logEnd(call, reason, detail);
  }

  private teardown(call: Call): void {
    call.live.release();
    call.sight?.end();
    call.decoder?.free();
    call.detachers.splice(0).forEach((stop) => {
      stop();
    });
  }

  private logEnd(call: Call, reason: CallEnding, detail: string | null): void {
    if (reason === 'failed') {
      this.options.log.warn('voice.call_failed', { callId: call.id, reason: detail });
    } else {
      this.options.log.info('voice.call_ended', { callId: call.id, ending: reason });
    }
  }
}
