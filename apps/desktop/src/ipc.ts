import { ipcMain, Notification, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { z } from 'zod';
import type {
  DesktopFfmpeg,
  DesktopFirewallResult,
  DesktopInvokeChannel,
  DesktopInvokeChannels,
} from '@smarteverything/domain';
import type { DisplayCapture } from './display-capture.js';
import { isAppOrigin } from './origin.js';
import { ManagedByStableAppError, type ServiceController } from './service/controller.js';
import type { TalkDesktop } from './talk/talk-desktop.js';
import { getStartOnLogin, setStartOnLogin } from './start-on-login.js';

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
  readonly ffmpeg: () => DesktopFfmpeg;
  readonly applyFirewall: (revision: string) => Promise<DesktopFirewallResult>;
  readonly talk: TalkDesktop;
  readonly capture: DisplayCapture;
  readonly startUrl: string;
  readonly managedBy: 'stable-app' | undefined;
}

const captureSourceIdSchema = z
  .string()
  .regex(/^(?:screen|window):\d+:\d+$/)
  .nullable();

const firewallRevisionSchema = z.string().regex(/^[0-9a-f]{16,64}$/);

type Handler<C extends DesktopInvokeChannel> = (
  argument: unknown,
  sender: WebContents,
) => DesktopInvokeChannels[C]['response'] | Promise<DesktopInvokeChannels[C]['response']>;

type Handle = <C extends DesktopInvokeChannel>(channel: C, handler: Handler<C>) => void;

function trustedHandle(startUrl: string): Handle {
  return (channel, handler) => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, argument: unknown) => {
      const senderUrl = event.senderFrame?.url ?? 'a destroyed frame';
      if (!isAppOrigin(senderUrl, startUrl)) {
        throw new UntrustedSenderError(channel, senderUrl);
      }
      return handler(argument, event.sender);
    });
  };
}

const shownNotifications = new Set<Notification>();

function showNotification(argument: unknown, onClick: () => void): void {
  const { title, body } = notificationSchema.parse(argument);
  if (!Notification.isSupported()) {
    throw new NotificationsUnsupportedError();
  }
  const notification = new Notification({ title, body });
  shownNotifications.add(notification);
  notification.on('click', onClick);
  notification.on('close', () => {
    shownNotifications.delete(notification);
  });
  notification.show();
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
  registerCaptureIpc(services.capture, handle);
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

function registerServiceIpc(services: IpcServices, handle: Handle): void {
  const { service } = services;
  handle('desktop:server', () => service.server());
  handle('desktop:service-status', () => service.status());
  handle('desktop:service-start', () => service.start());
  handle('desktop:service-stop', () => service.stop());
  handle('desktop:service-restart', () => service.restart());
  handle('desktop:service-uninstall', () => service.uninstall());
  handle('desktop:service-enable-linger', () => service.enableLinger());
  handle('desktop:service-logs', () => service.logs());
  handle('desktop:ffmpeg', () => services.ffmpeg());
}
