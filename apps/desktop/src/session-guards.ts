import type { Session } from 'electron';
import { isPermissionGranted } from './permissions.js';

export function restrictPermissions(session: Session, startUrl: string): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(
      isPermissionGranted(
        {
          permission,
          requestingUrl: details.requestingUrl,
          mediaTypes: 'mediaTypes' in details ? (details.mediaTypes ?? []) : [],
        },
        startUrl,
      ),
    );
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
