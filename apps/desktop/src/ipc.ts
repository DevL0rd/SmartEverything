import { desktopComputerIdentity } from './service/computer-identity.js';
import { ipcMain, Notification, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';
import {
  CLIENT_TOKEN,
  OVERLAY_HOST_VIEW,
  type FirewallApplyResult,
  type DesktopInvokeChannel,
  type DesktopInvokeChannels,
} from '@smarteverything/domain';
import type { DisplayCapture } from './display-capture.js';
import { isAppOrigin } from './origin.js';
import { ManagedByStableAppError, type ServiceController } from './service/controller.js';
import type { OverlayDesktop } from './overlay/overlay-desktop.js';
import type { TalkDesktop } from './talk/talk-desktop.js';
import { getStartOnLogin, setStartOnLogin } from './start-on-login.js';
import type { UpdateController } from './updates/update-controller.js';

const log = new Logger('desktop.ipc');

const notificationSchema = z.strictObject({
  title: z.string().min(1).max(120),
  body: z.string().max(1000),
});

class UntrustedSenderError extends Error {
  readonly received: string;

  constructor(channel: string, received: string) {
    super(`${channel} answers only the app origin; received a call from ${received}`);
    this.name = 'UntrustedSenderError';
    this.received = received;
  }
}

class NotificationsUnsupportedError extends Error {
  constructor() {
    super('desktop notifications need a notification server; this session offers none');
    this.name = 'NotificationsUnsupportedError';
  }
}

export interface IpcServices {
  readonly takeDeepLinks: (sender: WebContents) => readonly string[];
  readonly onNotificationClick: () => void;
  readonly service: ServiceController;
  readonly applyFirewall: (revision: string) => Promise<FirewallApplyResult>;
  readonly talk: TalkDesktop;
  readonly overlay: OverlayDesktop;
  readonly capture: DisplayCapture;
  readonly updates: UpdateController;
  readonly startUrl: string;
  readonly managedBy: 'stable-app' | undefined;
}

const captureSourceIdSchema = z
  .string()
  .regex(/^(?:screen|window):\d+:\d+$/)
  .nullable();

const windowSchema = z
  .strictObject({ url: z.url({ protocol: /^https?$/ }), token: CLIENT_TOKEN })
  .nullable();
const firewallRevisionSchema = z.string().regex(/^[0-9a-f]{16,64}$/);

type Handler<C extends DesktopInvokeChannel> = (
  argument: unknown,
  sender: WebContents,
) => DesktopInvokeChannels[C]['response'] | Promise<DesktopInvokeChannels[C]['response']>;

type Handle = <C extends DesktopInvokeChannel>(channel: C, handler: Handler<C>) => void;

function settled(channel: string, startedAt: number, cause?: unknown): void {
  const durationMs = Date.now() - startedAt;
  if (cause === undefined) {
    const quiet = channel === 'desktop:service-status' || channel === 'desktop:take-deep-links';
    if (quiet) log.trace('ipc.handled', { channel, durationMs });
    else log.debug('ipc.handled', { channel, durationMs });
    return;
  }
  log.error('ipc.failed', cause, { channel, durationMs });
}

function trustedHandle(startUrl: string): Handle {
  return (channel, handler) => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, argument: unknown) => {
      const senderUrl = event.senderFrame?.url ?? 'a destroyed frame';
      if (!isAppOrigin(senderUrl, startUrl)) {
        log.warn('ipc.untrusted_sender', { channel, senderOrigin: originOf(senderUrl) });
        throw new UntrustedSenderError(channel, senderUrl);
      }
      const startedAt = Date.now();
      try {
        const result = handler(argument, event.sender);
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              settled(channel, startedAt);
              return value;
            },
            (cause: unknown) => {
              settled(channel, startedAt, cause);
              throw cause;
            },
          );
        }
        settled(channel, startedAt);
        return result;
      } catch (cause) {
        settled(channel, startedAt, cause);
        throw cause;
      }
    });
    log.debug('ipc.registered', { channel });
  };
}

function originOf(url: string): string {
  return URL.canParse(url) ? new URL(url).origin : 'unparseable';
}

const shownNotifications = new Set<Notification>();

function showNotification(argument: unknown, onClick: () => void): void {
  const { title, body } = notificationSchema.parse(argument);
  if (!Notification.isSupported()) {
    log.warn('notification.unsupported');
    throw new NotificationsUnsupportedError();
  }
  const notification = new Notification({ title, body });
  shownNotifications.add(notification);
  notification.on('click', () => {
    log.info('notification.clicked', { titleLength: title.length });
    onClick();
  });
  notification.on('close', () => {
    shownNotifications.delete(notification);
    log.debug('notification.closed', { open: shownNotifications.size });
  });
  notification.show();
  log.info('notification.shown', {
    titleLength: title.length,
    bodyLength: body.length,
    open: shownNotifications.size,
  });
}

export function registerDesktopIpc(services: IpcServices): void {
  const handle = trustedHandle(services.startUrl);
  handle('desktop:notify', (argument) => {
    showNotification(argument, services.onNotificationClick);
    return undefined;
  });
  handle('desktop:take-deep-links', (_argument, sender) => services.takeDeepLinks(sender));
  handle('desktop:attention', () => {
    services.onNotificationClick();
    return undefined;
  });
  registerServiceIpc(services, handle);
  registerOwnerIpc(services, handle);
  registerTalkIpc(services.talk, handle);
  registerOverlayHandlers(services.overlay, handle);
  registerCaptureIpc(services.capture, handle);
  registerUpdateIpc(services.updates, handle);
}

function refuseForStableApp(): never {
  throw new ManagedByStableAppError();
}

function registerOwnerIpc(services: IpcServices, handle: Handle): void {
  if (services.managedBy === 'stable-app') {
    handle('desktop:get-start-on-login', refuseForStableApp);
    handle('desktop:set-start-on-login', refuseForStableApp);
    handle('desktop:firewall-apply', refuseForStableApp);
    return;
  }
  handle('desktop:get-start-on-login', () => getStartOnLogin());
  handle('desktop:set-start-on-login', (argument) => setStartOnLogin(z.boolean().parse(argument)));
  handle('desktop:firewall-apply', (argument) =>
    services.applyFirewall(firewallRevisionSchema.parse(argument)),
  );
}

const talkTraySchema = z.strictObject({
  status: z.string().max(200),
  activity: z.enum(['idle', 'talking', 'receiving']),
  channels: z
    .array(z.strictObject({ id: z.string().min(1), name: z.string().min(1).max(80) }))
    .max(50),
  talkChannel: z.string().min(1).nullable(),
});

function registerTalkIpc(talk: TalkDesktop, handle: Handle): void {
  handle('desktop:talk-shortcuts', () => talk.shortcuts());
  handle('desktop:talk-configure', () => talk.configure());
  handle('desktop:talk-tray', (argument) => {
    talk.tray(talkTraySchema.parse(argument));
    return undefined;
  });
}

function registerOverlayHandlers(overlay: OverlayDesktop, handle: Handle): void {
  handle('desktop:overlay-view', async (argument) => {
    await overlay.setView(OVERLAY_HOST_VIEW.parse(argument));
    return undefined;
  });
  handle('desktop:overlay-helper', () => overlay.helper());
}

function registerCaptureIpc(capture: DisplayCapture, handle: Handle): void {
  handle('desktop:capture-mode', () => capture.mode);
  handle('desktop:capture-sources', () => capture.listSources());
  handle('desktop:capture-choose', async (argument) => {
    await capture.choose(captureSourceIdSchema.parse(argument));
    return undefined;
  });
  handle('desktop:capture-still', (argument) =>
    capture.still(captureSourceIdSchema.parse(argument)),
  );
}

function registerUpdateIpc(updates: UpdateController, handle: Handle): void {
  handle('desktop:update-status', () => updates.status());
  handle('desktop:update-check', () => updates.check());
  handle('desktop:update-install', () => updates.install());
}

function registerServiceIpc(services: IpcServices, handle: Handle): void {
  const { service } = services;
  handle('desktop:computer-identity', () => desktopComputerIdentity(service));
  handle('desktop:server', () => service.server());
  handle('desktop:set-window', async (argument) => {
    await service.setWindow(windowSchema.parse(argument));
    return undefined;
  });
  handle('desktop:service-status', () => service.status());
  handle('desktop:service-start', () => service.start());
  handle('desktop:service-stop', () => service.stop());
  handle('desktop:service-restart', () => service.restart());
  handle('desktop:service-uninstall', () => service.uninstall());
  handle('desktop:service-enable-linger', () => service.enableLinger());
  handle('desktop:service-logs', () => service.logs());
}
