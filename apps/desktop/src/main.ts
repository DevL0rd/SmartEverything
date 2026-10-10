import type { DesktopPlatform, DesktopServiceStatus } from '@smarteverything/domain';
import { serviceUrl } from '@smarteverything/hub/service/configuration';
import { Logger } from '@smarteverything/logging';
import { app, dialog, session, type BrowserWindow } from 'electron';
import { currentCaptureMode, DisplayCapture, prepareScreenCapture } from './display-capture.js';
import { buildContentSecurityPolicy } from './csp.js';
import { deepLinkInArguments } from './deep-link.js';
import { DeepLinkInbox, type DeepLinkRefusal } from './deep-link-inbox.js';
import { applyFirewall } from './firewall/apply.js';
import { reportFailure } from './failure.js';
import { registerDesktopIpc } from './ipc.js';
import { startLinuxSchemeRegistration } from './linux-scheme.js';
import { logMetroLoadFailure, showMetroUnreachable } from './metro-page.js';
import { DEEP_LINK_SCHEME, HIDDEN_START_ARGUMENT, INSTALL_SERVICE_ARGUMENT } from './origin.js';
import { desktopPaths } from './paths.js';
import { enforceContentSecurityPolicy, registerAppScheme, serveWebExport } from './protocol.js';
import { restrictPermissions } from './session-guards.js';
import { squirrelEventOf, WINDOWS_APP_USER_MODEL_ID } from './squirrel.js';
import { handleSquirrelEvent } from './squirrel-events.js';
import { wasOpenedAtLogin } from './start-on-login.js';
import {
  createDesktopService,
  currentPlatform,
  type DesktopService,
} from './service/desktop-service.js';
import { showFfmpegMissing } from './service/dialogs.js';
import { startService } from './service/startup.js';
import { nodeSystem, runAwaitingApproval } from './service/system.js';
import { TalkDesktop } from './talk/talk-desktop.js';
import { createTray, type DesktopTray } from './tray.js';
import { readDesktopVariant, type DesktopVariant } from './variant.js';
import { createMainWindow, revealWindow } from './window.js';

const log = new Logger('desktop.main');

function logControlFailure(cause: unknown): void {
  reportFailure('The server control did not finish', cause);
}

function refuseDeepLink(refusal: DeepLinkRefusal): void {
  dialog.showErrorBox('Link not opened', `${refusal.reason}; received ${refusal.received}`);
}

function reportInterfaceFailure(_window: BrowserWindow, error: unknown): void {
  reportFailure('SmartEverything could not load its interface', error);
}

function registerDeepLinkScheme(): void {
  if (!app.isPackaged) {
    return;
  }
  if (process.platform === 'linux') {
    startLinuxSchemeRegistration();
    return;
  }
  if (!app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)) {
    reportFailure('Sign-in links will not open SmartEverything', {
      expected: `${DEEP_LINK_SCHEME}:// registered to this app`,
      received: 'the operating system refused the registration',
    });
  }
}

class DesktopShell {
  readonly #variant: DesktopVariant;
  readonly #capture: DisplayCapture;
  readonly #inbox = new DeepLinkInbox(refuseDeepLink);
  #window: BrowserWindow | undefined;
  #tray: DesktopTray | undefined;
  #service: DesktopService | undefined;
  readonly #talk = new TalkDesktop();
  #quitting = false;

  constructor(variant: DesktopVariant, capture: DisplayCapture) {
    this.#variant = variant;
    this.#capture = capture;
  }

  listen(): void {
    app.on('before-quit', () => {
      this.#quitting = true;
      this.#tray?.destroy();
      this.#talk.stop();
      this.#service?.controller.close();
    });
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.#inbox.receive(url);
    });
    app.on('second-instance', (_event, argv) => {
      this.#receiveFromArguments(argv);
      this.#reveal();
    });
    app.on('activate', () => {
      this.#reveal();
    });
  }

  async launch(): Promise<void> {
    const platform = currentPlatform();
    const variant = this.#variant;
    const paths = desktopPaths(variant);
    const service = createDesktopService(platform, paths, variant, (cause) => {
      log.error('desktop.service.watch_failed', cause);
    });
    this.#service = service;
    const config = await service.controller.config();
    serveWebExport(paths.webRoot);
    enforceContentSecurityPolicy(
      session.defaultSession,
      buildContentSecurityPolicy(serviceUrl(config)),
    );
    restrictPermissions(session.defaultSession, variant.startUrl);
    this.#capture.attach(session.defaultSession);
    if (variant.managedBy === undefined) {
      registerDeepLinkScheme();
    }
    registerDesktopIpc({
      startUrl: variant.startUrl,
      managedBy: variant.managedBy,
      takeDeepLinks: (sender) => this.#inbox.take(sender),
      onNotificationClick: () => {
        this.#reveal();
      },
      service: service.controller,
      ffmpeg: service.ffmpeg,
      talk: this.#talk,
      capture: this.#capture,
      applyFirewall: (revision) =>
        applyFirewall(
          {
            platform,
            go2rtcBinary: paths.go2rtcBinary,
            appBinary: process.execPath,
            server: () => service.controller.server(),
            fetch: nodeSystem.fetch,
            run: runAwaitingApproval,
          },
          revision,
        ),
    });
    if (variant.managedBy === undefined && (await this.#serviceDeclined(platform, service))) {
      app.quit();
      return;
    }
    this.#open(paths, service);
  }

  async #serviceDeclined(platform: DesktopPlatform, service: DesktopService): Promise<boolean> {
    const outcome = await startService(platform, service, {
      unattended: process.argv.includes(INSTALL_SERVICE_ARGUMENT),
    });
    return outcome === 'declined';
  }

  #open(paths: ReturnType<typeof desktopPaths>, service: DesktopService): void {
    const window = createMainWindow({
      preload: paths.preload,
      icon: paths.icon,
      stateFile: paths.windowState,
      startUrl: this.#variant.startUrl,
      loadFailed:
        this.#variant.managedBy === undefined ? reportInterfaceFailure : logMetroLoadFailure,
      version: app.getVersion(),
      startHidden: process.argv.includes(HIDDEN_START_ARGUMENT) || wasOpenedAtLogin(),
      isQuitting: () => this.#quitting,
    });
    this.#window = window;
    if (this.#variant.managedBy === 'stable-app') {
      showMetroUnreachable(window, this.#variant.startUrl);
    }
    this.#tray = createTray({
      icon: paths.icon,
      window,
      managedBy: this.#variant.managedBy,
      talk: (command) => {
        this.#talk.send(command);
      },
      service: {
        start: () => void service.controller.start().catch(logControlFailure),
        stop: () => void service.controller.stop().catch(logControlFailure),
        restart: () => void service.controller.restart().catch(logControlFailure),
        showFfmpeg: () => {
          showFfmpegMissing(service.ffmpeg());
        },
      },
      quit: () => {
        app.quit();
      },
    });
    this.#talk.attach(window, this.#tray);
    this.#follow(window, service);
    this.#receiveFromArguments(process.argv);
  }

  #follow(window: BrowserWindow, service: DesktopService): void {
    const show = (status: DesktopServiceStatus | null): void => {
      this.#tray?.show(status, service.ffmpeg());
      if (status !== null && !window.isDestroyed()) {
        window.webContents.send('desktop:service-status-changed', status);
      }
    };
    show(null);
    service.controller.onChange(show);
    service.controller.watch();
    service.controller.refresh();
  }

  #receiveFromArguments(argv: readonly string[]): void {
    const link = deepLinkInArguments(argv);
    if (link !== undefined) {
      this.#inbox.receive(link);
    }
  }

  #reveal(): void {
    if (this.#window !== undefined) {
      revealWindow(this.#window);
    }
  }
}

function start(variant: DesktopVariant, capture: DisplayCapture): void {
  const shell = new DesktopShell(variant, capture);
  shell.listen();
  app
    .whenReady()
    .then(() => shell.launch())
    .catch((error: unknown) => {
      reportFailure('SmartEverything could not start', error);
      app.exit(1);
    });
}

function main(): void {
  const squirrelEvent = squirrelEventOf(process.platform, process.argv);
  if (squirrelEvent !== undefined) {
    handleSquirrelEvent(squirrelEvent);
    return;
  }
  if (process.platform === 'win32') {
    app.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }
  registerAppScheme();
  const captureMode = currentCaptureMode();
  prepareScreenCapture(captureMode);
  if (app.requestSingleInstanceLock()) {
    const variant = readDesktopVariant(app.getAppPath());
    start(variant, new DisplayCapture(captureMode, variant.startUrl));
  } else {
    app.quit();
  }
}

main();
