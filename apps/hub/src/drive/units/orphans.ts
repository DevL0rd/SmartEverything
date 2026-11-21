import { storeUnit } from '../../store/host/unit';

export const DRIVE_ORPHANS_SWEEP_UNIT = storeUnit((store, rootId: string) => {
  store.write(() => {
    for (const inode of store.driveInodes.orphans(rootId)) {
      store.driveInodes.remove(inode.id);
    }
  });
});
