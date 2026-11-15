import type { AudioChange, AudioState, ComputerFeature } from '@smarteverything/domain';
import type { AudioControl, StopWatching } from '../session-controls';

export class LinuxAudio implements AudioControl {
  constructor(
    private readonly server: AudioControl,
    private readonly hardware: AudioControl,
    private readonly failed: (cause: unknown) => void,
  ) {}

  async features(): Promise<readonly ComputerFeature[]> {
    const served = await this.server.features();
    return served.length > 0 ? served : this.hardware.features();
  }

  async read(): Promise<AudioState> {
    return (await this.chosen()).read();
  }

  async change(change: AudioChange): Promise<AudioState> {
    return (await this.chosen()).change(change);
  }

  watch(onChange: (state: AudioState) => void): StopWatching {
    let stop: StopWatching | null = null;
    let stopped = false;
    this.chosen()
      .then((control) => {
        if (stopped) {
          return;
        }
        stop = control.watch(onChange);
      })
      .catch(this.failed);
    return (): void => {
      stopped = true;
      stop?.();
    };
  }

  private async chosen(): Promise<AudioControl> {
    return (await this.server.features()).length > 0 ? this.server : this.hardware;
  }
}
