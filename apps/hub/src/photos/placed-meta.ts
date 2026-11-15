import type { PhotoMetaPatch } from '@smarteverything/domain';
import type { DriveActor } from '../drive/access';
import type { Store } from '../store/store';
import { MetaEditor } from './organise/meta';
import type { ItemsChanged } from './organise/items';
import type { PlacesService } from './places';

export class PlacedMetaEditor extends MetaEditor {
  constructor(
    private readonly owner: Store,
    private readonly places: Pick<PlacesService, 'assign'>,
  ) {
    super(owner);
  }

  override edit(actor: DriveActor, patch: PhotoMetaPatch): ItemsChanged {
    return this.owner.write(() => {
      const changed = super.edit(actor, patch);
      if (patch.location !== undefined) {
        for (const itemId of patch.itemIds) this.places.assign(itemId);
      }
      return changed;
    });
  }
}
