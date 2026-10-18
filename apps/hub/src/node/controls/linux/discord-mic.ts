import { Logger } from '@smarteverything/logging';
import type { RunProgram } from '../../run-program';
import type { StopWatching } from '../session-controls';
import type { LineSubscriber } from './line-stream';
import type { ProgramProbe } from './program-probe';
import { parseStreams, type PulseStream } from './pulse-parse';

const log = new Logger('hub.node-audio');

const PROGRAM = 'pactl';
const DEBOUNCE_MS = 50;
const SOURCE_OUTPUT_EVENT = /^Event '\w+' on source-output #/;
const DISCORD_CLIENT = /discord|vesktop|vencord|webcord|armcord|legcord/i;
const IDENTITY_KEYS = [
  'application.name',
  'application.process.binary',
  'application.id',
  'node.name',
] as const;

export interface DiscordMicOptions {
  readonly run: RunProgram;
  readonly probe: ProgramProbe;
  readonly lines: LineSubscriber;
  readonly failed: (cause: unknown) => void;
}

function identityOf(stream: PulseStream): string {
  return IDENTITY_KEYS.map((key) => {
    const value = stream.properties[key];
    return typeof value === 'string' ? value : '';
  }).join(' ');
}

export function discordHoldsMic(streams: readonly PulseStream[]): boolean {
  return streams.some((stream) => DISCORD_CLIENT.test(identityOf(stream)));
}

export class DiscordMic {
  constructor(private readonly options: DiscordMicOptions) {}

  watch(onChange: (held: boolean) => void): StopWatching {
    let held: boolean | null = null;
    let timer: NodeJS.Timeout | null = null;
    let stopped = false;
    const reload = (): void => {
      this.read().then(
        (now) => {
          if (!stopped && now !== held) {
            held = now;
            log.info('discord_mic.changed', { held: now });
            onChange(now);
          }
        },
        (cause: unknown) => {
          this.options.failed(cause);
        },
      );
    };
    const stopLines = this.options.lines({
      program: PROGRAM,
      args: ['subscribe'],
      onLine: (line): void => {
        if (SOURCE_OUTPUT_EVENT.test(line)) {
          timer ??= setTimeout(() => {
            timer = null;
            reload();
          }, DEBOUNCE_MS);
        }
      },
      onFailure: this.options.failed,
    });
    reload();
    return (): void => {
      stopped = true;
      stopLines();
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }

  private async read(): Promise<boolean> {
    if (!(await this.options.probe(PROGRAM))) {
      return false;
    }
    const text = await this.options.run(PROGRAM, ['-f', 'json', 'list', 'source-outputs']);
    return discordHoldsMic(parseStreams(text, 'source outputs'));
  }
}
