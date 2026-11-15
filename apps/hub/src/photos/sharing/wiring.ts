import type { Store } from '../../store/store';
import { AlbumActivityService } from './activity';
import { PartnerAutoSaver } from './auto-save';
import { SharedAlbumMembers } from './members';
import { PartnerSharing } from './partners';
import { SharingReader } from './reads';
import { photoSharingRoutes, type PhotoSharingRoutes } from './routes';
import { SavedAlbums } from './saved';
import { AlbumSeen } from './seen';

export interface SharingWiring {
  readonly store: Store;
  readonly now: () => Date;
}

export interface PhotoSharingHub {
  readonly routes: PhotoSharingRoutes;
  readonly autoSaver: PartnerAutoSaver;
  readonly reader: SharingReader;
}

export function photoSharing(wiring: SharingWiring): PhotoSharingHub {
  const { store } = wiring;
  const seen = new AlbumSeen(store);
  const saved = new SavedAlbums(store);
  const autoSaver = new PartnerAutoSaver(store, saved);
  const reader = new SharingReader(store, seen);
  const services = {
    reader,
    members: new SharedAlbumMembers(store, seen),
    activity: new AlbumActivityService(store, seen, wiring.now),
    partners: new PartnerSharing(store, saved, autoSaver),
  };
  autoSaver.start();
  return { routes: photoSharingRoutes(store, services), autoSaver, reader };
}
