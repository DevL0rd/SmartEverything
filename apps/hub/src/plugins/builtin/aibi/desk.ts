import { robotMoveLabel, type InboundMessage, type RobotReport } from '@smarteverything/domain';
import type { PluginVoice } from '../../plugin-voice';
import type { PluginAssistant } from '../contract';
import type { ActivityLog } from './activity';
import { ROBOT_CONVERSATION } from './assistant-commands';
import { checkAction, type Abilities, type Params } from './catalogue';
import { Conversation } from './conversation';
import { combined } from './conversation-text';
import type { ConversationHooks, VoiceTurn } from './conversation-types';
import { deskTools } from './desk-tools';
import { replyFor, type TurnInfo } from './desk-reply';
import {
  oneShotInstructions,
  ROBOT_ENDING,
  robotInstructions,
  type RobotPersona,
} from './place-instructions';
import type { Photos } from './photos';
import { chatStart, failed, photoAnswer, tagged, chatMode, type Reply } from './replies';
import type { Speeches } from './speech-stream';
import { TELL_NOW, Tasks, type TaskResult } from './tasks';
import type { Outcome } from './turn';
import { reportLine } from './status-report';
import type { AibiSettings } from './settings';
import { messageOf } from '@smarteverything/logging';

const LEAVE_FOR_MS = 60_000;
const READ_ALOUD_MAX = 1000;
const SAY_MAX = 2000;

const PHOTO_PROMPT = '[This is the photo you just took with your camera. Answer about it now.]';
const POWER_ON_PROMPT = '[You just powered on. Say a very short hello.]';
const SAY_PREFIX = '[Say this to them, naturally and in your own words]';
const ACT_PREFIX = '[Do this with your body now with aibi_action, saying nothing]';
const TITLE = 'AIBI robot';

export interface DeskHost {
  readonly settings: () => AibiSettings;
  readonly voice: Pick<PluginVoice, 'turn'>;
  readonly assistant: PluginAssistant;
  readonly post: (message: InboundMessage) => void;
  readonly senderId: () => string;
  readonly activity: ActivityLog;
  readonly speeches: Speeches;
  readonly photos: Photos;
  readonly report: () => RobotReport | null;
  readonly deviceExternalId: () => string | null;
  readonly changed: () => void;
  readonly now: () => Date;
}

export interface DeskStatus {
  readonly conversation: boolean;
  readonly waiting: number;
  readonly tasks: number;
}

function validZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch (cause) {
    if (cause instanceof RangeError) {
      return false;
    }
    throw cause;
  }
}

export class VoiceDesk {
  private conversation: Conversation | null = null;
  private readonly outbox: string[] = [];
  private leavingUntil = 0;
  private readonly tasks: Tasks;
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  constructor(private readonly host: DeskHost) {
    this.tasks = new Tasks({
      post: host.post,
      senderId: host.senderId,
      activity: host.activity,
      tell: (note): 'now' | 'later' => this.tell(note),
      changed: host.changed,
    });
  }

  get active(): boolean {
    return this.conversation?.active === true;
  }

  status(): DeskStatus {
    return { conversation: this.active, waiting: this.outbox.length, tasks: this.tasks.count };
  }

  zone(value: string | null): void {
    if (value !== null && value !== '' && validZone(value)) {
      this.timeZone = value;
    }
  }

  async listen(chunks: AsyncIterable<Buffer>, info: TurnInfo): Promise<Reply> {
    this.zone(info.timeZone);
    if (!info.chat) {
      this.leavingUntil = 0;
    }
    if (info.chat && !this.active && this.host.now().getTime() < this.leavingUntil) {
      for await (const chunk of chunks) {
        void chunk;
      }
      return chatMode({ index: info.index, queryText: '' }, 'quit');
    }
    const outcome = await this.start()
      .listen(chunks, info.chat)
      .catch((error: unknown) => this.failure(error));
    return replyFor(outcome, info, this.host.speeches);
  }

  async look(image: Buffer, mimeType: string): Promise<Reply> {
    const path = await this.host.photos.save(image, mimeType);
    this.host.activity.add('request', 'AIBI sent a photo', path);
    const outcome = await this.start()
      .photo(image, mimeType, PHOTO_PROMPT)
      .catch((error: unknown) => this.failure(error));
    if (outcome.kind !== 'speech') {
      return replyFor(outcome, { index: 0, chat: false }, this.host.speeches);
    }
    return photoAnswer({ text: outcome.text, url: outcome.stream.url, queryText: '', index: 0 });
  }

  async chatStart(timeZone: string | null): Promise<Reply> {
    this.zone(timeZone);
    const notes = this.outbox.splice(0);
    if (notes.length === 0) {
      return failed('chatstart', 'Nothing to say right now');
    }
    const outcome = await this.start()
      .prompt(`${combined(notes)}\n\n${TELL_NOW}`)
      .catch((error: unknown) => this.failure(error));
    if (outcome.kind === 'speech') {
      return chatStart(outcome.stream.url);
    }
    this.outbox.unshift(...notes);
    return failed('chatstart', 'Nothing to say right now');
  }

  powerOn(timeZone: string | null): Promise<Reply> {
    this.zone(timeZone);
    return this.oneShot('poweronvoice', POWER_ON_PROMPT, 'poweron');
  }

  readAloud(text: string): Promise<Reply> {
    return this.oneShot(
      'tts',
      `[Read this aloud exactly, word for word, nothing else] ${text.slice(0, READ_ALOUD_MAX)}`,
      'tts',
    );
  }

  tell(note: string): 'now' | 'later' {
    if (this.conversation?.active === true) {
      this.conversation.tell(note);
      return 'now';
    }
    this.outbox.push(note);
    this.host.changed();
    return 'later';
  }

  say(text: string): 'now' | 'later' {
    return this.tell(`${SAY_PREFIX} ${text.slice(0, SAY_MAX)}`);
  }

  playAction(behavior: string, params: Readonly<Record<string, unknown>>): boolean {
    const checked = checkAction(this.abilities(), behavior, params);
    if (this.conversation?.active !== true) {
      return false;
    }
    this.conversation.tell(`${ACT_PREFIX} ${checked.action.id} ${JSON.stringify(checked.params)}`);
    return true;
  }

  result(eventId: string, content: string, quiet: boolean): TaskResult {
    return this.tasks.result(eventId, content, quiet);
  }

  async end(): Promise<void> {
    await this.conversation?.end();
  }

  private abilities(): Abilities {
    const { actions, animations } = this.host.settings();
    return { actions, animations };
  }

  private async oneShot(tag: string, prompt: string, kind: 'tts' | 'poweron'): Promise<Reply> {
    const outcome = await this.start(true)
      .prompt(prompt, kind)
      .catch((error: unknown) => this.failure(error));
    return outcome.kind === 'speech'
      ? tagged(tag, { url: outcome.stream.url })
      : failed(tag, 'Speech is unavailable');
  }

  private start(oneShot = false): Conversation {
    if (!oneShot && this.conversation?.active === true) {
      return this.conversation;
    }
    const conversation = new Conversation(this.host.speeches, this.hooks(oneShot), oneShot);
    if (oneShot) {
      return conversation;
    }
    this.conversation = conversation;
    for (const note of this.outbox.splice(0)) {
      conversation.tell(note);
    }
    this.host.activity.add('chat', 'Conversation started');
    this.host.changed();
    return conversation;
  }

  private failure(error: unknown): Outcome {
    this.host.activity.add('warning', 'Gemini Live failed', messageOf(error));
    return { kind: 'quit' };
  }

  private persona(): RobotPersona {
    const report = this.host.report();
    const settings = this.host.settings();
    return {
      personality: settings.personality,
      ownerName: settings.owner_name,
      timeZone: this.timeZone,
      robot: report === null ? '' : reportLine(report),
      now: this.host.now(),
    };
  }

  private open(
    oneShot: boolean,
    request: Parameters<ConversationHooks['open']>[0],
  ): Promise<VoiceTurn> {
    const settings = this.host.settings();
    const externalId = this.host.deviceExternalId();
    return this.host.voice.turn({
      title: TITLE,
      label: TITLE,
      speaker: null,
      place: oneShot ? oneShotInstructions(this.persona()) : robotInstructions(this.persona()),
      opening: null,
      tools: request.tools,
      events: request.events,
      conversation: { key: ROBOT_CONVERSATION, earlier: oneShot ? 0 : settings.memory_lines },
      hidden: ['task_start'],
      ...(externalId === null ? {} : { deviceExternalId: externalId }),
      ...(oneShot ? { bare: true } : { ending: ROBOT_ENDING }),
    });
  }

  private hooks(oneShot: boolean): ConversationHooks {
    const { activity } = this.host;
    return {
      settings: (): ReturnType<ConversationHooks['settings']> => {
        const settings = this.host.settings();
        return { idleSeconds: settings.idle_seconds, speechThreshold: settings.speech_threshold };
      },
      open: (request) => this.open(oneShot, request),
      tools: () =>
        deskTools({
          abilities: () => this.abilities(),
          acted: (id, params): void => {
            this.acted(id, params);
          },
          task: (text, quick) => this.tasks.start(text, quick),
          assistant: this.host.assistant,
        }),
      heard: (text): void => {
        activity.add('heard', text);
      },
      said: (text): void => {
        activity.add('said', text);
      },
      warn: (title, detail): void => {
        activity.add('warning', title, detail);
      },
      working: () => this.tasks.count > 0,
      ended: (conversation, untold): void => {
        if (this.conversation !== conversation) {
          return;
        }
        this.outbox.unshift(...untold);
        this.conversation = null;
        this.leavingUntil = this.host.now().getTime() + LEAVE_FOR_MS;
        activity.add('chat', 'Conversation ended');
        this.host.changed();
      },
    };
  }

  private acted(id: string, params: Params): void {
    this.host.activity.add(
      'action',
      robotMoveLabel(id),
      Object.keys(params).length > 0 ? `${id} ${JSON.stringify(params)}` : id,
    );
  }
}
