import type { ComputerFeature, WindowChange, WindowsState } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { NodeFailureError } from '../../node-failure';
import type { StopWatching, WindowControl } from '../session-controls';
import type { Schedule } from './display-revert';
import type { ProgramProbe } from './program-probe';
import type { WindowProvider } from './window-provider';

const log = new Logger('hub.node-windows');

const REFRESH_DEBOUNCE_MS = 200;
const UNSUPPORTED_TEXT = "Window control isn't available on this computer yet.";

export interface LinuxWindowsOptions {
  readonly kde: () => boolean;
  readonly probe: ProgramProbe;
  readonly kdeProvider: () => WindowProvider;
  readonly x11Provider: () => WindowProvider;
  readonly schedule: Schedule;
  readonly failed: (cause: unknown) => void;
}

export class LinuxWindows implements WindowControl {
  private readonly listeners = new Set<(state: WindowsState) => void>();
  private stopProvider: (() => void) | null = null;
  private cancelRefresh: (() => void) | null = null;
  private watching = false;
  private last = '';

  constructor(private readonly options: LinuxWindowsOptions) {}

  async features(): Promise<readonly ComputerFeature[]> {
    return (await this.provider()) === null ? [] : ['windows'];
  }

  async read(): Promise<WindowsState> {
    const provider = await this.require();
    return { windows: await provider.list() };
  }

  async change(change: WindowChange): Promise<WindowsState> {
    const provider = await this.require();
    if (!(await provider.act(change.windowId, change.action))) {
      throw new NodeFailureError('not_found', 'That window is already gone.');
    }
    log.info('window.change_applied', { action: change.action });
    return this.read();
  }

  watch(onChange: (state: WindowsState) => void): StopWatching {
    this.listeners.add(onChange);
    this.began();
    return (): void => {
      this.listeners.delete(onChange);
      if (this.listeners.size === 0) {
        this.stopProvider?.();
        this.stopProvider = null;
        this.cancelRefresh?.();
        this.cancelRefresh = null;
        this.watching = false;
        this.last = '';
        log.debug('window.watch_stopped');
      }
    };
  }

  private async provider(): Promise<WindowProvider | null> {
    if (this.options.kde()) {
      return this.options.kdeProvider();
    }
    return (await this.options.probe('wmctrl')) ? this.options.x11Provider() : null;
  }

  private async require(): Promise<WindowProvider> {
    const provider = await this.provider();
    if (provider === null) {
      throw new NodeFailureError('not_supported', UNSUPPORTED_TEXT);
    }
    return provider;
  }

  private began(): void {
    this.last = '';
    this.scheduleRefresh();
    if (this.watching) {
      return;
    }
    this.watching = true;
    this.require()
      .then((provider) =>
        provider.watch(() => {
          this.scheduleRefresh();
        }, this.options.failed),
      )
      .then((stop) => {
        if (this.watching) {
          this.stopProvider = stop;
          log.debug('window.watch_started');
        } else {
          stop();
        }
      })
      .catch((cause: unknown) => {
        this.watching = false;
        this.options.failed(cause);
      });
  }

  private scheduleRefresh(): void {
    this.cancelRefresh?.();
    this.cancelRefresh = this.options.schedule(() => {
      this.cancelRefresh = null;
      this.refresh().catch(this.options.failed);
    }, REFRESH_DEBOUNCE_MS);
  }

  private async refresh(): Promise<void> {
    if (this.listeners.size === 0) {
      return;
    }
    const state = await this.read();
    const serial = JSON.stringify(state);
    if (serial === this.last) {
      return;
    }
    this.last = serial;
    this.listeners.forEach((listener) => {
      listener(state);
    });
  }
}
