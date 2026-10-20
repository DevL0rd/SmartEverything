import type { Logger } from '@smarteverything/logging';
import { systemClock } from '../../clock';
import { DiscordMic } from '../controls/linux/discord-mic';
import { spawnLines } from '../controls/linux/line-stream';
import { MicCapture } from '../controls/linux/mic-capture';
import { cachedProbe, programAvailable } from '../controls/linux/program-probe';
import { SpeakerPlayback } from '../controls/linux/speaker-playback';
import { runProgram } from '../run-program';
import type { EarRuntimeLost } from './runtime-lost';
import { ComputerEar, type EarFactory } from './computer-ear';

export interface ComputerEarForOptions {
  readonly now: () => Date;
  readonly log: Logger;
  readonly lost: EarRuntimeLost;
}

export function computerEarFor(
  platform: NodeJS.Platform,
  options: ComputerEarForOptions,
): EarFactory | undefined {
  if (platform !== 'linux') {
    return undefined;
  }
  const probe = cachedProbe(programAvailable);
  return (send) =>
    new ComputerEar({
      capture: new MicCapture({ probe }),
      speaker: new SpeakerPlayback({ probe }),
      discord: new DiscordMic({
        run: runProgram,
        probe,
        lines: spawnLines,
        failed: (cause): void => {
          options.log.error('node.session_part_failed', cause, { part: 'discord_mic' });
        },
      }),
      send,
      clock: { now: options.now, at: systemClock.at },
      log: options.log,
      lost: options.lost,
    });
}
