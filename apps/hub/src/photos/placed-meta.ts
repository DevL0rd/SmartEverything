import type { StoreHost } from '../store/host/host';
import { MetaEditor } from './organise/meta';

export class PlacedMetaEditor extends MetaEditor {
  constructor(host: StoreHost) {
    super(host, true);
  }
}
