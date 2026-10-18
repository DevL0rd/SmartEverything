import type { CaptureTarget, ComputerCapture } from '@smarteverything/domain';
import type { SessionAgent } from '../../session-agent/session-agent';
import type { CaptureControl } from '../session-controls';

export class LinuxCapture implements CaptureControl {
  constructor(
    private readonly plasma: CaptureControl,
    private readonly agent: Pick<SessionAgent, 'capture'>,
    private readonly isPlasma: () => boolean,
  ) {}

  capture(target: CaptureTarget): Promise<ComputerCapture> {
    return this.isPlasma() ? this.plasma.capture(target) : this.agent.capture(target);
  }
}
