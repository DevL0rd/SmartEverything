import type { Logger } from '@smarteverything/logging';
import { systemClock } from '../../clock';
import { DiscordMic } from '../controls/linux/discord-mic';
import { spawnLines } from '../controls/linux/line-stream';
import { MicCapture } from '../controls/linux/mic-capture';
import { cachedProbe, programAvailable } from '../controls/linux/program-probe';
import { SpeakerPlayback } from '../controls/linux/speaker-playback';
import { runProgram } from '../run-program';
import type { EarPipelineFactory } from './ear-pipeline';
import { ComputerEar, type EarFactory } from './computer-ear';
import { describeFailure } from '@smarteverything/logging';

export interface ComputerEarForOptions {
  readonly now: () => Date;
  readonly log: Logger;
  readonly pipeline: EarPipelineFactory;
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
          options.log.warn('node.session_part_failed', {
            part: 'discord_mic',
            failure: describeFailure(cause),
          });
        },
      }),
      send,
      clock: { now: options.now, at: systemClock.at },
      log: options.log,
      pipeline: options.pipeline,
    });
}
