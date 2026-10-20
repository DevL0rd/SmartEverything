import type { CaptureTarget, ComputerCapture, ScreenPicture } from '@smarteverything/domain';
import type { SessionAgent } from '../../session-agent/session-agent';
import { modelSized } from '../model-picture';
import type { CaptureControl } from '../session-controls';

export class LinuxCapture implements CaptureControl {
  constructor(
    private readonly plasma: CaptureControl,
    private readonly agent: Pick<SessionAgent, 'capture'>,
    private readonly isPlasma: () => boolean,
  ) {}

  private screen: ScreenPicture | null = null;

  picture(): ScreenPicture | null {
    return this.screen;
  }

  async capture(target: CaptureTarget): Promise<ComputerCapture> {
    const capture = await modelSized(
      await (this.isPlasma() ? this.plasma.capture(target) : this.agent.capture(target)),
    );
    if (target === 'screen') this.screen = { width: capture.width, height: capture.height };
    return capture;
  }
}
