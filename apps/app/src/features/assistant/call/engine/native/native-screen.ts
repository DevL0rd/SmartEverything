import { Logger } from '@smarteverything/logging';
import {
  captureAssistantScreenStill,
  setAssistantScreenLive,
  startAssistantScreenShare,
  stopAssistantScreenShare,
  type NativeFrameSampling,
} from '../../../../../../modules/health-connect';
import { rawErrorText } from '../../../../../format/errors';
import { changeVideo } from '../../call-state';
import { SightStartError } from '../sight-failure';

const log = new Logger('app.assistant-call');

export class NativeScreen {
  private opened = false;

  constructor(private readonly sampling: () => NativeFrameSampling) {}

  get on(): boolean {
    return this.opened;
  }

  async open(live: boolean): Promise<boolean> {
    changeVideo(() => ({ screen: 'starting' }));
    try {
      this.opened = await startAssistantScreenShare({ ...this.sampling(), live });
    } catch (error) {
      changeVideo(() => ({ screen: 'off' }));
      throw new SightStartError('phone_screen', 'failed', rawErrorText(error));
    }
    changeVideo(() => ({ screen: this.opened ? 'on' : 'off' }));
    return this.opened;
  }

  discard(): void {
    this.opened = false;
  }

  close(): void {
    this.discard();
    changeVideo(() => ({ screen: 'off' }));
    stopAssistantScreenShare().catch((error: unknown) => {
      log.warn('call.screen_release_failed', { reason: rawErrorText(error) });
    });
  }

  stream(live: boolean): void {
    if (!this.opened) {
      return;
    }
    setAssistantScreenLive(live).catch((error: unknown) => {
      log.warn('call.screen_mode_failed', { reason: rawErrorText(error) });
    });
  }

  async still(): Promise<void> {
    const sent = await captureAssistantScreenStill();
    if (!sent) {
      throw new SightStartError(
        'phone_screen',
        'failed',
        'The screen picture did not arrive in time',
      );
    }
  }
}
