import { mkdir } from 'node:fs/promises';
import type {
  DesktopPlatform,
  DesktopServiceStatus,
  NativeHubCapabilities,
} from '@smarteverything/domain';
import { background, Logger, setBackgroundScope } from '@smarteverything/logging';
import { app, session, type BrowserWindow } from 'electron';
import { startDesktopAgent } from './agent/desktop-agent.js';
import { registerDeepLinkScheme } from './deep-link-scheme.js';
import { currentCaptureMode, DisplayCapture, prepareScreenCapture } from './display-capture.js';
import { deepLinkInArguments } from './deep-link.js';
import { DeepLinkInbox } from './deep-link-inbox.js';
import { applyFirewall } from './firewall/apply.js';
import { refuseDeepLink, reportFailure, reportInterfaceFailure } from './failure.js';
import { registerDesktopIpc } from './ipc.js';
import { registerDesktopHub } from './hub-network/desktop-hub.js';
import { followLogs } from './logs/follow-logs.js';
import type { DesktopLogShipping } from './logs/shipment.js';
import { logMetroLoadFailure, showMetroUnreachable } from './metro-page.js';
import { HIDDEN_START_ARGUMENT } from './origin.js';
import { DESKTOP_PACKAGE_PROBE, desktopPackageProbe } from './package-probe.js';
import { desktopPaths, prepareUserData } from './paths.js';
import { registerAppScheme, serveWebExport } from './protocol.js';
import { restrictPermissions } from './session-guards.js';
import { squirrelEventOf, WINDOWS_APP_USER_MODEL_ID } from './squirrel.js';
import { handleSquirrelEvent } from './squirrel-events.js';
import { getStartOnLogin, setStartOnLogin, wasOpenedAtLogin } from './start-on-login.js';
import {
  createDesktopService,
  currentPlatform,
  type DesktopService,
} from './service/desktop-service.js';
import { requireEnrolledPairingHub } from './service/computer-pairing-target.js';
import { startComputer } from './service/startup.js';
import { nodeSystem, runAwaitingApproval } from './service/system.js';
import {
  computerPairingArguments,
  handleComputerPairingCommand,
  pairComputer,
} from './service/pair-computer.js';
import { startPlannerRings } from './planner/register.js';
import { OverlayDesktop } from './overlay/overlay-desktop.js';
import { registerOverlayIpc } from './overlay/overlay-ipc.js';
import { TalkDesktop } from './talk/talk-desktop.js';
import type { UpdateController } from './updates/update-controller.js';
import { desktopUpdateFetch } from './updates/update-fetch.js';
import {
  confirmBootWhenLoaded,
  createDesktopUpdates,
  followHubNotices,
  followUpdates,
  recoverDesktopBoot,
} from './updates/update-shell.js';
import { runShutdown, type ShutdownStep } from './shutdown.js';
import { DesktopDriveLink } from './drive-mount/desktop-drive-link.js';
import { createTray, type DesktopTray } from './tray.js';
import { logControlFailure, trayServiceOf } from './tray-service.js';
import { readDesktopVariant, type DesktopVariant } from './variant.js';
import { createMainWindow, revealWindow } from './window.js';
import { WebUpdateShell, webUpdateWindowOf } from './web-bundles/web-update-shell.js';
import type { RunningAgent } from './agent/agent-host.js';

const log = new Logger('desktop.main');
setBackgroundScope('desktop.background');

process.on('unhandledRejection', (cause: unknown) => {
  log.exception('promise.unhandled', cause);
});

interface Updates {
  readonly updates: UpdateController;
  readonly web: WebUpdateShell;
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
  #closeNotices: (() => void) | undefined;
  #closeOverlayIpc: (() => void) | undefined;
  #agent: RunningAgent | undefined;
  #logs: DesktopLogShipping | undefined;
  readonly #drive = new DesktopDriveLink(desktopPaths().dataDirectory);

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
        background(
          runShutdown([
            { name: 'overlay', run: (): Promise<void> => this.#overlay.stop() },
            { name: 'logs', run: (): Promise<void> | undefined => this.#logs?.close() },
          ]).then(() => {
            app.quit();
          }),
          'app.quit_failed',
        );
        return;
      }
      log.info('app.quitting', { hadWindow: this.#window !== undefined });
      background(runShutdown(this.#finalSteps()), 'app.shutdown_failed');
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

  #finalSteps(): readonly ShutdownStep[] {
    return [
      {
        name: 'tray',
        run: (): void => {
          this.#tray?.destroy();
        },
      },
      {
        name: 'talk',
        run: (): void => {
          this.#talk.stop();
        },
      },
      {
        name: 'hub network',
        run: (): void => {
          this.#closeHubNetwork?.();
        },
      },
      {
        name: 'update notices',
        run: (): void => {
          this.#closeNotices?.();
        },
      },
      {
        name: 'computer service',
        run: (): void => {
          this.#drive.stop();
          this.#service?.controller.close();
        },
      },
      { name: 'agent', run: () => this.#agent?.stop() },
    ];
  }

  async launch(): Promise<void> {
    if (await recoverDesktopBoot()) return;
    const platform = currentPlatform();
    const variant = this.#variant;
    const paths = desktopPaths();
    await mkdir(paths.dataDirectory, { recursive: true, mode: 0o700 });
    this.#logLaunch(platform);
    const service = createDesktopService(platform, paths, variant, (cause) => {
      log.error('desktop.service.watch_failed', cause);
    });
    this.#service = service;
    this.#logs = followLogs(service.controller);
    const network = await registerDesktopHub(service.controller, variant.startUrl);
    this.#closeHubNetwork = network.close;
    const fetchUpdates = desktopUpdateFetch(() => service.controller.server(), network.updateLease);
    const web = await WebUpdateShell.create({
      managedBy: variant.managedBy,
      packaged: app.isPackaged,
      appPath: app.getAppPath(),
      userDataPath: app.getPath('userData'),
      embeddedRoot: paths.webRoot,
      server: () => service.controller.server(),
      fetch: fetchUpdates,
    });
    await web.launch();
    serveWebExport(web.root);
    this.#overlay.serve();
    restrictPermissions(session.defaultSession, variant.startUrl);
    this.#capture.attach(session.defaultSession);
    if (variant.managedBy === undefined) {
      registerDeepLinkScheme();
      if (platform === 'linux' && getStartOnLogin()) setStartOnLogin(true);
    }
    const updates = await createDesktopUpdates(service, fetchUpdates);
    this.#closeNotices = followHubNotices(
      updates,
      { server: () => service.controller.server(), lease: network.updateLease },
      network.onRouteReady,
    );
    startPlannerRings(service.controller, network);
    this.#registerIpc(platform, service, { updates, web });
    this.#closeOverlayIpc = registerOverlayIpc(this.#overlay.controller, variant.startUrl);
    if (variant.managedBy === undefined) {
      startComputer(service.controller).catch(logControlFailure);
    }
    await this.#startAgent();
    this.#open(paths, service, { updates, web }, network.capabilities);
  }

  #registerIpc(
    platform: DesktopPlatform,
    service: DesktopService,
    { updates, web }: Updates,
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
      pairComputer: async (pairing) => {
        const enrolled = requireEnrolledPairingHub(await service.controller.server(), pairing);
        await pairComputer(
          desktopPaths(),
          variant,
          computerPairingArguments(pairing),
          enrolled.token,
        );
      },
      talk: this.#talk,
      overlay: this.#overlay,
      capture: this.#capture,
      updates,
      webUpdates: web,
      drive: this.#drive.client,
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
    this.#agent = await startDesktopAgent(this.#capture);
  }

  #logLaunch(platform: DesktopPlatform): void {
    log.info('app.launching', {
      platform,
      managedBy: this.#variant.managedBy ?? 'self',
      packaged: app.isPackaged,
      version: app.getVersion(),
    });
  }

  #open(
    paths: ReturnType<typeof desktopPaths>,
    service: DesktopService,
    { updates, web }: Updates,
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
    confirmBootWhenLoaded(window);
    log.info('window.opened', {
      startHidden: process.argv.includes(HIDDEN_START_ARGUMENT) || wasOpenedAtLogin(),
    });
    if (this.#variant.managedBy === 'stable-app') {
      showMetroUnreachable(window, this.#variant.startUrl);
    }
    this.#tray = createTray({
      iconDirectory: paths.trayIcons,
      window,
      managedBy: this.#variant.managedBy,
      talk: (command) => {
        this.#talk.send(command);
      },
      overlayItems: () => this.#overlay.menuItems(),
      updateItems: () => web.trayItems(updates),
      service: trayServiceOf(service.controller),
      drive: this.#drive.tray.commands,
      quit: () => {
        log.info('tray.quit_requested');
        app.quit();
      },
    });
    this.#talk.attach(window, this.#tray);
    this.#overlay.attach(window, this.#tray);
    web.attach(webUpdateWindowOf(window), () => {
      this.#tray?.refresh();
    });
    this.#follow(window, service, updates);
    this.#receiveFromArguments(process.argv);
  }

  #follow(window: BrowserWindow, service: DesktopService, updates: UpdateController): void {
    this.#talk.takeFirst((command) => this.#overlay.takesShortcut(command));
    if (this.#tray !== undefined) this.#drive.follow(this.#tray);
    followUpdates(updates, window, () => {
      this.#tray?.refresh();
    });
    const show = (status: DesktopServiceStatus | null): void => {
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
  const variant = readDesktopVariant(app.getAppPath());
  prepareUserData(variant);
  if (app.isPackaged && process.argv.includes(DESKTOP_PACKAGE_PROBE)) {
    desktopPackageProbe(desktopPaths());
    return;
  }
  if (handleComputerPairingCommand(variant)) return;
  const captureMode = currentCaptureMode();
  prepareScreenCapture(captureMode);
  if (app.requestSingleInstanceLock()) {
    log.debug('app.variant_read', { managedBy: variant.managedBy ?? 'self' });
    start(variant, new DisplayCapture(captureMode, variant.startUrl));
  } else {
    log.info('app.single_instance_refused');
    app.quit();
  }
}

main();
