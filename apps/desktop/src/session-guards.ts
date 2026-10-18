import { Logger } from '@smarteverything/logging';
import type { Session } from 'electron';
import { isPermissionGranted } from './permissions.js';

const log = new Logger('desktop.permissions');

export interface PermissionRequestDetails {
  readonly requestingUrl: string;
  readonly mediaTypes?: readonly string[] | undefined;
}

export function answerPermission(
  permission: string,
  details: PermissionRequestDetails,
  startUrl: string,
): boolean {
  const mediaTypes = details.mediaTypes ?? [];
  const granted = isPermissionGranted(
    { permission, requestingUrl: details.requestingUrl, mediaTypes },
    startUrl,
  );
  log.info('permission.requested', { permission, granted, mediaTypes });
  return granted;
}

export function restrictPermissions(session: Session, startUrl: string): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(answerPermission(permission, details, startUrl));
  });
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) =>
    isPermissionGranted(
      {
        permission,
        requestingUrl: requestingOrigin,
        mediaTypes: details.mediaType === undefined ? [] : [details.mediaType],
      },
      startUrl,
    ),
  );
}
