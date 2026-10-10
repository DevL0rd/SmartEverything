import type { FunctionDeclaration } from '@google/genai';
import {
  assistantLabel,
  type AssistantVoiceClientMessage,
  type CallEnding,
  type ClientRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { VoiceResponder } from '../assistant/voice-link';
import type { PriceBook } from '../ledger/gemini-live';
import type { Store } from '../store/store';
import { opusCodec, toSpeech, type OpusCodec } from './audio';
import {
  PLAYOUT_SLACK_MS,
  socketCallLink,
  type CallEndpoint,
  type VoiceEndpoint,
} from './call-link';
import { meter, toolCallerOf, type Call } from './call-parts';
import { CallRecord, type RecordedTurn } from './call-record';
import { Conversation } from './conversation';
import type { ConversationHooks } from './conversation-hooks';
import type { ToolAnswer } from './tool-answer';
import type { VoiceProvider } from './gemini';
import { liveInstructions } from './instructions';
import { combined, Outbox } from './outbox';
import type {
  HostedCall,
  HostedCallRequest,
  HostedSpeaking,
  OutreachAnswer,
  OutreachDesk,
} from './outreach';
import { callerOf, hostedCallerOf, personaOf, type Caller } from './persona';
import { SpokenConfirmation } from './spoken-confirmation';
import type { SpeechSource } from './speech-input';
import { NoSuchCallError, type VideoSource } from './video';
import { liveWindow } from './live-window';
import { hostedSet, voiceSet } from './voice-tools';

type CallStart = Extract<AssistantVoiceClientMessage, { type: 'call_start' }>;

export interface CallDeskOptions {
  readonly store: Store;
  readonly provider: VoiceProvider;
  readonly responder: VoiceResponder;
  readonly tools: ToolHub;
  readonly prices: PriceBook;
  readonly now: () => Date;
  readonly log: Logger;
}

interface CallSpec {
  readonly id: string;
  readonly endpoint: CallEndpoint;
  readonly caller: Caller;
  readonly chatId: string;
  readonly opening: string | null;
  readonly outreachId: string | null;
  readonly decoder: OpusCodec | null;
  readonly speech: SpeechSource;
  readonly speaking: HostedSpeaking | null;
  readonly heard?: () => Int16Array;
}

const NOTHING_CALLING = 'Nothing is calling you right now.';

export class CallDesk {
  private readonly calls = new Map<string, Call>();
  private readonly outbox = new Outbox();

  constructor(private readonly options: CallDeskOptions) {}

  private outreach: OutreachDesk | null = null;

  attachOutreach(desk: OutreachDesk): void {
    this.outreach = desk;
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
      caller,
      chatId,
      opening: answer?.opening ?? null,
      outreachId: message.answering ?? null,
      decoder: opusCodec(),
      speech: message.gated === true ? 'gated-client' : 'echo-cancelled',
      speaking: null,
    });
  }

  async host(request: HostedCallRequest): Promise<HostedCall> {
    const call = await this.open({
      id: request.callId,
      endpoint: request.endpoint,
      caller: hostedCallerOf(this.options.store, request.caller),
      chatId: request.opening.chatId,
      opening: request.opening.text,
      outreachId: request.opening.outreachId,
      decoder: null,
      speech: 'raw',
      speaking: request.speaking,
      ...(request.heard === undefined
        ? {}
        : { heard: this.backlog(request.callId, request.heard) }),
    });
    this.options.log.info('voice.call_hosted', { callId: call.id });
    return {
      hear: (pcm16k): void => {
        call.conversation.hear(pcm16k);
      },
      see: (frame): void => {
        call.conversation.video(frame);
      },
      end: (reason) => call.conversation.end(reason),
    };
  }

  private backlog(callId: string, heard: () => Int16Array): () => Int16Array {
    return (): Int16Array => {
      const words = heard();
      this.options.log.info('voice.backlog_sent', { callId, audioMs: words.length / 16 });
      return words;
    };
  }

  attachVideo(callId: string, source: VideoSource): () => void {
    const call = [...this.calls.values()].find((candidate) => candidate.id === callId);
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

  activity(endpointId: string, callId: string, speaking: boolean): boolean {
    const call = this.calls.get(endpointId);
    return call?.id !== callId || call.conversation.activity(speaking);
  }

  mute(endpointId: string, callId: string, muted: boolean): void {
    const call = this.calls.get(endpointId);
    if (call?.id === callId) {
      call.conversation.mute(muted);
    }
  }

  async hangUp(endpointId: string, callId: string | null, reason: CallEnding): Promise<void> {
    const call = this.calls.get(endpointId);
    if (call !== undefined && (callId === null || call.id === callId)) {
      await call.conversation.end(reason);
    }
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

  private hooks(call: () => Call, speech: SpeechSource): ConversationHooks {
    const { store, responder, tools } = this.options;
    return {
      speech,
      settings: () => store.assistantChat.settings().voice,
      system: () =>
        liveInstructions(
          personaOf({
            store,
            caller: call().caller,
            chatId: call().chatId,
            unavailable: responder.ready(call().chatId),
            catalogue: tools.catalogue(tools.list()),
            now: this.options.now(),
          }),
        ),
      window: () => liveWindow(store.assistantChat.settings()),
      tools: (): readonly FunctionDeclaration[] =>
        tools.geminiDeclarations(
          hostedSet(
            voiceSet(tools.list(), responder.ready(call().chatId) === null),
            call().speaking,
          ),
        ),
      record: (turn): void => {
        this.recordTurn(call(), turn);
      },
      task: (task, said) => this.task(call(), task, said),
      run: async (name, args, heardSince): Promise<ToolAnswer> => {
        const result = await call().spoken.run(name, args, toolCallerOf(call()), heardSince);
        return { response: result.response, line: result.line, pictures: result.pictures };
      },
      ended: (reason, detail): void => {
        this.ended(call(), reason, detail);
      },
      usage: (usage, model): void => {
        meter(this.options, call(), usage, model);
      },
      stalled: (step): void => {
        this.options.log.warn('voice.no_reply', { callId: call().id, step });
      },
    };
  }

  private recordTurn(call: Call, turn: RecordedTurn): void {
    call.record.add(turn);
    if (turn.who === 'tool') {
      call.endpoint.send({ type: 'caption', callId: call.id, who: 'tool', text: turn.text });
    }
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
    const { store, tools } = this.options;
    const record = new CallRecord(store, {
      chatId: spec.chatId,
      profileId: spec.caller.profileId,
      clientId: spec.caller.clientId,
      author: assistantLabel(store.assistantChat.settings()),
      person: spec.caller.person,
    });
    const slack = spec.decoder === null ? PLAYOUT_SLACK_MS.hosted : PLAYOUT_SLACK_MS.app;
    const target = { callId: spec.id, chatId: spec.chatId };
    const link = socketCallLink(spec.endpoint, target, Date.now, slack);
    const call: Call = {
      ...spec,
      record,
      spoken: new SpokenConfirmation(tools),
      detachers: [],
      conversation: new Conversation(
        this.options.provider,
        link,
        this.hooks(() => call, spec.speech),
      ),
    };
    this.calls.set(spec.endpoint.id, call);
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

  private task(call: Call, task: string, said: string | null): string {
    const eventId = this.options.responder.request({
      profileId: call.caller.profileId,
      clientId: call.caller.clientId,
      device: call.caller.device,
      task,
      said,
      callMessageId: call.record.messageId,
      chatId: call.chatId,
    });
    this.outbox.track(eventId, call.caller.profileId);
    return eventId;
  }

  private ended(call: Call, reason: CallEnding, detail: string | null): void {
    if (this.calls.get(call.endpoint.id) === call) {
      this.calls.delete(call.endpoint.id);
    }
    call.decoder?.free();
    call.detachers.splice(0).forEach((stop) => {
      stop();
    });
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
    if (reason === 'failed') {
      this.options.log.warn('voice.call_failed', { callId: call.id, reason: detail });
    } else {
      this.options.log.info('voice.call_ended', { callId: call.id, ending: reason });
    }
  }
}
