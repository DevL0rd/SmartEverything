import { HARNESS_EXTENSION_TREE } from '@smarteverything/domain';
import type { HarnessSkillAssetSource } from '../composition/skill-assets';
import type { HarnessHub } from './http';

export function hubExtensionSource(hub: Pick<HarnessHub, 'call'>): HarnessSkillAssetSource {
  return {
    read: (kind, asset) =>
      hub.call(
        { operation: 'extension_tree', kind, id: asset.id, version: asset.version },
        HARNESS_EXTENSION_TREE,
      ),
  };
}
