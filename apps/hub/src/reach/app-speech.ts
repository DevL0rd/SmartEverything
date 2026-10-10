import {
  AI_SPEECH_FETCH_SECONDS,
  ApiError,
  type AiSpeechNotice,
  type AiSpeechPush,
  type ClientRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { PushCommandChannel } from '../extensions/push/commands';

export interface AppSpeechDeps {
  readonly online: () => ReadonlySet<string>;
  readonly toClient: (clientId: string, notice: AiSpeechNotice) => Promise<number>;
  readonly pushTargets: () => ReadonlySet<string>;
  readonly pushConfigured: () => boolean;
  readonly push: Pick<PushCommandChannel, 'send'>;
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
}

interface Waiting {
  readonly clientId: string;
  readonly notice: AiSpeechNotice;
  readonly fetched: () => void;
}

const FETCH_MS = AI_SPEECH_FETCH_SECONDS * 1000;

export class AppSpeech {
  private readonly waiting = new Map<string, Waiting>();

  constructor(private readonly deps: AppSpeechDeps) {}

  refusal(client: ClientRow): string | null {
    if (this.deps.online().has(client.id) || this.pushable(client)) {
      return null;
    }
    return `SmartEverything is not open on ${client.name} and it cannot be reached by push (${this.whyNotPushable(client)}); ring the person or send them a notification instead.`;
  }

  async play(client: ClientRow, notice: AiSpeechNotice): Promise<string | null> {
    if ((await this.deps.toClient(client.id, notice)) > 0) {
      return null;
    }
    const reason = this.refusal(client);
    if (reason !== null) {
      return reason;
    }
    const fetched = this.expect(client.id, notice);
    const push: AiSpeechPush = {
      id: notice.id,
      expiresAt: new Date(this.deps.clock.now().getTime() + FETCH_MS).toISOString(),
    };
    const sent = await this.deps.push.send({
      clientId: client.id,
      command: 'ai_speech',
      payload: push,
      collapseKey: `ai_speech_${notice.id}`,
    });
    if (sent.outcome !== 'sent') {
      this.waiting.delete(notice.id);
      this.deps.log.warn('reach.speech_push_failed', { clientId: client.id, reason: sent.reason });
      return `${client.name} could not be notified by push: ${sent.reason}`;
    }
    return (await fetched)
      ? null
      : `${client.name} did not fetch the speech within ${String(AI_SPEECH_FETCH_SECONDS)} s of the push; the phone may be off, offline or restricting the app in the background.`;
  }

  fetch(clientId: string, id: string): AiSpeechNotice {
    const entry = this.waiting.get(id);
    if (entry?.clientId !== clientId) {
      throw new ApiError('not_found', 'This speech was already fetched, expired or is not yours.');
    }
    this.waiting.delete(id);
    entry.fetched();
    return entry.notice;
  }

  private expect(clientId: string, notice: AiSpeechNotice): Promise<boolean> {
    return new Promise((resolve) => {
      const stop = this.deps.clock.at(new Date(this.deps.clock.now().getTime() + FETCH_MS), () => {
        this.waiting.delete(notice.id);
        resolve(false);
      });
      this.waiting.set(notice.id, {
        clientId,
        notice,
        fetched: () => {
          stop();
          resolve(true);
        },
      });
    });
  }

  private pushable(client: ClientRow): boolean {
    return (
      client.platform === 'android' &&
      this.deps.pushConfigured() &&
      this.deps.pushTargets().has(client.id)
    );
  }

  private whyNotPushable(client: ClientRow): string {
    if (client.platform !== 'android') {
      return 'only Android phones can be woken for speech';
    }
    return this.deps.pushConfigured()
      ? 'it has not signed up for push messages'
      : 'push messages are not set up on this hub';
  }
}
