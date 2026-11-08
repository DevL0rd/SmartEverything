import { API_ENDPOINTS as E, type DrivePlacementSet } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { DRIVE_SETTINGS_PAGE, driveSettingsSection } from '../settings/sections';

const log = new Logger('app.drive');

export const MOUNT_TOPICS = ['drive_mounts'] as const;

export const MOUNT_LOG_HREF: AppHref = href.settings.page('server/diagnostics');

export const SYNC_MOUNT_SETTINGS_HREF: AppHref = href.settings.focus(
  DRIVE_SETTINGS_PAGE,
  driveSettingsSection('sync-mount').settingId,
);

export async function sendPlacements(
  bodies: readonly DrivePlacementSet[],
  event: string,
): Promise<void> {
  await Promise.all(bodies.map((body) => api().call(E.setPlacement, { body })));
  log.info(event, { folders: bodies.length, enabled: bodies[0]?.enabled });
}
