import path from 'node:path';
import type {
  AppUpdateChannel,
  DesktopServer,
  WebUpdateApplyTarget,
  WebUpdateStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
import { revealWindow } from '../window.js';
import { updateTrayItems } from '../updates/update-tray.js';
import type { UpdateController } from '../updates/update-controller.js';
import { WebBundleStore } from './bundle-store.js';
import { readWebStamp, WEB_UPDATES_UNPACKAGED_REASON } from './packaged-manifest.js';
import { WebUpdateController, type WebUpdateMode } from './web-update-controller.js';

const log = new Logger('desktop.web-update');

const BUNDLES_DIRECTORY = 'web-bundles';
const DEVELOPMENT_REASON =
  'The development copy loads its interface from Metro, so it has no web bundle to update.';
const STATUS_CHANNEL = 'desktop:web-update-status-changed';
const CONFIRM_CHANNEL = 'desktop:web-update-confirm-requested';

export interface WebUpdateWindow {
  readonly isDestroyed: () => boolean;
  readonly send: (channel: string, value?: unknown) => void;
  readonly reload: () => void;
  readonly reveal: () => void;
  readonly onRendererGone: (listener: (reason: string) => void) => void;
  readonly onMainFrameLoadFailed: (listener: (code: number, description: string) => void) => void;
}

export function webUpdateWindowOf(window: BrowserWindow): WebUpdateWindow {
  const { webContents } = window;
  return {
    isDestroyed: () => window.isDestroyed(),
    send: (channel, value): void => {
      webContents.send(channel, value);
    },
    reload: (): void => {
      webContents.reloadIgnoringCache();
    },
    reveal: (): void => {
      revealWindow(window);
    },
    onRendererGone: (listener): void => {
      webContents.on('render-process-gone', (_event, details) => {
        listener(details.reason);
      });
    },
    onMainFrameLoadFailed: (listener): void => {
      webContents.on('did-fail-load', (_event, code, description, ...frame) => {
        if (frame[1]) listener(code, description);
      });
    },
  };
}

export class WebUpdateWindowError extends Error {
  override readonly name = 'WebUpdateWindowError';

  constructor(action: string) {
    super(`The web update could not ${action}: the main window does not exist or was closed`);
  }
}

export interface WebUpdateShellOptions {
  readonly managedBy: 'stable-app' | undefined;
  readonly packaged: boolean;
  readonly appPath: string;
  readonly userDataPath: string;
  readonly embeddedRoot: string;
  readonly server: () => Promise<DesktopServer | null>;
  readonly fetch: typeof fetch;
}

async function modeOf(options: WebUpdateShellOptions): Promise<WebUpdateMode> {
  if (options.managedBy !== undefined) {
    return { kind: 'disabled', reason: DEVELOPMENT_REASON };
  }
  const stamp = await readWebStamp({ appPath: options.appPath, packaged: options.packaged });
  if (stamp === null) {
    return { kind: 'disabled', reason: WEB_UPDATES_UNPACKAGED_REASON };
  }
  return {
    kind: 'enabled',
    build: { ...stamp, embeddedRoot: options.embeddedRoot },
    store: new WebBundleStore(path.join(options.userDataPath, BUNDLES_DIRECTORY)),
  };
}

export class WebUpdateShell {
  readonly #controller: WebUpdateController;
  readonly #mode: WebUpdateMode;
  #root: string;
  #window: WebUpdateWindow | undefined;
  #reverting: Promise<void> | undefined;

  private constructor(mode: WebUpdateMode, controller: WebUpdateController, embeddedRoot: string) {
    this.#mode = mode;
    this.#controller = controller;
    this.#root = embeddedRoot;
  }

  static async create(options: WebUpdateShellOptions): Promise<WebUpdateShell> {
    const mode = await modeOf(options);
    const controller = await WebUpdateController.create({
      mode,
      server: options.server,
      fetch: options.fetch,
    });
    if (mode.kind === 'disabled') {
      log.info('web_update.disabled', { reason: mode.reason });
    }
    return new WebUpdateShell(mode, controller, options.embeddedRoot);
  }

  readonly root = (): string => this.#root;

  readonly status = (): WebUpdateStatus => this.#controller.status();

  async launch(): Promise<void> {
    await this.#controller.launchCheck();
    await this.#refreshRoot();
  }

  attach(window: WebUpdateWindow, changed: () => void): void {
    this.#window = window;
    this.#controller.onChange((status) => {
      changed();
      if (!window.isDestroyed()) window.send(STATUS_CHANNEL, status);
    });
    window.onRendererGone((reason) => {
      this.#rollBackInBackground(`The window process ended: ${reason}.`);
    });
    window.onMainFrameLoadFailed((code, description) => {
      this.#rollBackInBackground(`The window failed to load (${String(code)}): ${description}.`);
    });
  }

  check(channel: AppUpdateChannel): Promise<WebUpdateStatus> {
    return this.#controller.check(channel);
  }

  download(expectedId: string): Promise<WebUpdateStatus> {
    return this.#controller.download(expectedId);
  }

  async apply(target: WebUpdateApplyTarget): Promise<WebUpdateStatus> {
    const status = await this.#controller.apply(target, async () => {
      await this.#refreshRoot();
      this.#reload('apply');
    });
    if (status.state === 'failed') {
      await this.#refreshRoot();
    }
    return status;
  }

  async confirm(): Promise<void> {
    await this.#controller.confirm();
  }

  reportFailure(reason: string): Promise<void> {
    return this.#rollBack(reason);
  }

  askToRestart(): void {
    const window = this.#window;
    if (window === undefined || window.isDestroyed()) {
      throw new WebUpdateWindowError('ask to restart');
    }
    window.reveal();
    window.send(CONFIRM_CHANNEL);
  }

  trayItems(updates: UpdateController): MenuItemConstructorOptions[] {
    return updateTrayItems(updates, {
      status: this.status,
      askToRestart: () => {
        this.askToRestart();
      },
    });
  }

  #rollBackInBackground(reason: string): void {
    this.#rollBack(reason).catch((cause: unknown) => {
      log.error('web_update.rollback_failed', cause);
    });
  }

  #rollBack(reason: string): Promise<void> {
    this.#reverting ??= this.#revert(reason).finally(() => {
      this.#reverting = undefined;
    });
    return this.#reverting;
  }

  async #revert(reason: string): Promise<void> {
    if (this.#mode.kind === 'disabled' || (await this.#mode.store.trialId()) === null) return;
    const status = await this.#controller.bootFailed(reason);
    if (status.state !== 'rolled_back') return;
    log.warn('web_update.boot_failed', { reason });
    await this.#refreshRoot();
    this.#reload('rollback');
  }

  async #refreshRoot(): Promise<void> {
    if (this.#mode.kind === 'enabled') {
      this.#root = await this.#mode.store.rootFor(this.#mode.build);
    }
  }

  #reload(cause: 'apply' | 'rollback'): void {
    const window = this.#window;
    if (window === undefined || window.isDestroyed()) {
      throw new WebUpdateWindowError(`reload after ${cause}`);
    }
    log.info('web_update.reloading', { cause });
    window.reload();
  }
}
