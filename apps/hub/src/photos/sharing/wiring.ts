import type { Store } from '../../store/store';
import { PartnerAutoSaveTrigger } from './auto-save';
import { photoSharingRoutes, type PhotoSharingRoutes } from './routes';

export interface SharingWiring {
  readonly store: Store;
}

export interface PhotoSharingHub {
  readonly routes: PhotoSharingRoutes;
  readonly autoSaver: PartnerAutoSaveTrigger;
}

export function photoSharing(wiring: SharingWiring): PhotoSharingHub {
  const { store } = wiring;
  const autoSaver = new PartnerAutoSaveTrigger(store.feed, () =>
    store.host.write('photoPartnerAutoSave', {}),
  );
  autoSaver.start();
  return { routes: photoSharingRoutes(store), autoSaver };
}
