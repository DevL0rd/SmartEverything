import type { DriveRoot } from '@smarteverything/domain';
import type { HubLayout } from '../../data-layout';
import { DrivePathError } from '../../drive/paths';
import { RootMarkerError, linkedRootAvailability, readRootMarker } from '../../drive/root-marker';
import type { RootAvailability, VolumeProbe } from '../../drive/volumes';

export interface AvailabilityDeps {
  readonly layout: HubLayout;
  readonly probe: VolumeProbe;
}

async function markedAvailability(root: DriveRoot, path: string): Promise<RootAvailability> {
  try {
    const marker = await readRootMarker(path);
    return marker.id === root.id ? 'online' : 'different';
  } catch (cause) {
    if (cause instanceof DrivePathError && cause.failure === 'missing') return 'missing';
    if (cause instanceof RootMarkerError) return 'different';
    throw cause;
  }
}

export function availabilityOf(
  deps: AvailabilityDeps,
): (root: DriveRoot) => Promise<RootAvailability> {
  return (root) => {
    if (root.path === null) return Promise.resolve('online');
    return root.readOnly
      ? linkedRootAvailability(deps.layout, root.id, root.path, deps.probe)
      : markedAvailability(root, root.path);
  };
}
