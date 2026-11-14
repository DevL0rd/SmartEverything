import type { StoredDrive } from '../../store/repositories/drive-roots';
import { DrivePathError } from '../../drive/paths';
import { RootMarkerError, readRootMarker, type RootAvailability } from '../../drive/root-marker';

export function availabilityOf(): (drive: StoredDrive) => Promise<RootAvailability> {
  return async (drive) => {
    try {
      const marker = await readRootMarker(drive.path);
      return marker.id === drive.id ? 'online' : 'different';
    } catch (cause) {
      if (cause instanceof DrivePathError && cause.failure === 'missing') return 'missing';
      if (cause instanceof RootMarkerError) return 'different';
      throw cause;
    }
  };
}
