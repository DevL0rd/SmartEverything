import { Logger } from '@smarteverything/logging';
import type { DesktopTray } from '../tray.js';
import { trayDriveOf, type DriveTrayLink } from '../tray-service.js';
import { DriveControlClient } from './control-client.js';
import { driveControlAddress } from './control-protocol.js';

const RETRY_MS = 2000;

export class DesktopDriveLink {
  readonly client: DriveControlClient;
  readonly tray: DriveTrayLink;
  private unfollow: (() => void) | null = null;

  constructor(dataDirectory: string) {
    this.client = new DriveControlClient({
      address: driveControlAddress(process.platform, dataDirectory),
      retryMs: RETRY_MS,
      log: new Logger('desktop.drive'),
    });
    this.tray = trayDriveOf(this.client);
    this.client.start();
  }

  follow(tray: DesktopTray): void {
    if (tray.drive !== undefined) this.unfollow = this.tray.follow(tray.drive);
  }

  stop(): void {
    this.unfollow?.();
    this.unfollow = null;
    this.client.stop();
  }
}
