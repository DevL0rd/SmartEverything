import {
  ApiError,
  DEFAULT_LISTENING_POWER_MODE,
  type ListeningClaimAnswer,
  type ListeningConfig,
  type ListeningHubMessage,
  type ListeningRuntimeState,
  type ListeningWakeClaim,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import type {
  ListeningNativeConfig,
  ListeningNativeState,
  ListeningNativeWake,
} from '../../../../modules/health-connect';
import { ValueStore } from '../../../design/external-store';
import { rawErrorText } from '../../../format/errors';

const log = new Logger('app.phone-ear');

const IN_CALL = 'in a call';

export interface PhoneEarView {
  readonly config: ListeningConfig | null;
  readonly native: ListeningNativeState;
  readonly microphone: 'unknown' | 'granted' | 'denied';
}

const INITIAL_VIEW: PhoneEarView = {
  config: null,
  native: { status: 'off', detail: null, transcribe: false },
  microphone: 'unknown',
};

function wantsEar(config: ListeningConfig | null): config is ListeningConfig {
  return config !== null && (config.wake || config.transcribe);
}

const CALL_HEARS_PHASES: ReadonlySet<string> = new Set(['listening', 'thinking', 'speaking']);

interface EarNative {
  readonly configure: (config: ListeningNativeConfig) => Promise<void>;
  readonly rest: (reason: string) => Promise<void>;
  readonly resume: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly releaseWake: () => Promise<void>;
  readonly watchLevel: (on: boolean) => Promise<void>;
}

interface EarHub {
  readonly config: () => Promise<ListeningConfig>;
  readonly claim: (claim: ListeningWakeClaim) => Promise<ListeningClaimAnswer>;
  readonly reportState: (state: ListeningRuntimeState | null) => Promise<void>;
}

interface EarCalls {
  readonly phase: () => string;
  readonly active: () => boolean;
  readonly start: () => void;
  readonly end: () => void;
}

interface EarEnvironment {
  readonly onLocalNetwork: () => boolean;
  readonly microphoneGranted: () => Promise<boolean>;
}

export interface EarPorts {
  readonly native: EarNative;
  readonly hub: EarHub;
  readonly calls: EarCalls;
  readonly environment: EarEnvironment;
}

function nativeConfigOf(config: ListeningConfig): ListeningNativeConfig {
  return {
    wake: config.wake,
    transcribe: config.transcribe,
    keywords: config.keywords.join('\n'),
    threshold: config.threshold,
    pause_ms: config.pause_ms,
    power_mode: config.power_mode ?? DEFAULT_LISTENING_POWER_MODE,
  };
}

export class PhoneEar {
  readonly view = new ValueStore<PhoneEarView>(INITIAL_VIEW);
  private work: Promise<void> = Promise.resolve();
  private reported: ListeningRuntimeState | null = null;
  private waking = false;
  private resting = false;
  private lastActive = false;
  private lastPhase = '';

  constructor(private readonly ports: EarPorts) {}

  readonly refresh = (): Promise<void> => this.run(() => this.fetchAndApply());

  readonly ensure = (): Promise<void> => this.run(() => this.restart());

  readonly receive = (message: ListeningHubMessage): void => {
    switch (message.kind) {
      case 'config':
        background(
          this.run(() => this.apply(message.config, false)),
          'phone_ear.config_apply_failed',
        );
        return;
      case 'superseded':
        this.superseded();
        return;
      case 'level':
        background(this.ports.native.watchLevel(message.watched), 'phone_ear.level_watch_failed');
        return;
      case 'rest':
      case 'call':
      case 'speak':
        log.debug('phone_ear.notice_ignored', { kind: message.kind });
    }
  };

  readonly heard = (wake: ListeningNativeWake): Promise<void> => this.run(() => this.answer(wake));

  readonly nativeChanged = (native: ListeningNativeState): void => {
    this.patch({ native });
  };

  readonly callChanged = (): void => {
    const { calls, native } = this.ports;
    const phase = calls.phase();
    if (phase === this.lastPhase) {
      return;
    }
    this.lastPhase = phase;
    const active = calls.active();
    if (CALL_HEARS_PHASES.has(phase) && !this.resting) {
      this.resting = true;
      background(native.rest(IN_CALL), 'phone_ear.rest_failed');
    }
    if (!active && this.lastActive) {
      this.resting = false;
      this.waking = false;
      background(native.resume(), 'phone_ear.resume_failed');
    }
    this.lastActive = active;
    background(this.report(false), 'phone_ear.report_failed');
  };

  readonly networkChanged = (): void => {
    background(
      this.run(() => this.reapplyAway()),
      'phone_ear.network_apply_failed',
    );
  };

  readonly stop = (): Promise<void> =>
    this.run(async () => {
      await this.ports.native.stop();
      this.patch({ config: null });
    });

  private readonly failed = (error: unknown): void => {
    log.warn('phone_ear.step_failed', { reason: rawErrorText(error) });
  };

  private run(task: () => Promise<void>): Promise<void> {
    this.work = this.work.then(task).catch(this.failed);
    return this.work;
  }

  private patch(change: Partial<PhoneEarView>): void {
    this.view.update((view) => ({ ...view, ...change }));
  }

  private async fetchAndApply(): Promise<void> {
    try {
      const config = await this.ports.hub.config();
      await this.apply(config, true);
    } catch (error) {
      await this.ports.native.stop();
      if (error instanceof ApiError && error.code === 'not_found') {
        log.info('phone_ear.phone_not_shared');
      } else {
        log.warn('phone_ear.config_failed', { reason: rawErrorText(error) });
      }
    }
  }

  private async reapplyAway(): Promise<void> {
    const { config } = this.view.get();
    if (config?.power_mode === 'away_from_home') {
      await this.apply(config, false);
    }
  }

  private async restart(): Promise<void> {
    const { config, native } = this.view.get();
    if (config === null) {
      await this.fetchAndApply();
    } else if (wantsEar(config) && native.status === 'off') {
      await this.apply(config, false);
    }
  }

  private async apply(config: ListeningConfig, fetched: boolean): Promise<void> {
    this.patch({ config });
    if (!wantsEar(config)) {
      await this.ports.native.stop();
    } else {
      await this.listen(config);
    }
    await this.report(fetched);
  }

  private async listen(config: ListeningConfig): Promise<void> {
    if (config.power_mode === 'away_from_home' && this.ports.environment.onLocalNetwork()) {
      log.info('phone_ear.resting_at_home');
      await this.ports.native.stop();
      return;
    }
    if (!(await this.ports.environment.microphoneGranted())) {
      this.patch({ microphone: 'denied' });
      await this.ports.native.stop();
      return;
    }
    this.patch({ microphone: 'granted' });
    try {
      await this.ports.native.configure(nativeConfigOf(config));
    } catch (error) {
      log.warn('phone_ear.start_refused', { reason: rawErrorText(error) });
    }
  }

  private runtimeState(): ListeningRuntimeState | null {
    const { config, microphone } = this.view.get();
    if (this.ports.calls.active()) {
      return 'in_conversation';
    }
    return wantsEar(config) && microphone === 'denied' ? 'needs_permission' : null;
  }

  private async report(force: boolean): Promise<void> {
    if (this.view.get().config === null) {
      return;
    }
    const state = this.runtimeState();
    if (!force && state === this.reported) {
      return;
    }
    this.reported = state;
    await this.ports.hub.reportState(state);
  }

  private async answer(wake: ListeningNativeWake): Promise<void> {
    const { calls, environment, native } = this.ports;
    if (calls.active()) {
      await native.releaseWake();
      return;
    }
    if (environment.onLocalNetwork() && !(await this.granted(wake))) {
      await native.releaseWake();
      return;
    }
    this.waking = true;
    log.info('phone_ear.wake_answered', {
      phrase: wake.phrase,
      claimed: environment.onLocalNetwork(),
    });
    calls.start();
  }

  private async granted(wake: ListeningNativeWake): Promise<boolean> {
    try {
      const answer = await this.ports.hub.claim({
        phrase: wake.phrase,
        snippetDbfs: wake.snippetDbfs,
        preroll: wake.preroll,
      });
      log.info('phone_ear.claim_answered', { granted: answer.granted });
      return answer.granted;
    } catch (error) {
      log.warn('phone_ear.claim_failed', { reason: rawErrorText(error) });
      return false;
    }
  }

  private superseded(): void {
    if (this.waking && this.ports.calls.active()) {
      log.info('phone_ear.superseded');
      this.ports.calls.end();
    }
  }
}
