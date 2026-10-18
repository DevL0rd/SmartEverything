import {
  displayChangeNeedsRevert,
  DISPLAY_REVERT_SECONDS,
  type ComputerFeature,
  type DisplayChange,
  type DisplayOutput,
  type DisplayState,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { env } from 'node:process';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import type { DisplayControl, StopWatching } from '../session-controls';
import type { BackendChange, DisplayBackend } from './display-backend';
import { describeChange, isOnlyActive, planDisplayChange } from './display-plan';
import type { DisplayRevert, Schedule } from './display-revert';
import { KscreenDisplays } from './kscreen-displays';
import type { LineSubscriber } from './line-stream';
import type { KwinNightLight } from './night-light';
import type { ProgramProbe } from './program-probe';
import type { RevertNotice } from './revert-notice';
import { DdcBrightness } from './screen-brightness';
import { watchDrm } from './udev-monitor';
import { WlrDisplays } from './wlr-displays';
import { XrandrDisplays } from './xrandr-displays';

const log = new Logger('hub.node-displays');

const REFRESH_DEBOUNCE_MS = 300;
const UNSUPPORTED_TEXT = "Screen control isn't available on this computer yet.";
const SESSION = z.object({
  WAYLAND_DISPLAY: z.string().optional(),
  DISPLAY: z.string().optional(),
});

export interface DisplayEnvironment {
  readonly kde: boolean;
  readonly wayland: boolean;
  readonly x11: boolean;
}

export function displayEnvironment(kde: boolean): DisplayEnvironment {
  const session = SESSION.parse(env);
  const wayland = (session.WAYLAND_DISPLAY ?? '') !== '';
  return { kde, wayland, x11: !wayland && (session.DISPLAY ?? '') !== '' };
}

export interface LinuxDisplaysOptions {
  readonly run: RunProgram;
  readonly probe: ProgramProbe;
  readonly lines: LineSubscriber;
  readonly environment: () => DisplayEnvironment;
  readonly nightLight: KwinNightLight;
  readonly notice: RevertNotice;
  readonly revert: DisplayRevert;
  readonly schedule: Schedule;
  readonly failed: (cause: unknown) => void;
}

type NightLightChange = Extract<DisplayChange, { action: 'night_light' }>;

function nightLightChange(change: DisplayChange): change is NightLightChange {
  return change.action === 'night_light';
}

export class LinuxDisplays implements DisplayControl {
  private selected: Promise<DisplayBackend | null> | null = null;
  private readonly ddc: DdcBrightness;
  private readonly listeners = new Set<(state: DisplayState) => void>();
  private stopDrm: (() => void) | null = null;
  private stopNightLight: (() => void) | null = null;
  private cancelRefresh: (() => void) | null = null;
  private closeNotice: (() => Promise<void>) | null = null;
  private last = '';

  constructor(private readonly options: LinuxDisplaysOptions) {
    this.ddc = new DdcBrightness(options.run, options.probe);
  }

  async features(): Promise<readonly ComputerFeature[]> {
    const backend = await this.backend();
    if (backend === null) {
      return [];
    }
    const outputs = await this.outputs(backend);
    const night = await this.options.nightLight.read();
    const features: ComputerFeature[] = ['displays', 'display_modes', 'display_enable'];
    if (outputs.some((output) => output.brightness !== null)) {
      features.push('brightness');
    }
    if (outputs.some((output) => output.hdr.supported)) {
      features.push('hdr');
    }
    if (outputs.some((output) => output.vrr !== null)) {
      features.push('vrr');
    }
    if (night.supported) {
      features.push('night_light');
    }
    return features;
  }

  async read(): Promise<DisplayState> {
    const backend = await this.require();
    return {
      outputs: [...(await this.outputs(backend))],
      nightLight: await this.options.nightLight.read(),
      pendingRevert: this.options.revert.pending(),
    };
  }

  watch(onChange: (state: DisplayState) => void): StopWatching {
    this.listeners.add(onChange);
    this.began();
    return (): void => {
      this.listeners.delete(onChange);
      this.ended();
    };
  }

  async change(change: DisplayChange, revert: boolean): Promise<DisplayState> {
    const backend = await this.require();
    if (nightLightChange(change)) {
      await this.options.nightLight.set(change);
      return this.settled();
    }
    if (change.action === 'identify') {
      throw new NodeFailureError(
        'not_supported',
        'Showing display names is not available on this computer yet.',
      );
    }
    const outputs = await this.outputs(backend);
    const plan = planDisplayChange(change, outputs);
    const guarded = revert && displayChangeNeedsRevert(change);
    this.guard(change, outputs, guarded);
    const restore = guarded ? await backend.capture() : null;
    for (const step of plan) {
      await this.apply(backend, step, outputs);
    }
    log.info('display.change_applied', { action: change.action, guarded });
    if (restore !== null) {
      await this.arm(backend, describeChange(change, outputs), restore);
    }
    return this.settled();
  }

  async confirm(token: string, keep: boolean): Promise<DisplayState> {
    const backend = await this.require();
    const restore = this.options.revert.take(token);
    await this.dismissNotice();
    if (keep) {
      log.info('display.change_kept');
    } else {
      await backend.restore(restore);
      log.info('display.change_reverted', { reason: 'declined' });
    }
    return this.settled();
  }

  async stop(): Promise<void> {
    const restore = this.options.revert.abandon();
    await this.dismissNotice();
    this.stopWatchers();
    if (restore !== null) {
      const backend = await this.backend();
      await backend?.restore(restore);
      log.warn('display.change_reverted', { reason: 'agent_stopped' });
    }
  }

  private backend(): Promise<DisplayBackend | null> {
    this.selected ??= this.select();
    return this.selected;
  }

  private async select(): Promise<DisplayBackend | null> {
    const { kde, wayland, x11 } = this.options.environment();
    const { run, probe } = this.options;
    if (kde && (await probe('kscreen-doctor'))) {
      return new KscreenDisplays(run);
    }
    if (wayland && (await probe('wlr-randr'))) {
      return new WlrDisplays(run);
    }
    if (x11 && (await probe('xrandr'))) {
      return new XrandrDisplays(run);
    }
    return null;
  }

  private async require(): Promise<DisplayBackend> {
    const backend = await this.backend();
    if (backend === null) {
      throw new NodeFailureError('not_supported', UNSUPPORTED_TEXT);
    }
    return backend;
  }

  private async outputs(backend: DisplayBackend): Promise<readonly DisplayOutput[]> {
    const outputs = await backend.read();
    return Promise.all(
      outputs.map(async (output) => {
        if (output.builtIn || !(await this.ddc.covers(output.id))) {
          return output;
        }
        return { ...output, brightness: await this.ddc.read(output.id) };
      }),
    );
  }

  private guard(change: DisplayChange, outputs: readonly DisplayOutput[], guarded: boolean): void {
    if (displayChangeNeedsRevert(change) && this.options.revert.pending() !== null) {
      throw new NodeFailureError('blocked', 'Keep or revert the last display change first.');
    }
    if (change.action === 'disable' && !guarded && isOnlyActive(outputs, change.output)) {
      throw new NodeFailureError(
        'blocked',
        'That is the only screen on. Turning it off needs the keep-or-revert timer so it comes back.',
      );
    }
  }

  private async apply(
    backend: DisplayBackend,
    step: BackendChange,
    outputs: readonly DisplayOutput[],
  ): Promise<void> {
    const output = outputs.find((candidate) => candidate.id === step.output);
    if (
      step.kind === 'brightness' &&
      output !== undefined &&
      (await this.ddc.covers(output.id)) &&
      !output.builtIn
    ) {
      await this.ddc.set(output.id, step.level);
      return;
    }
    await backend.apply(step);
  }

  private async arm(
    backend: DisplayBackend,
    summary: string,
    restore: readonly string[],
  ): Promise<void> {
    const pending = this.options.revert.begin(summary, restore, (expired) => {
      this.expire(backend, expired);
    });
    try {
      this.closeNotice = await this.options.notice.show(
        summary,
        DISPLAY_REVERT_SECONDS,
        (answer) => {
          this.answered(pending.token, answer === 'keep');
        },
      );
    } catch (cause) {
      this.options.failed(cause);
    }
  }

  private answered(token: string, keep: boolean): void {
    this.confirm(token, keep).catch(this.options.failed);
  }

  private expire(backend: DisplayBackend, restore: readonly string[]): void {
    backend
      .restore(restore)
      .then(async () => {
        log.warn('display.change_reverted', { reason: 'timeout' });
        await this.dismissNotice();
        await this.refresh();
      })
      .catch(this.options.failed);
  }

  private async dismissNotice(): Promise<void> {
    const close = this.closeNotice;
    this.closeNotice = null;
    if (close === null) {
      return;
    }
    try {
      await close();
    } catch (cause) {
      this.options.failed(cause);
    }
  }

  private async settled(): Promise<DisplayState> {
    this.ddc.invalidate();
    const state = await this.read();
    this.emit(state);
    return state;
  }

  private emit(state: DisplayState): void {
    const serial = JSON.stringify(state);
    if (serial === this.last) {
      return;
    }
    this.last = serial;
    this.listeners.forEach((listener) => {
      listener(state);
    });
  }

  private async refresh(): Promise<void> {
    if (this.listeners.size === 0) {
      return;
    }
    this.ddc.invalidate();
    this.emit(await this.read());
  }

  private scheduleRefresh(): void {
    this.cancelRefresh?.();
    this.cancelRefresh = this.options.schedule(() => {
      this.cancelRefresh = null;
      this.refresh().catch(this.options.failed);
    }, REFRESH_DEBOUNCE_MS);
  }

  private began(): void {
    this.last = '';
    if (this.stopDrm === null) {
      this.stopDrm = watchDrm(
        this.options.lines,
        () => {
          this.scheduleRefresh();
        },
        this.options.failed,
      );
      this.options.nightLight
        .watch(() => {
          this.scheduleRefresh();
        })
        .then((stop) => {
          if (this.stopDrm === null) {
            stop();
            return;
          }
          this.stopNightLight = stop;
        }, this.options.failed);
      log.debug('display.watch_started');
    }
    this.scheduleRefresh();
  }

  private ended(): void {
    if (this.listeners.size === 0) {
      this.stopWatchers();
      log.debug('display.watch_stopped');
    }
  }

  private stopWatchers(): void {
    this.stopDrm?.();
    this.stopDrm = null;
    this.stopNightLight?.();
    this.stopNightLight = null;
    this.cancelRefresh?.();
    this.cancelRefresh = null;
  }
}
