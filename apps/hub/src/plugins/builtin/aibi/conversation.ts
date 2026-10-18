import { Logger, background, describeFailure, messageOf } from '@smarteverything/logging';
import type { CallEnding } from '@smarteverything/domain';
import type { Picture } from '../../../assistant-voice/gemini';
import { FAREWELL, WAITING, combined } from './conversation-text';
import { wrapTool, type ToolDesk } from './conversation-tools';
import type { ConversationHooks, DeskAnswer, VoiceTurn } from './conversation-types';
import { IdleTimer } from './idle-timer';
import { BigEndianPcm } from './pcm';
import { SpeechGate } from './rms-gate';
import { Errand } from './errand';
import { clean, type SpeechStream, type Speeches } from './speech-stream';
import { TURN_TIMEOUT_MS, Turn, type BodyOutcome, type Outcome } from './turn';

const log = new Logger('hub.aibi-conversation');

export class Conversation {
  private session: Promise<VoiceTurn> | null = null;
  private reopening: Promise<void> = Promise.resolve();
  private turn: Turn | null = null;
  private spare: Turn | null = null;
  private errand: Errand | null = null;
  private errandTurn = false;
  private queued: Extract<BodyOutcome, { readonly kind: 'action' }> | null = null;
  private readonly untold: string[] = [];
  private ending = false;
  private closed = false;
  private turns = 0;
  private chat = false;
  private readonly idle: IdleTimer;
  private readonly toolDesk: ToolDesk;

  constructor(
    private readonly speeches: Speeches,
    private readonly hooks: ConversationHooks,
    private readonly oneShot = false,
  ) {
    this.idle = new IdleTimer({
      seconds: (): number => hooks.settings().idleSeconds,
      busy: (): boolean => hooks.working() || this.turn !== null,
      expired: (): void => {
        background(this.end(), 'conversation.end_failed');
      },
    });
    this.toolDesk = {
      turn: (): Turn | null => this.turn,
      markEnding: (): void => {
        this.markEnding();
      },
      shape: (turn, answer): void => {
        this.shape(turn, answer);
      },
      deliver: (outcome): boolean => this.deliver(outcome),
    };
  }

  get active(): boolean {
    return !this.closed;
  }

  async open(): Promise<VoiceTurn> {
    await this.reopening;
    this.session ??= this.connect().catch((error: unknown) => {
      background(this.end(), 'conversation.end_failed');
      throw error instanceof Error ? error : new Error('The conversation could not open');
    });
    return this.session;
  }

  private connect(): Promise<VoiceTurn> {
    return this.hooks.open({
      tools: this.oneShot ? [] : this.hooks.tools().map((tool) => wrapTool(this.toolDesk, tool)),
      events: {
        audio: (pcm): void => {
          (this.speaker() ?? this.current()).audio(pcm);
        },
        said: (text): void => {
          (this.speaker() ?? this.current()).text(text);
        },
        heard: (text): void => {
          if (this.turn !== null) {
            this.turn.hear(text);
          }
        },
        interrupted: (): void => undefined,
        spoken: (): boolean => this.spokenNow(),
        turnComplete: (): void => {
          this.complete();
        },
        ended: (reason, detail): void => {
          this.sessionEnded(reason, detail);
        },
      },
    });
  }

  private speaker(): Errand | null {
    return this.turn === null ? this.errand : null;
  }

  private current(): Turn {
    if (this.turn !== null) {
      return this.turn;
    }
    this.spare ??= new Turn(this.speeches, 'tts', TURN_TIMEOUT_MS, () => undefined);
    return this.spare;
  }

  async listen(chunks: AsyncIterable<Buffer>, chat: boolean): Promise<Outcome> {
    this.chat = chat;
    if (this.ending) {
      for await (const chunk of chunks) {
        void chunk;
      }
      return this.untold.length > 0 ? this.tellUntold() : this.quit();
    }
    const session = await this.open();
    const pcm = new BigEndianPcm();
    const gate = new SpeechGate(this.hooks.settings().speechThreshold);
    let turn: Turn | null = null;
    for await (const chunk of chunks) {
      for (const released of gate.push(pcm.push(chunk))) {
        turn ??= this.begin(session);
        session.hear(released);
      }
    }
    if (turn !== null) {
      session.finish();
    }
    return this.enter(await (turn === null ? this.silent() : this.finish(turn)));
  }

  private silent(): Outcome | Promise<Outcome> {
    const { queued } = this;
    if (queued !== null) {
      this.queued = null;
      return queued;
    }
    if (this.untold.length > 0) {
      return this.tellUntold();
    }
    if (!this.chat) {
      return { kind: 'unheard' };
    }
    return this.turns === 0 ? this.quit() : { kind: 'pause' };
  }

  private dismiss(outcome: Extract<Outcome, { readonly kind: 'speech' }>): Outcome {
    outcome.stream.fail();
    this.markEnding();
    return { kind: 'pause', heard: outcome.heard ?? '' };
  }

  private enter(outcome: Outcome): Outcome {
    if (outcome.kind !== 'speech') {
      return outcome;
    }
    const heard = outcome.heard ?? '';
    if (this.chat) {
      return this.ending && this.untold.length === 0
        ? { kind: 'farewell', answer: outcome, heard }
        : outcome;
    }
    if (this.errandTurn) {
      return outcome;
    }
    if (this.unwelcome(outcome.text)) {
      return this.dismiss(outcome);
    }
    this.chat = true;
    return { kind: 'connect', answer: outcome, heard };
  }

  private begin(session: VoiceTurn): Turn {
    this.turns += 1;
    this.queued = null;
    this.spare = null;
    if (this.untold.length > 0) {
      session.say(`${combined(this.untold.splice(0))}\n\n${WAITING}`, false);
    }
    const turn = new Turn(this.speeches, 'tts', TURN_TIMEOUT_MS, () => {
      this.stalled('AIBI was told to keep listening.');
    });
    turn.listened = true;
    this.turn = turn;
    session.begin();
    return turn;
  }

  async prompt(text: string, kind: 'tts' | 'poweron' = 'tts', image?: Picture): Promise<Outcome> {
    const session = await this.open();
    this.turns += 1;
    this.touch();
    const turn = new Turn(this.speeches, kind, TURN_TIMEOUT_MS, () => {
      this.stalled(text.slice(0, 120));
    });
    this.turn = turn;
    if (image === undefined) {
      session.say(text, true);
    } else {
      session.picture(text, image);
    }
    return this.finish(turn);
  }

  photo(image: Buffer, mimeType: string, text: string): Promise<Outcome> {
    return this.prompt(text, 'tts', { data: image, mimeType });
  }

  private async finish(turn: Turn): Promise<Outcome> {
    const outcome = await turn.outcome;
    if (outcome.kind === 'quit') {
      background(this.end(), 'conversation.end_failed');
    }
    return outcome;
  }

  private touch(): void {
    if (this.oneShot || this.closed) {
      this.idle.clear();
    } else {
      this.idle.restart();
    }
  }

  private tellUntold(): Promise<Outcome> {
    return this.prompt(combined(this.untold.splice(0)));
  }

  tell(note: string): void {
    if (this.closed) {
      return;
    }
    if (this.errand === null) {
      this.untold.push(note);
    } else {
      this.sayNow(note, this.errand);
    }
  }

  private sayNow(note: string, errand: Errand): void {
    errand.finish();
    this.session
      ?.then((session) => {
        session.say(note, true);
      })
      .catch((error: unknown) => {
        this.hooks.warn('AIBI could not be told something', messageOf(error));
        errand.release();
      });
  }

  private quit(): Outcome {
    background(this.end(), 'conversation.end_failed');
    return { kind: 'quit' };
  }

  private complete(): void {
    if (this.turn === null) {
      if (this.errand === null) {
        this.discardSpare();
      } else {
        this.errand.complete();
      }
      return;
    }
    const turn = this.turn;
    if (turn.skipAcknowledgement()) {
      return;
    }
    this.turn = null;
    this.record(turn);
    turn.complete();
    if (turn.held !== null) {
      this.hold(turn.held);
    }
    if ((this.ending && this.untold.length === 0) || this.oneShot) {
      background(this.end(), 'conversation.end_failed');
    }
  }

  private hold(stream: SpeechStream): void {
    this.errand = new Errand(
      stream,
      (text) => {
        this.hooks.said(text);
      },
      () => {
        this.errand = null;
        this.errandTurn = false;
      },
    );
  }

  private discardSpare(): void {
    this.spare?.abort();
    this.spare = null;
  }

  private record(turn: Turn): void {
    const heard = clean(turn.heard);
    const said = clean(turn.said);
    const spoken = this.spokenBy(turn) ? said : '';
    if (heard !== '') {
      this.hooks.heard(heard);
    }
    if (spoken !== '') {
      this.hooks.said(spoken);
    }
    if (heard !== '' || spoken !== '') {
      this.touch();
    }
    if (FAREWELL.test(said)) {
      this.markEnding();
    }
  }

  private spokenNow(): boolean {
    return this.turn === null ? this.errand !== null : this.spokenBy(this.turn);
  }

  private spokenBy(turn: Turn): boolean {
    const aside =
      turn.listened && !this.chat && !this.errandTurn && this.unwelcome(clean(turn.said));
    return turn.spoken && !aside;
  }

  private unwelcome(said: string): boolean {
    return this.ending || this.closed || FAREWELL.test(said);
  }

  private shape(turn: Turn, answer: DeskAnswer): void {
    if (answer.spoken === true) {
      turn.expectAnswer();
    }
    if (answer.holds !== true || this.chat) {
      return;
    }
    turn.keepStreamOpen();
    this.errandTurn = true;
  }

  private markEnding(): void {
    this.ending = true;
    this.turn?.markEnding();
  }

  private deliver(outcome: BodyOutcome): boolean {
    if (this.turn?.act(outcome) === true) {
      return true;
    }
    if (outcome.kind !== 'action') {
      return false;
    }
    this.queued = outcome;
    return true;
  }

  private stalled(detail: string): void {
    this.hooks.warn(
      'Gemini did not answer in time',
      `${detail} A new Gemini session is started for the next turn.`,
    );
    this.turn = null;
    const stale = this.session;
    if (stale === null) {
      return;
    }
    this.reopening = stale
      .then((session) => session.reopen())
      .catch((error: unknown) => {
        this.hooks.warn('Gemini did not reopen', messageOf(error));
      });
  }

  private sessionEnded(reason: CallEnding, detail: string | null): void {
    if (this.closed) {
      return;
    }
    if (reason === 'failed') {
      this.hooks.warn('Gemini Live closed the conversation', detail ?? '');
    }
    background(this.end(), 'conversation.end_failed');
  }

  async end(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.idle.clear();
    this.turn?.abort();
    this.spare?.abort();
    this.errand?.release();
    const session = await this.session?.catch((cause: unknown) => {
      log.debug('session.open_failed_at_end', () => ({ error: describeFailure(cause).message }));
      return null;
    });
    session?.end();
    this.hooks.ended(this, this.untold.splice(0));
  }
}
