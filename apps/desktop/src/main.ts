import type {
  DesktopPlatform,
  DesktopServiceStatus,
  NativeHubCapabilities,
} from '@smarteverything/domain';
import { serviceUrl, type ServiceConfig } from '@smarteverything/hub/service/configuration';
import { Logger, setBackgroundScope } from '@smarteverything/logging';
import { app, dialog, session, shell, type BrowserWindow } from 'electron';
import { sessionAgentDirectory } from '@smarteverything/hub/node/session-agent/location';
import { electronAgentActions } from './agent/agent-actions.js';
import { startSessionAgent, type RunningAgent } from './agent/agent-host.js';
import { RingWindow } from './agent/ring-window.js';
import { currentCaptureMode, DisplayCapture, prepareScreenCapture } from './display-capture.js';
import { buildContentSecurityPolicy } from './csp.js';
import { deepLinkInArguments } from './deep-link.js';
import { readAgentEnvironment } from './environment.js';
import { DeepLinkInbox, type DeepLinkRefusal } from './deep-link-inbox.js';
import { applyFirewall } from './firewall/apply.js';
import { reportFailure } from './failure.js';
import { registerDesktopIpc } from './ipc.js';
import { registerHubNetworkIpc } from './hub-network/ipc.js';
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
import { startService } from './service/startup.js';
import { nodeSystem, runAwaitingApproval } from './service/system.js';
import { OverlayDesktop } from './overlay/overlay-desktop.js';
import { registerOverlayIpc } from './overlay/overlay-ipc.js';
import { TalkDesktop } from './talk/talk-desktop.js';
import type { UpdateController } from './updates/update-controller.js';
import { createDesktopUpdates, followUpdates } from './updates/update-shell.js';
import { updateTrayItems } from './updates/update-tray.js';
import { createTray, type DesktopTray, type TrayOptions } from './tray.js';
import { readDesktopVariant, type DesktopVariant } from './variant.js';
import { createMainWindow, revealWindow } from './window.js';

const log = new Logger('desktop.main');
setBackgroundScope('desktop.background');

process.on('unhandledRejection', (cause: unknown) => {
  log.exception('promise.unhandled', cause);
});

function logControlFailure(cause: unknown): void {
  reportFailure('The server control did not finish', cause);
}

function refuseDeepLink(refusal: DeepLinkRefusal): void {
  log.warn('deep_link.refused', { reason: refusal.reason });
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
  const registered = app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  log.debug('deep_link.scheme_registered', { scheme: DEEP_LINK_SCHEME, registered });
  if (!registered) {
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
  readonly #overlay = new OverlayDesktop(import.meta.dirname);
  #quitting = false;
  #overlayStopped = false;
  #closeHubNetwork: (() => void) | undefined;
  #closeOverlayIpc: (() => void) | undefined;
  #agent: RunningAgent | undefined;

  constructor(variant: DesktopVariant, capture: DisplayCapture) {
    this.#variant = variant;
    this.#capture = capture;
  }

  listen(): void {
    app.on('before-quit', (event) => {
      this.#quitting = true;
      if (!this.#overlayStopped) {
        this.#overlayStopped = true;
        event.preventDefault();
        this.#closeOverlayIpc?.();
        this.#overlay
          .stop()
          .then(() => {
            app.quit();
          })
          .catch((cause: unknown) => {
            log.error('app.quit_failed', cause);
          });
        return;
      }
      log.info('app.quitting', { hadWindow: this.#window !== undefined });
      this.#tray?.destroy();
      this.#talk.stop();
      this.#closeHubNetwork?.();
      this.#service?.controller.close();
      this.#agent?.stop().catch((cause: unknown) => {
        log.error('agent.stop_failed', cause);
      });
    });
    app.on('open-url', (event, url) => {
      event.preventDefault();
      log.info('deep_link.received', { source: 'open-url', length: url.length });
      this.#inbox.receive(url);
    });
    app.on('second-instance', (_event, argv) => {
      log.info('app.second_instance', { argumentCount: argv.length });
      this.#receiveFromArguments(argv);
      this.#reveal();
    });
    app.on('activate', () => {
      log.debug('app.activated', { hasWindow: this.#window !== undefined });
      this.#reveal();
    });
  }

  async launch(): Promise<void> {
    const platform = currentPlatform();
    const variant = this.#variant;
    const paths = desktopPaths(variant);
    this.#logLaunch(platform);
    const service = createDesktopService(platform, paths, variant, (cause) => {
      log.error('desktop.service.watch_failed', cause);
    });
    this.#service = service;
    const config = await service.controller.config();
    serveWebExport(paths.webRoot);
    this.#overlay.serve();
    enforceContentSecurityPolicy(
      session.defaultSession,
      buildContentSecurityPolicy(config.role === 'node' ? config.node.hub_url : serviceUrl(config)),
    );
    restrictPermissions(session.defaultSession, variant.startUrl);
    this.#capture.attach(session.defaultSession);
    if (variant.managedBy === undefined) {
      registerDeepLinkScheme();
    }
    const updates = await createDesktopUpdates(service);
    this.#registerIpc(platform, service, updates);
    this.#closeOverlayIpc = registerOverlayIpc(this.#overlay.controller, variant.startUrl);
    if (variant.managedBy === undefined && (await this.#serviceDeclined(platform, service))) {
      log.info('app.launch_declined');
      app.quit();
      return;
    }
    await this.#startAgent();
    this.#open(paths, service, updates, await this.#registerHubNetwork(config));
  }

  #registerIpc(
    platform: DesktopPlatform,
    service: DesktopService,
    updates: UpdateController,
  ): void {
    const variant = this.#variant;
    registerDesktopIpc({
      startUrl: variant.startUrl,
      managedBy: variant.managedBy,
      takeDeepLinks: (sender) => this.#inbox.take(sender),
      onNotificationClick: () => {
        this.#reveal();
      },
      service: service.controller,
      talk: this.#talk,
      overlay: this.#overlay,
      capture: this.#capture,
      updates,
      applyFirewall: (revision) =>
        applyFirewall(
          {
            platform,
            server: () => service.controller.server(),
            fetch: nodeSystem.fetch,
            run: runAwaitingApproval,
          },
          revision,
        ),
    });
  }

  async #startAgent(): Promise<void> {
    if (this.#variant.managedBy !== undefined) return;
    const directory = sessionAgentDirectory(process.platform, {
      ...readAgentEnvironment(),
      home: app.getPath('home'),
    });
    if (directory === null) {
      log.warn('agent.no_location', { platform: process.platform });
      return;
    }
    try {
      this.#agent = await startSessionAgent({
        directory,
        platform: process.platform,
        actions: electronAgentActions({
          shell,
          ring: new RingWindow(),
          screen: this.#capture,
          now: () => new Date(),
        }),
      });
    } catch (cause) {
      log.error('agent.start_failed', cause);
    }
  }

  #logLaunch(platform: DesktopPlatform): void {
    log.info('app.launching', {
      platform,
      managedBy: this.#variant.managedBy ?? 'self',
      packaged: app.isPackaged,
      version: app.getVersion(),
    });
  }

  async #registerHubNetwork(config: ServiceConfig): Promise<NativeHubCapabilities> {
    const routeAuthority = config.role === 'node';
    const serverUrl = config.role === 'node' ? config.node.hub_url : serviceUrl(config);
    const registration = await registerHubNetworkIpc(
      this.#variant.startUrl,
      routeAuthority,
      (origin): void => {
        enforceContentSecurityPolicy(
          session.defaultSession,
          buildContentSecurityPolicy(serverUrl, origin),
        );
      },
    );
    this.#closeHubNetwork = registration.close;
    return registration.capabilities;
  }

  async #serviceDeclined(platform: DesktopPlatform, service: DesktopService): Promise<boolean> {
    const outcome = await startService(platform, service, {
      unattended: process.argv.includes(INSTALL_SERVICE_ARGUMENT),
    });
    return outcome === 'declined';
  }

  #open(
    paths: ReturnType<typeof desktopPaths>,
    service: DesktopService,
    updates: UpdateController,
    capabilities: NativeHubCapabilities,
  ): void {
    const window = createMainWindow({
      capabilities,
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
    log.info('window.opened', {
      startHidden: process.argv.includes(HIDDEN_START_ARGUMENT) || wasOpenedAtLogin(),
    });
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
      overlayItems: () => this.#overlay.menuItems(),
      updateItems: () => updateTrayItems(updates),
      service: this.#trayService(service),
      quit: () => {
        log.info('tray.quit_requested');
        app.quit();
      },
    });
    this.#talk.attach(window, this.#tray);
    this.#overlay.attach(window, this.#tray);
    this.#talk.takeFirst((command) => this.#overlay.takesShortcut(command));
    this.#follow(window, service, updates);
    this.#receiveFromArguments(process.argv);
  }

  #trayService(service: DesktopService): TrayOptions['service'] {
    const request = (action: 'start' | 'stop' | 'restart'): void => {
      log.info('tray.service_requested', { action });
      void service.controller[action]().catch(logControlFailure);
    };
    return {
      start: (): void => {
        request('start');
      },
      stop: (): void => {
        request('stop');
      },
      restart: (): void => {
        request('restart');
      },
    };
  }

  #follow(window: BrowserWindow, service: DesktopService, updates: UpdateController): void {
    const onService = followUpdates(updates, window, () => {
      this.#tray?.refresh();
    });
    const show = (status: DesktopServiceStatus | null): void => {
      onService(status);
      log.debug('service.status_forwarded', () => ({
        health: status?.health ?? null,
        windowAlive: !window.isDestroyed(),
      }));
      this.#tray?.show(status);
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
    log.debug('deep_link.scanned', { argumentCount: argv.length, found: link !== undefined });
    if (link !== undefined) {
      this.#inbox.receive(link);
    }
  }

  #reveal(): void {
    if (this.#window === undefined) {
      log.debug('window.reveal_skipped', { reason: 'no_window' });
      return;
    }
    revealWindow(this.#window);
  }
}

function start(variant: DesktopVariant, capture: DisplayCapture): void {
  const shell = new DesktopShell(variant, capture);
  shell.listen();
  app
    .whenReady()
    .then(() => {
      log.info('app.ready', { platform: process.platform, arch: process.arch });
      return shell.launch();
    })
    .catch((error: unknown) => {
      reportFailure('SmartEverything could not start', error);
      app.exit(1);
    });
}

function main(): void {
  const squirrelEvent = squirrelEventOf(process.platform, process.argv);
  log.info('app.starting', {
    platform: process.platform,
    electron: process.versions.electron,
    argumentCount: process.argv.length,
  });
  if (squirrelEvent !== undefined) {
    log.info('squirrel.event', { event: squirrelEvent });
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
    log.debug('app.variant_read', { managedBy: variant.managedBy ?? 'self' });
    start(variant, new DisplayCapture(captureMode, variant.startUrl));
  } else {
    log.info('app.single_instance_refused');
    app.quit();
  }
}

main();
