import { Logger } from '@smarteverything/logging';
import type { LiveEvents, LiveOptions } from './gemini';

const log = new Logger('hub.voice-gemini');

export class LiveTrace {
  private readonly startedAt = performance.now();
  private readonly fields: Record<string, unknown>;
  private audioChunks = 0;
  private audioSamples = 0;
  private tools = 0;
  private heardChars = 0;
  private saidChars = 0;
  private messages = 0;

  constructor(options: LiveOptions) {
    this.fields = {
      model: options.model,
      voice: options.voice,
      tools: options.tools.length,
      webSearch: options.webSearch,
      resumed: options.resume !== null,
      automatic: options.automatic,
      windowed: options.window !== null,
      systemChars: options.system.length,
      thinking: options.thinking ?? 'built_in',
    };
  }

  private tally(): Record<string, unknown> {
    return {
      audioChunks: this.audioChunks,
      audioSamples: this.audioSamples,
      tools: this.tools,
      heardChars: this.heardChars,
      saidChars: this.saidChars,
      messages: this.messages,
      sinceConnectMs: Math.round(performance.now() - this.startedAt),
    };
  }

  connecting(): void {
    log.info('live.connecting', this.fields);
  }

  connected(): void {
    log.info('live.connected', {
      ...this.fields,
      durationMs: Math.round(performance.now() - this.startedAt),
    });
  }

  connectFailed(cause: unknown): void {
    log.error('live.connect_failed', cause, {
      ...this.fields,
      durationMs: Math.round(performance.now() - this.startedAt),
    });
  }

  message(): void {
    this.messages += 1;
  }

  socketError(message: string): void {
    log.error('live.socket_error', undefined, { ...this.fields, message, ...this.tally() });
  }

  socketClosed(close: { reason: string; wasClean: boolean; code: number }): void {
    log.info('live.closed', {
      reason: close.reason === '' ? 'closed' : close.reason,
      wasClean: close.wasClean,
      closeCode: close.code,
      ...this.tally(),
    });
  }

  counting(events: LiveEvents): LiveEvents {
    return {
      ...events,
      audio: (pcm): void => {
        this.audioChunks += 1;
        this.audioSamples += pcm.length;
        events.audio(pcm);
      },
      heard: (text): void => {
        this.heardChars += text.length;
        events.heard(text);
      },
      said: (text): void => {
        this.saidChars += text.length;
        events.said(text);
      },
      tool: (id, name, args): void => {
        this.tools += 1;
        log.debug('live.tool_requested', () => ({
          tool: name,
          callId: id,
          argumentKeys: Object.keys(args).length,
        }));
        events.tool(id, name, args);
      },
      ...this.turns(events),
      usage: (usage): void => {
        log.trace('live.usage', {
          promptTokens: usage.promptTokenCount,
          responseTokens: usage.responseTokenCount,
          totalTokens: usage.totalTokenCount,
        });
        events.usage(usage);
      },
      resumable: (handle): void => {
        log.debug('live.resumable', { handleChars: handle === null ? 0 : handle.length });
        events.resumable(handle);
      },
      goAway: (timeLeft): void => {
        log.info('live.go_away', { timeLeft, ...this.tally() });
        events.goAway?.(timeLeft);
      },
    };
  }

  private turns(events: LiveEvents): Pick<LiveEvents, 'interrupted' | 'turnComplete'> {
    return {
      interrupted: (): void => {
        log.debug('live.interrupted', () => this.tally());
        events.interrupted();
      },
      turnComplete: (): void => {
        log.debug('live.turn_complete', () => this.tally());
        events.turnComplete();
      },
    };
  }
}
