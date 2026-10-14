import type { DesktopPlatform } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DesktopService } from './desktop-service.js';
import {
  confirmServiceInstall,
  offerLinger,
  showFfmpegMissing,
  showServiceFailure,
} from './dialogs.js';

const log = new Logger('desktop.service');

export type StartupOutcome = 'running' | 'declined' | 'failed';

async function lingerOnFirstInstall(service: DesktopService): Promise<void> {
  const status = await service.controller.status();
  if (status.linger !== 'disabled') {
    return;
  }
  if (await offerLinger(service.user)) {
    await service.controller.enableLinger();
    log.info('desktop.service.linger_enabled', { user: service.user });
  }
}

async function reportFailure(service: DesktopService, error: unknown): Promise<void> {
  log.error('desktop.service.start_failed', error);
  const logs = await service.controller.logs().catch((cause: unknown) => {
    log.error('desktop.service.logs_unreadable', cause);
    return { lines: [] };
  });
  showServiceFailure(error, logs.lines);
}

export interface StartupMode {
  readonly unattended: boolean;
}

async function acceptsInstall(
  platform: DesktopPlatform,
  service: DesktopService,
  mode: StartupMode,
): Promise<boolean> {
  if (mode.unattended) {
    log.info('desktop.service.unattended_install', {
      dataDirectory: service.controller.dataDirectory,
    });
    return true;
  }
  return confirmServiceInstall({
    platform,
    dataDirectory: service.controller.dataDirectory,
    ffmpeg: service.ffmpeg(),
  });
}

export async function startService(
  platform: DesktopPlatform,
  service: DesktopService,
  mode: StartupMode,
): Promise<StartupOutcome> {
  const { controller } = service;
  const node = (await controller.config()).role === 'node';
  const ffmpeg = service.ffmpeg();
  warnMedia(service, node);
  const before = await controller.status();
  const firstRun = before.health === 'not-installed';
  if (firstRun) {
    if (!(await acceptsInstall(platform, service, mode))) {
      return 'declined';
    }
  }
  if (!firstRun && !node && !ffmpeg.found) showFfmpegMissing(ffmpeg);
  try {
    if (!node) service.checkResources();
    const status = await controller.ensure();
    log.info('desktop.service.running', { url: status.url, manager: status.manager });
  } catch (error: unknown) {
    await reportFailure(service, error);
    return 'failed';
  }
  if (firstRun && !mode.unattended) {
    await lingerOnFirstInstall(service);
  }
  return 'running';
}

function warnMedia(service: DesktopService, node: boolean): void {
  if (!node && !service.ffmpeg().found)
    log.warn('desktop.ffmpeg.missing', { path: service.launch.path });
}
